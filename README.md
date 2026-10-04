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
          4. calls https://<gateway>/api/admin/{live|trends|filter|history|amps/by-cycle|filter/{id}/amps}
             with X-Api-Key
          5. passes the JSON back unchanged (plus the X-Trend-Bucket header's value for trends)

Client gateway ──GET + X-License-Key──► licenseCheck (Cloud Function) ──► 200 / 402 / 403
```

- **The browser never talks to a gateway.** It only sends a client ID to `gatewayProxy`; the
  address and API key never leave the server.
- **HTTPS only.** `gatewayProxy` refuses plain `http://` for every gateway. It never follows
  redirects, so the API key cannot be sent anywhere else.
- **No machine data is stored in the cloud.** Every value is the gateway's own number, never
  recalculated (see [CONTRACT-admin-api.md](CONTRACT-admin-api.md)). It is only formatted to match
  the gateway's dashboard — units, fixed decimals, thousands separators, seconds as `23h 32m`, and
  times in plant time (IST) as `14/05/2026, 15:29:33`.
- **Filters run only when an admin presses Apply.** The client page never shows the gateway's own
  latest filtered calculation (`section2` in `/live`).
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
| live, history | 8 s | history is proxied but nothing in the website calls it |
| trends | 15 s | always `bucket=auto`, one call per chart opened (as on the gateway's own dashboard) |
| amps/by-cycle, filter/{id}/amps | 15 s | when an impeller chart is opened |
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

**If the deploy stops at "Cannot determine backend specification. Timeout after 10000":** nothing
was deployed, and it is not a code fault. To list the functions it deploys, the CLI starts
`functions/lib/index.js` in a new process and asks it for the list, allowing 10 seconds; a cold
start on Windows (a virus scanner reading the files `tsc` has just written) can take longer. Give
it more time and run it again — in PowerShell:

```powershell
$env:FUNCTIONS_DISCOVERY_TIMEOUT = 60
firebase deploy
```

Add `--dry-run` to check a deploy without shipping anything.

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
- The client page does not read `/api/admin/history`; `gatewayProxy` still proxies it, capped at
  20,000 rows a page.
- Machine data is pulled only when a dashboard is open (plus an optional 30 s auto-refresh).
