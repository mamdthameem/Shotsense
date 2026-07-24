# Sense Shot Cloud

Cloud side of the Sense Shot system: a Firebase-hosted admin console that manages client
licenses and views each client's machine data **on demand** through that client's own
gateway API. It never connects to a client's PLC or database — each client installation is
an opaque box reached only over HTTP(S) at its static IP.

```
Admin browser ──(Firebase Auth)──► Firebase Hosting (React SPA)
     │  Firestore SDK (admin-only rules) ──► clients/{id} registry
     │  gatewayProxy (callable fn) ──X-Api-Key──► http(s)://<staticIp>/api/admin/{live|history}
Client app ──GET + X-License-Key──► licenseCheck (fn) ──► 200 / 402 / 403
```

- **No machine data is stored in the cloud.** `gatewayProxy` is a pure pass-through.
- **License status is derived** from each client's allocated expiry date at the moment it
  is checked — checks are driven by the client app, not a fixed poll.
- **Two keys per client** (both generated in the dashboard): the *License Key* the client
  sends to the cloud, and the *Admin API Key* the cloud sends to the client's gateway.

## Layout

| Path | What it is |
|---|---|
| `web/` | Admin SPA (Vite + React + TS + MUI) — mirrors the client dashboard's look |
| `functions/` | Cloud Functions: `licenseCheck` (HTTP) + `gatewayProxy` (callable), region `asia-south1` |
| `firestore.rules` | Admin-only access to `clients/`; `admins/` is console-managed |
| `scripts/mock-gateway.mjs` | Local stand-in for a client gateway (dev/testing) |

## Firestore model

- `clients/{clientId}` — name, staticIp, port, useTls, hostnameOverride, adminApiKey,
  licenseKey, licenseExpiresAt, graceDays, suspended,
  lastLicenseCheckAt, lastAdminContactAt, lastContactStatus, recentEvents (capped 20).
- `admins/{uid}` — presence marks a Firebase Auth user as admin. **Created manually in the
  Firebase console; there is no self-signup.**

## License endpoint contract

`GET https://asia-south1-<project>.cloudfunctions.net/licenseCheck?clientId=<id>` with
header `X-License-Key`. The caller treats any 2xx as licensed:

| Condition | Status | Body `status` |
|---|---|---|
| valid key, before expiry | 200 | `active` |
| valid key, within `graceDays` past expiry | 200 | `grace` |
| valid key, past expiry+grace or suspended | 402 | `expired` / `suspended` |
| unknown client or wrong key | 403 | — |

Renewal = an admin extends the expiry date in the dashboard. No payments anywhere.

## Local development (₹0, no Firebase project needed)

> The Firestore emulator needs **Java on PATH** — JDK 21+ for firebase-tools 14/15
> (older firebase-tools 13 accepts Java 11+).

```bash
npm install            # in functions/  and in web/
npm --prefix functions run build
firebase emulators:start                 # auth + firestore + functions + hosting UI on :4000
node scripts/mock-gateway.mjs            # fake client gateway on :8091, key "mock-api-key"
VITE_USE_EMULATORS=true npm --prefix web run dev
```

1. In the emulator UI (http://127.0.0.1:4000): add an Auth user (email+password), copy its
   UID, and create Firestore doc `admins/<uid>` with `{ email, createdAt }`.
2. Sign in to the SPA, add a client: static IP `127.0.0.1`, port `8091`, HTTPS off, and set
   its **Admin API Key** to `mock-api-key` (regenerate-then-overwrite or paste).
3. Open the client's dashboard — live data renders; stop the mock to see the
   "unreachable" state; change the key to see "auth failed".
4. Exercise the license endpoint (any 2xx = licensed):
   ```bash
   curl -i -H "X-License-Key: <licenseKey>" \
     "http://127.0.0.1:5001/demo-shotsense/asia-south1/licenseCheck?clientId=<id>"
   ```

## Deployment

Requires a Firebase project on the **Blaze** plan (Cloud Functions cannot be deployed on
Spark, and outbound calls to client gateways require Blaze). At this system's volumes the
usage sits far inside the free allowances, so the practical cost is ₹0 — but set a
**budget alert** (Google Cloud console → Billing → Budgets, e.g. ₹50) as a tripwire. Both
functions are capped with `maxInstances: 2` and short timeouts.

```bash
firebase login
firebase use <your-project-id>           # update .firebaserc
cp web/.env.example web/.env             # fill in the Firebase web app config
npm --prefix web run build
firebase deploy                          # rules + functions + hosting
```

First admin: Firebase console → Authentication → Add user, then Firestore →
`admins/<uid>` → `{ email: "...", createdAt: <now> }`.

## Onboarding a client installation

1. Dashboard → **Add Client**: name, static IP, port, expiry. Keys are generated
   automatically; the dialog shows the exact config snippet.
2. Configure the client installation with:
   - license check URL: `https://asia-south1-<project>.cloudfunctions.net/licenseCheck?clientId=<id>`
   - the **License Key** (sent as `X-License-Key`)
   - the **Admin API Key** (expected as `X-Api-Key` on `/api/admin/*`)
3. Note: the gateway-side IP allowlist for `/api/admin/*` cannot be used with Cloud
   Functions (no static egress IP on the free tier) — the per-client API key over HTTPS is
   the gate. If the gateway's TLS certificate is issued to a hostname, set the client's
   *Hostname Override* so certificate validation passes; otherwise use HTTP + key until
   TLS is set up.

## Free-tier guardrails

- Both functions: `maxInstances: 2`, 256 MiB, 15–20 s timeouts, auth on everything.
- History pulls default to 2,000 rows (gateway caps at 20,000) to keep egress negligible.
- The dashboard pulls machine data only on demand (plus an optional 30 s auto-refresh
  while a dashboard is open) — never a fast background poll.
