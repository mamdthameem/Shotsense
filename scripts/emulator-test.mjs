#!/usr/bin/env node
/**
 * Emulator-only test helper. Talks ONLY to the local emulators on 127.0.0.1 —
 * it cannot touch the real Firebase project.
 *
 *   node scripts/emulator-test.mjs --url <gateway address> --key <Admin API key> [--name "Tunnel test"] [--id tunnel-test]
 *
 * 1. Creates (or reuses) a test admin login in the Auth emulator and its
 *    admins/<uid> document.
 * 2. Adds (or updates) a client with that gateway address and API key.
 * 3. Signs in and calls gatewayProxy exactly like the browser does (live,
 *    then trends), and prints what came back — so the whole chain
 *    login → admin check → server-side key lookup → X-Api-Key → gateway
 *    is checked end to end, and the real payload shape is visible.
 *
 * Needs: firebase emulators:start (auth, firestore, functions) running.
 */
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const PROJECT = JSON.parse(readFileSync(join(root, '.firebaserc'), 'utf8')).projects.default;
const REGION = 'asia-south1';
const AUTH = 'http://127.0.0.1:9099';
const FIRESTORE = `http://127.0.0.1:8080/v1/projects/${PROJECT}/databases/(default)/documents`;
const FUNCTIONS = `http://127.0.0.1:5001/${PROJECT}/${REGION}`;
const OWNER = { Authorization: 'Bearer owner' }; // emulator-only: bypasses rules for seeding

const EMAIL = 'admin@shotsense.test';
const PASSWORD = 'emulator-only-123';

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const gatewayUrl = arg('url');
const apiKey = arg('key');
const clientId = arg('id', 'tunnel-test');
const clientName = arg('name', 'Tunnel test');
if (!gatewayUrl || !apiKey) {
  console.error('Usage: node scripts/emulator-test.mjs --url <gateway address> --key <Admin API key> [--name ...] [--id ...]');
  process.exit(1);
}

async function json(url, init = {}) {
  const res = await fetch(url, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) },
    body: init.body ? JSON.stringify(init.body) : undefined,
  });
  const text = await res.text();
  let body;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  return { status: res.status, body };
}

async function emulatorsUp() {
  for (const [name, url] of [['Auth', AUTH], ['Firestore', 'http://127.0.0.1:8080'], ['Functions', 'http://127.0.0.1:5001']]) {
    try {
      await fetch(url, { signal: AbortSignal.timeout(3000) });
    } catch {
      throw new Error(`${name} emulator is not running on ${url}. Start them first: firebase emulators:start`);
    }
  }
}

/** Create the test admin login, or sign in if it already exists. Returns { uid, idToken }. */
async function adminLogin() {
  const base = `${AUTH}/identitytoolkit.googleapis.com/v1/accounts`;
  const creds = { email: EMAIL, password: PASSWORD, returnSecureToken: true };
  let r = await json(`${base}:signUp?key=emulator`, { method: 'POST', body: creds });
  if (r.status !== 200) r = await json(`${base}:signInWithPassword?key=emulator`, { method: 'POST', body: creds });
  if (r.status !== 200) throw new Error(`Auth emulator login failed: ${JSON.stringify(r.body)}`);
  return { uid: r.body.localId, idToken: r.body.idToken };
}

const str = (v) => ({ stringValue: v });
const ts = (d) => ({ timestampValue: d.toISOString() });

async function writeDoc(path, fields) {
  const r = await json(`${FIRESTORE}/${path}`, { method: 'PATCH', headers: OWNER, body: { fields } });
  if (r.status !== 200) throw new Error(`Writing ${path} failed: ${JSON.stringify(r.body)}`);
}

