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
          4. calls https://<gateway>/api/admin/{live|trends|filter|amps/by-cycle|filter/{id}/amps}
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
- **Filters run only when an admin presses Apply, and belong to that browser tab.** The applied
  filter and the gateway's result id live in the page URL (`?filter=time&period=day&…&result=124`,
  see `web/src/utils/filterUrl.ts`), never in Firestore, so two admins on the same client cannot
  change each other's view. A refresh reopens the result by id (`GET /api/admin/filter/{id}`)
  without recomputing. The gateway no longer sends `section2` in `/live` (2026-10-12); the page
  drops it even from an older gateway.
- **Impeller selection is decided here, and only here.** The buttons in a client's Impeller Current
  header (any admin) save through `gatewayProxy` view `set-impellers` →
  `PUT /api/admin/settings/impellers`; the gateway recalculates all recorded energy before it
  answers. The gateway's own dashboard has no buttons for it (since 2026-10-13).
- **"Unreachable" means unreachable.** A gateway that answers, even with an error, counts as
  reached; only a network failure, or a tunnel that cannot reach the gateway behind it, marks a
  client unreachable in the client list.
- **Two keys per client**, both generated in the dashboard: the *License Key* (gateway → cloud)
  and the *Admin API Key* (cloud → gateway).

## Layout

| Path | What it is |
|---|---|
| `web/` | Admin website (Vite + React + TypeScript + MUI) |
| `functions/` | Cloud Functions `licenseCheck` (HTTP), `gatewayProxy` and the client-user callables, region `asia-south1` |
| `firestore.rules` | Only admins can use `clients/`; `admins/` and `clientUsers/` can only be changed from the console or a function |

## Firestore data

- `clients/{clientId}` — name, staticIp (IP or hostname), port, useTls, hostnameOverride,
  adminApiKey, licenseKey, licenseExpiresAt, graceDays, suspended, lastLicenseCheckAt,
  lastAdminContactAt, lastContactStatus, recentEvents (last 20).
- `admins/{uid}` — if this document exists, that login is a cloud admin. **Created by hand in the
  Firebase console. There is no sign-up.** Every cloud admin has the same access: clients, keys,
  impeller selection and client logins. There is no higher level.
- `clientUsers/{uid}` — the readable copy of a client company's logins: name, email, clientId,
  role, disabled. Written only by the Cloud Functions below; readable by any cloud admin.
  **Access itself never comes from here** — it comes from the custom claims on the account.

## Client logins

A client company's own people sign in **to their own gateway's dashboard** with Firebase
Authentication (email and password). They never sign in to this website, which turns away any
account without an `admins/{uid}` document. Each account carries two **custom claims**, which
travel inside the signed ID token so the gateway can trust them without a database read:

| Claim | Value | Meaning |
|---|---|---|
| `clientId` | a client's id | the company whose gateway this person may use; any other gateway refuses them |
| `role` | `admin` or `viewer` | shown on the gateway; kept for gateway settings that only an admin may change |

**No password is ever visible to anyone here.** An account is created without one, and the person
sets their own from a link Firebase emails them. Nobody — including a cloud admin — can read or
choose someone else's password; the only thing available is "send them a fresh link".

`clientUsers/{uid}` mirrors the account for listing, because Firebase Auth cannot answer "who
belongs to client X". The claims decide access; the document is only for display.

### Managing users

Any cloud admin opens a client's dashboard → **Users**: list, add, change role, disable or
re-enable, and send a fresh password link. Each action is a callable Cloud Function that refuses
anyone who is not a cloud admin, and refuses to touch a cloud admin's own account:

| Function | Does |
|---|---|
| `createClientUser` | creates the account, sets its claims, writes `clientUsers/{uid}`, returns a password link |
| `listClientUsers` | every login for one client, with its live status from Firebase Auth |
| `disableClientUser` / `enableClientUser` | blocks or restores sign-in; disabling also revokes live sessions |
| `changeUserRole` | moves a user between `admin` and `viewer`, keeping their `clientId` |
| `sendPasswordReset` | a fresh "set your password" link for one user |

**The email itself is sent by Firebase**, triggered from the dashboard: Firebase's mailer is the
only one this project has, and only the browser SDK can trigger it. Each call also returns the
link, which the page offers as "Copy link" whenever the email does not go out.

In the console, check **Authentication → Templates → Password reset**: the sender name and the
message are what a client's staff will receive. Nothing else needs changing — Email/Password is
already enabled, and the hosting domain is already an authorized domain.

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
| live | 8 s | |
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
- `gatewayProxy` proxies only the five calls the client page makes. The gateway's
  `/api/admin/history` is not among them — nothing here reads raw tag history.
- Machine data is pulled only when a dashboard is open (plus an optional 30 s auto-refresh).
