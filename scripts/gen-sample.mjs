#!/usr/bin/env node
/**
 * Writes the dashboard's fixture files — a full /api/admin/live payload and
 * both trend series, in the current contract shape (see sample-data.mjs) —
 * into web/public/ so the dev server can render a dashboard with no gateway:
 *
 *   node scripts/gen-sample.mjs
 *   npm --prefix web run dev   →  /clients/any-id?fixture=1
 *
 * The files are generated, so they are git-ignored and kept out of hosting.
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { buildLive, buildTrends } from './sample-data.mjs';

const publicDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'web', 'public');
const now = Date.now();

const live = buildLive(now);
const trends = { day: buildTrends(now, { bucket: 'day' }), month: buildTrends(now, { bucket: 'month' }) };

writeFileSync(join(publicDir, 'sample-response.json'), JSON.stringify(live, null, 2));
writeFileSync(join(publicDir, 'sample-trends.json'), JSON.stringify(trends, null, 2));

console.log(
  `web/public/sample-response.json written (impellers ${live.impellers.selected.join(', ')}; ` +
    `${live.spareGrid.length} spare rows, ${live.amps.length} amps, ${live.section2.cycles.length} cycles).`
);
console.log(`web/public/sample-trends.json written (${trends.day.length} days, ${trends.month.length} months).`);