function parseGateway(address) {
  const u = new URL(/^https?:\/\//i.test(address) ? address : `https://${address}`);
  const useTls = u.protocol === 'https:';
  return { host: u.hostname, port: Number(u.port || (useTls ? 443 : 80)), useTls };
}

async function callProxy(idToken, data) {
  const r = await json(`${FUNCTIONS}/gatewayProxy`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${idToken}` },
    body: { data },
  });
  if (r.body?.error) return { callError: r.body.error };
  return r.body?.result;
}

function summarizeLive(d) {
  const lines = [];
  lines.push(`top-level fields : ${Object.keys(d).join(', ')}`);
  lines.push(`PLC connected    : ${d.plcConnected} · machine running: ${d.machineStatus?.running ?? '—'}`);
  lines.push(`impellers        : ${JSON.stringify(d.impellers ?? '(not sent)')}`);
  lines.push(`amps             : ${d.amps?.length ?? 0} → ${(d.amps ?? []).map(a => `${a.parameterName}=${a.value}`).join(', ')}`);
  lines.push(`spareGrid rows   : ${d.spareGrid?.length ?? 0} · alerts: ${d.spareAlerts?.length ?? 0}`);
  lines.push('lifetime         :');
  for (const p of d.lifetime ?? []) lines.push(`    ${p.parameterName.padEnd(26)} "${p.value}"`);
  if (d.section2) {
    lines.push(`section2         : request #${d.section2.requestId}, fields: ${Object.keys(d.section2).join(', ')}`);
  } else {
    lines.push('section2         : null (no completed filter yet)');
  }
  return lines.join('\n');
}

async function main() {
  await emulatorsUp();

  const { uid, idToken } = await adminLogin();
  await writeDoc(`admins/${uid}`, { email: str(EMAIL), createdAt: ts(new Date()) });
  console.log(`✓ admin login ready: ${EMAIL} / ${PASSWORD} (uid ${uid})`);

  const existing = await json(`${FIRESTORE}/clients/${clientId}`, { headers: OWNER });
  const licenseKey = existing.body?.fields?.licenseKey?.stringValue ?? randomBytes(32).toString('hex');
  const gw = parseGateway(gatewayUrl);
  const now = new Date();
  await writeDoc(`clients/${clientId}`, {
    name: str(clientName),
    staticIp: str(gw.host),
    port: { integerValue: String(gw.port) },
    useTls: { booleanValue: gw.useTls },
    hostnameOverride: { nullValue: null },
    adminApiKey: str(apiKey),
    licenseKey: str(licenseKey),
    licenseExpiresAt: ts(new Date(now.getTime() + 30 * 864e5)),
    graceDays: { integerValue: '0' },
    suspended: { booleanValue: false },
    lastLicenseCheckAt: { nullValue: null },
    lastAdminContactAt: { nullValue: null },
    lastContactStatus: { nullValue: null },
    recentEvents: { arrayValue: {} },
    createdAt: existing.status === 200 ? existing.body.fields.createdAt : ts(now),
    updatedAt: ts(now),
  });
  console.log(`✓ client "${clientName}" saved as clients/${clientId} → ${gw.useTls ? 'https' : 'http'}://${gw.host}:${gw.port}`);

  console.log('\n… calling gatewayProxy (live) the same way the browser does');
  const live = await callProxy(idToken, { clientId, view: 'live' });
  if (!live || live.callError) {
    console.log('✗ the function refused the call:', JSON.stringify(live?.callError ?? live));
    process.exitCode = 1;
    return;
  }
  if (!live.ok) {
    console.log(`✗ gateway call failed: ${live.reason}${live.status ? ` (HTTP ${live.status})` : ''} — ${live.message ?? ''}`);
    process.exitCode = 1;
    return;
  }
  console.log('✓ LIVE DATA RECEIVED\n' + summarizeLive(live.data));

  for (const bucket of ['month', 'day']) {
    const t = await callProxy(idToken, { clientId, view: 'trends', trendsQuery: { bucket } });
    if (t?.ok) {
      const empty = t.data.filter(p => !p.cycleCount && !p.machineOnSec).length;
      console.log(`✓ trends (${bucket}): ${t.data.length} entries, ${empty} empty` +
        (t.data[0] ? ` · first entry fields: ${Object.keys(t.data[0]).join(', ')}` : ''));
    } else {
      console.log(`✗ trends (${bucket}): ${JSON.stringify(t?.callError ?? t)}`);
    }
  }

  console.log(`\nOpen http://localhost:5173, log in as ${EMAIL} / ${PASSWORD}, and open "${clientName}".`);
  console.log(`License check for this client (emulator): ${FUNCTIONS}/licenseCheck?clientId=${clientId}`);
}

main().catch(err => {
  console.error('✗', err.message);
  process.exit(1);
});
