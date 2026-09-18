# Sense Shot Cloud

The cloud side of Sense Shot: a Firebase admin website that manages client licences and shows
each client's machine data **on demand**, fetched from that client's own gateway. The cloud never
stores machine data and never talks to a PLC or database — each client's gateway is reached only
over HTTPS.

## How it works

```
Admin browser ──(email/password login)──► Firebase Hosting (React app)
   │  reads/writes clients/ in Firestore (admins only)
   │
   └─► gatewayProxy (Cloud Function)
          1. Firebase checks the login token
          2. requires an admins/<uid> document
          3. reads the client's gateway address + API key from Firestore (server side)
          4. calls https://<gateway>/api/admin/{live|trends|filter|history} with X-Api-Key
          5. passes the JSON back unchanged

Client gateway ──GET + X-License-Key──► licenseCheck (Cloud Function) ──► 200 / 402 / 403
```

- **The browser never talks to a gateway.** It only sends a client ID to `gatewayProxy`; the
  address and API key never leave the server.
- **HTTPS only.** `gatewayProxy` refuses plain `http://` for every gateway. It never follows
  redirects, so the API key cannot be sent anywhere else.
- **No machine data is stored in the cloud.** Values are shown exactly as the gateway sends them —
  never rounded, converted or recalculated (see [CONTRACT-admin-api.md](CONTRACT-admin-api.md)).
- **Two keys per client**, both generated in the dashboard: the *License Key* (gateway → cloud)
  and the *Admin API Key* (cloud → gateway).

## Layout

| Path | What it is |
|---|---|
| `web/` | Admin website (Vite + React + TypeScript + MUI) |
| `functions/` | Cloud Functions `licenseCheck` (HTTP) and `gatewayProxy` (callable), region `asia-south1` |
| `firestore.rules` | Only admins can use `clients/`; `admins/` can only be changed in the Firebase console |

## Firestore data

- `clients/{clientId}` — name, staticIp (IP or hostname), port, useTls, hostnameOverride,
  adminApiKey, licenseKey, licenseExpiresAt, graceDays, suspended, lastLicenseCheckAt,
  lastAdminContactAt, lastContactStatus, recentEvents (last 20).
- `admins/{uid}` — if this document exists, that login is an admin. **Created by hand in the
  Firebase console. There is no sign-up.**

## Licence check

`GET https://asia-south1-shotsense-13b1f.cloudfunctions.net/licenseCheck?clientId=<id>` with header
`X-License-Key`. The gateway treats any 2xx as licensed:

| Situation | Status | Body `status` |
|---|---|---|
| right key, before expiry | 200 | `active` |
| right key, within `graceDays` after expiry | 200 | `grace` |
| right key, expired or suspended | 402 | `expired` / `suspended` |
| unknown client or wrong key | 403 | — |

Renewing = an admin moves the expiry date in the dashboard.

## Timeouts

| Call | Gateway wait | Notes |
|---|---|---|
| live, history | 8 s | |
| trends | 15 s | fetched once per dashboard load (monthly + daily) |
| filter | **60 s** | function limit 75 s, browser limit 80 s, Cloudflare's own limit 100 s |

Replies larger than 10 MB are refused (use a shorter filter window).

## Running the website on your PC

```bash
npm install --prefix functions && npm install --prefix web     # first time only
cp web/.env.example web/.env                                   # then fill in the web app config
npm --prefix web run dev                                       # → http://localhost:5173
```

There are no emulators or test data: the local website signs in with the **real** logins and
reads and writes the **real** database and gateways, exactly like the live site. Anything you
change there changes the live system.

## Deploying

The project `shotsense-13b1f` is on the **Blaze** plan (needed for Cloud Functions and for calling
gateways). At this system's volumes the cost is ₹0, but keep a **budget alert** as a tripwire.

One-time setup in the Firebase console:
1. **Firestore** → Create database → location **asia-south1** (cannot be changed later).
2. **Authentication** → Get started → Sign-in method → **Email/Password** → Enable.
3. **Authentication** → Users → Add user (your email + a strong password). Copy its **User UID**.
4. **Firestore** → Start collection `admins` → Document ID = that UID → fields
   `email` (string), `createdAt` (timestamp).

Then:

```bash
firebase deploy     # builds functions + web automatically, then deploys rules, functions and hosting
```

`web/.env` must hold the real web-app config.

## Adding a client

1. Dashboard → **Add Client**: name, gateway address (an IP, a hostname, or a full
   `https://...` address such as a Cloudflare tunnel), expiry. Keys are generated for you, and the
   dialog shows the exact settings to paste into the gateway.
2. On the gateway set `License:CheckUrl`, `License:Key` and `Admin:ApiKey` from that snippet.
3. The gateway must be reachable over **HTTPS**. If its certificate is issued to a hostname but you
   enter an IP, set *Hostname Override*. A Cloudflare tunnel gives HTTPS without a certificate of
   your own.

## Free-tier guardrails

- Both functions: at most 2 instances, 256 MiB, short timeouts, login required for `gatewayProxy`.
- History pulls default to 2,000 rows (gateway maximum 20,000).
- Machine data is pulled only when a dashboard is open (plus an optional 30 s auto-refresh).
