#!/usr/bin/env node
/**
 * Dev-only stand-in for a client installation's admin API. Lets the whole
 * cloud system be exercised locally with zero real clients:
 *
 *   node scripts/mock-gateway.mjs [port] [apiKey]
 *
 * Defaults: port 8091, apiKey "mock-api-key". Serves:
 *   GET /api/admin/live     → sample live snapshot
 *   GET /api/admin/history  → generated sine-wave series between from/to
 * Both require the X-Api-Key header to match, mirroring the real gateway.
 */
import http from 'node:http';

const port = Number(process.argv[2] ?? 8091);
const apiKey = process.argv[3] ?? 'mock-api-key';

const startedAt = Date.now();

function liveResponse() {
  const now = new Date();
  return {
    plcConnected: true,
    lastScanAt: now.toISOString(),
    changedAt: new Date(startedAt).toISOString(),
    lifetime: [
      { parameter: 'machine_utility_pct', value: 72.41, updatedAt: now.toISOString() },
      { parameter: 'production_qty_kg', value: 158430.25, updatedAt: now.toISOString() },
      { parameter: 'energy_kwh_total', value: 90312.108, updatedAt: now.toISOString() },
      { parameter: 'energy_per_casting_kwh_kg', value: 0.5701, updatedAt: now.toISOString() },
      { parameter: 'blast_time_sec', value: 5423000, updatedAt: now.toISOString() },
      { parameter: 'cycle_count', value: 18342, updatedAt: now.toISOString() },
    ],
    spareAlerts: [
      { impeller: 3, spareIndex: 1, spareName: 'Blade Set', runHours: 512.4, thresholdHours: 500 },
      { impeller: 7, spareIndex: 2, spareName: 'Liner', runHours: 1015.0, thresholdHours: 1000 },
    ],
  };
}

function historyResponse(query) {
  const metric = query.get('metric') ?? 'unknown';
  const from = new Date(query.get('from') ?? Date.now() - 86400000);
  const to = new Date(query.get('to') ?? Date.now());
  const limit = Math.min(Number(query.get('limit') ?? 5000), 20000);
  const offset = Number(query.get('offset') ?? 0);

  const points = [];
  const stepMs = Math.max(60_000, (to.getTime() - from.getTime()) / 500);
  for (let t = from.getTime(), i = 0; t <= to.getTime() && points.length < limit; t += stepMs, i++) {
    if (i < offset) continue;
    const value = 50 + 25 * Math.sin(t / 7.2e6) + 5 * Math.sin(t / 9.1e5);
    points.push({ value: value.toFixed(3), timestamp: new Date(t).toISOString(), reason: 'COV' });
  }
  return {
    metric,
    from: from.toISOString(),
    to: to.toISOString(),
    count: points.length,
    limit,
    offset,
    points,
  };
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost:${port}`);
  const send = (status, body) => {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(body));
  };

  console.log(`[mock-gateway] ${req.method} ${url.pathname}${url.search}`);

  if (req.headers['x-api-key'] !== apiKey) {
    send(403, { error: 'forbidden' });
    return;
  }
  if (req.method !== 'GET') {
    send(405, { error: 'method not allowed' });
    return;
  }
  if (url.pathname === '/api/admin/live') {
    send(200, liveResponse());
    return;
  }
  if (url.pathname === '/api/admin/history') {
    if (!url.searchParams.get('metric')) {
      send(400, { error: 'metric is required' });
      return;
    }
    send(200, historyResponse(url.searchParams));
    return;
  }
  send(404, { error: 'not found' });
});

server.listen(port, () => {
  console.log(`[mock-gateway] listening on http://127.0.0.1:${port}`);
  console.log(`[mock-gateway] X-Api-Key: ${apiKey}`);
  console.log('[mock-gateway] register a client with staticIp 127.0.0.1, this port, HTTPS off,');
  console.log('[mock-gateway] and set its Admin API Key to the value above.');
});
