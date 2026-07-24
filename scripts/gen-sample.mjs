#!/usr/bin/env node
/**
 * Generates sample-response.json — a full /api/admin/live payload in exactly the
 * shape of CONTRACT-admin-api.md, with realistic dummy values (all 140 spareGrid
 * rows, lexicographic amps ordering). Written to the repo root (the fixture the
 * contract references) and copied into web/public/ so the SPA can load it with
 * ?fixture=1 and no live gateway.
 *
 *   node scripts/gen-sample.mjs
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const iso = (ms) => new Date(ms).toISOString();
const now = Date.now();

// Spare names by index (contract order).
const SPARE_NAMES = [
  'Blade', 'Blade Mounting Piece', 'Narrow Plate', 'Curved Plate', 'Feeding End',
  'Bearing End', 'Impeller', 'Wall Plate', 'Control Gauge', 'Disc Spacer',
  'Doom Nut 1/2in', 'Doom Nut 5/8', 'Disc', 'Guide Plate',
];

// A few triggered spares so spareAlerts is non-empty.
const TRIGGERED = new Set(['3-0', '7-6', '10-13']);

const spareGrid = [];
for (let imp = 1; imp <= 10; imp++) {
  for (let idx = 0; idx <= 13; idx++) {
    const key = `${imp}-${idx}`;
    const notMonitored = idx === 9; // Disc Spacer — threshold 0 per contract
    const thresholdHours = notMonitored ? 0 : 500 + idx * 50;
    const triggered = TRIGGERED.has(key);
    const currentRunHours = triggered
      ? thresholdHours + 12.4 + imp
      : Math.round((thresholdHours * 0.55 + imp * 3) * 10) / 10;
    spareGrid.push({
      impellerNum: imp,
      spareIndex: idx,
      spareName: SPARE_NAMES[idx],
      thresholdHours,
      currentRunHours,
      triggerActive: triggered,
      lastReplacedAt: key === '1-0' ? iso(now - 6 * 3600e3) : null,
      lastUpdatedAt: iso(now - (imp * 14 + idx) * 1000),
    });
  }
}
const spareAlerts = spareGrid.filter(r => r.triggerActive && r.thresholdHours > 0);

// Amps — 10 impellers, ordered LEXICOGRAPHICALLY by parameterName (contract).
const amps = Array.from({ length: 10 }, (_, i) => {
  const n = i + 1;
  return {
    parameterName: `Current_imp_${n}`,
    value: (18 + Math.sin(n) * 6).toFixed(2),
    lastUpdated: iso(now - n * 250),
  };
}).sort((a, b) => a.parameterName.localeCompare(b.parameterName));

// Lifetime — nine params, ascending by parameterName. Values are decimal-text strings.
const lifetime = [
  { parameterName: 'avg_shot_refill_time_sec', value: '412.5' },
  { parameterName: 'blast_time_sec', value: '5423000.0' },
  { parameterName: 'cycle_count', value: '18342' },
  { parameterName: 'energy_kwh_total', value: '90312.108' },
  { parameterName: 'energy_per_casting_kwh_kg', value: '0.5701' },
  { parameterName: 'last_refill_epoch_sec', value: '1782560000' },
  { parameterName: 'machine_status', value: '1' },
  { parameterName: 'machine_utility_pct', value: '72.41' },
  { parameterName: 'production_qty_kg', value: '158430.25' },
].map(p => ({ ...p, updatedAt: iso(now - 60_000) }));

// Shots breakdown — ascending by refillTimestamp.
const shotsBreakdown = Array.from({ length: 8 }, (_, i) => ({
  refillTimestamp: iso(now - (8 - i) * 36 * 3600e3),
  blastCount: 40 + ((i * 7) % 25),
}));

// Section 2 — latest completed filtered calculation.
const cycles = Array.from({ length: 12 }, (_, i) => {
  const n = 18331 + i;
  const start = now - (12 - i) * 3 * 3600e3;
  return {
    cycleNumber: n,
    blastStart: iso(start),
    blastEnd: iso(start + 90 * 60e3),
    metal1Name: 'Cast Iron',
    metal2Name: i % 3 === 0 ? 'Steel Scrap' : null,
    metal3Name: null,
    metal4Name: null,
    metal1WeightKg: 620 + i * 3,
    metal2WeightKg: i % 3 === 0 ? 140 + i : null,
    metal3WeightKg: null,
    metal4WeightKg: null,
    productionKg: Math.round((740 + Math.sin(i) * 60) * 100) / 100,
    energyKwh: Math.round((410 + Math.cos(i) * 35) * 1000) / 1000,
    shotsUsage: Math.round((0.18 + Math.sin(i) * 0.03) * 10000) / 10000,
  };
});

const section2 = {
  requestId: 42,
  filterBy: 'time',
  filterStart: iso(now - 36 * 3600e3),
  filterEnd: iso(now),
  periodLabel: 'today',
  filterCycleFrom: null,
  filterCycleTo: null,
  filterMetalName: null,
  processedAt: iso(now - 5 * 60e3),
  results: [
    { parameterName: 'blast_time_sec', value: '64800.0' },
    { parameterName: 'cycle_count', value: '12' },
    { parameterName: 'energy_kwh_total', value: '4921.500' },
    { parameterName: 'energy_per_casting_kwh_kg', value: '0.5540' },
    { parameterName: 'machine_utility_pct', value: '68.90' },
  ],
  cycles,
  shotsBreakdown: shotsBreakdown.slice(-4),
};

const payload = {
  generatedAtUtc: iso(now),
  plcConnected: true,
  lastScanAt: iso(now - 1000),
  changedAt: iso(now - 6 * 3600e3),
  machineStatus: { value: '1', running: true, isStale: false, lastUpdated: iso(now - 5000) },
  lifetime,
  shotsBreakdown,
  amps,
  spareGrid,
  spareAlerts,
  section2,
};

const json = JSON.stringify(payload, null, 2);
writeFileSync(join(root, 'sample-response.json'), json);
writeFileSync(join(root, 'web', 'public', 'sample-response.json'), json);
console.log(`sample-response.json written (${spareGrid.length} spare rows, ${amps.length} amps, ${cycles.length} cycles).`);
