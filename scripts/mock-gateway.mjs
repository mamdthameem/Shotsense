#!/usr/bin/env node
/**
 * Dev-only stand-in for a client gateway's admin API, in the current
 * CONTRACT-admin-api.md shape (see sample-data.mjs). Lets the whole cloud
 * system be exercised locally with no real client:
 *
 *   node scripts/mock-gateway.mjs [port] [apiKey]
 *
 * Defaults: port 8091, apiKey "mock-api-key". Set MOCK_IMPELLERS="1,2,3" to
 * change which impellers are shown (default hides 7, 9 and 10). Serves:
 *   GET  /api/admin/live     → full live snapshot
 *   GET  /api/admin/trends   → bucket=hour|day|month, empty days included
 *   POST /api/admin/filter   → synchronous Section 2 result (becomes the
 *                              "latest" section2 in /live, like the real one)
 *   GET  /api/admin/history  → sine-wave series between from/to
 * Every route requires the X-Api-Key header to match, like the real gateway.
 */
import http from 'node:http';
import { buildHistory, buildLive, buildSection2, buildTrends, DEFAULT_SELECTED } from './sample-data.mjs';

const port = Number(process.argv[2] ?? 8091);
const apiKey = process.argv[3] ?? 'mock-api-key';
const selected = process.env.MOCK_IMPELLERS
  ? process.env.MOCK_IMPELLERS.split(',').map(Number).filter(n => n >= 1 && n <= 10)
  : DEFAULT_SELECTED;

let latestSection2 = null; // set by POST /filter, shown by /live afterwards
let nextRequestId = 43;

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => { data += chunk; });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

/** Same validation rules as the contract's POST /api/admin/filter. Returns an error string or null. */
function filterError(f) {
  if (!f || !['time', 'cycle', 'metal'].includes(f.filterBy)) return 'filterBy must be time, cycle or metal';
  if (f.filterBy === 'time') {
    const s = Date.parse(f.filterStart), e = Date.parse(f.filterEnd);
    if (!Number.isFinite(s) || !Number.isFinite(e)) return 'filterStart and filterEnd are required';
    if (s >= e) return 'filterStart must be before filterEnd';
  }
  if (f.filterBy === 'cycle') {
    if (!Number.isInteger(f.filterCycleFrom) || !Number.isInteger(f.filterCycleTo)) return 'filterCycleFrom and filterCycleTo are required';
    if (f.filterCycleFrom > f.filterCycleTo) return 'filterCycleFrom must be <= filterCycleTo';
  }
  if (f.filterBy === 'metal' && !(typeof f.filterMetalName === 'string' && f.filterMetalName.trim())) {
    return 'filterMetalName is required';
  }
  return null;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost:${port}`);
  const send = (status, body) => {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(body));
  };

  console.log(`[mock-gateway] ${req.method} ${url.pathname}${url.search}`);

  if (req.headers['x-api-key'] !== apiKey) {
    send(403, { error: 'forbidden' });
    return;
  }

  const route = `${req.method} ${url.pathname}`;
  try {
    if (route === 'GET /api/admin/live') {
      const now = Date.now();
      send(200, buildLive(now, { selected, section2: latestSection2 ?? buildSection2(now, null, 42, selected) }));
      return;
    }
    if (route === 'GET /api/admin/trends') {
      const bucket = url.searchParams.get('bucket') ?? 'day';
      const start = url.searchParams.get('start') ?? undefined;
      const end = url.searchParams.get('end') ?? undefined;
      if (!['hour', 'day', 'month'].includes(bucket)) { send(400, { error: 'invalid bucket' }); return; }
      if (bucket === 'hour' && (!start || !end)) { send(400, { error: 'bucket=hour requires start and end' }); return; }
      if (start && end && Date.parse(start) >= Date.parse(end)) { send(400, { error: 'start must be before end' }); return; }
      send(200, buildTrends(Date.now(), { bucket, start, end }));
      return;
    }
    if (route === 'POST /api/admin/filter') {
      let body;
      try {
        body = JSON.parse(await readBody(req));
      } catch {
        send(400, { error: 'body must be JSON' });
        return;
      }
      const error = filterError(body);
      if (error) { send(400, { error }); return; }
      latestSection2 = buildSection2(Date.now(), body, nextRequestId++, selected);
      send(200, latestSection2);
      return;
    }
    if (route === 'GET /api/admin/history') {
      if (!url.searchParams.get('metric')) { send(400, { error: 'metric is required' }); return; }
      send(200, buildHistory(url.searchParams));
      return;
    }
    send(404, { error: 'not found' });
  } catch (err) {
    console.error('[mock-gateway] failed:', err);
    send(500, { error: 'mock gateway failure' });
  }
});

server.listen(port, () => {
  console.log(`[mock-gateway] listening on http://127.0.0.1:${port}`);
  console.log(`[mock-gateway] X-Api-Key: ${apiKey} · impellers shown: ${selected.join(', ')}`);
  console.log('[mock-gateway] register a client with address http://127.0.0.1:' + port);
  console.log('[mock-gateway] and set its Admin API Key to the value above.');
});
