/**
 * Dummy gateway payloads in the current CONTRACT-admin-api.md shape, shared by
 * mock-gateway.mjs (served live) and gen-sample.mjs (written as fixtures) so
 * the two can never drift apart. Values follow the gateway's conventions:
 * lifetime/amps/section2 `value`s are decimal TEXT, timestamps are UTC ISO.
 *
 * Current format notes (changes since the last contract copy):
 *  - effective_shots_usage is in kg/T (kg of shot per tonne cast), lower is better.
 *  - section2 has no shotsBreakdown.
 *  - trends include empty days as their own zero-valued entries.
 *  - impellers.selected lists the shown impellers; amps and spareGrid only
 *    carry rows for those.
 */

export const SPARE_NAMES = [
  'Blade', 'Blade Mounting Piece', 'Narrow Plate', 'Curved Plate', 'Feeding End',
  'Bearing End', 'Impeller', 'Wall Plate', 'Control Gauge', 'Disc Spacer',
  'Doom Nut 1/2in', 'Doom Nut 5/8', 'Disc', 'Guide Plate',
];

/** Impellers 7, 9 and 10 hidden by default so the "shorter lists" case is always exercised. */
export const DEFAULT_SELECTED = [1, 2, 3, 4, 5, 6, 8];

const iso = (ms) => new Date(ms).toISOString();
const HOUR = 3600e3;
const DAY = 24 * HOUR;

// A few triggered spares so spareAlerts is non-empty (impeller-spareIndex).
const TRIGGERED = new Set(['3-0', '6-6', '8-13']);

function spareGrid(now, selected) {
  const rows = [];
  for (const imp of [...selected].sort((a, b) => a - b)) {
    for (let idx = 0; idx <= 13; idx++) {
      const key = `${imp}-${idx}`;
      const thresholdHours = idx === 9 ? 0 : 500 + idx * 50; // Disc Spacer: not monitored
      const triggered = TRIGGERED.has(key);
      const currentRunHours = triggered
        ? Math.round((thresholdHours + 12.4 + imp) * 10) / 10
        : Math.round((thresholdHours * 0.55 + imp * 3) * 10) / 10;
      rows.push({
        impellerNum: imp,
        spareIndex: idx,
        spareName: SPARE_NAMES[idx],
        thresholdHours,
        currentRunHours,
        triggerActive: triggered,
        lastReplacedAt: key === '1-0' ? iso(now - 6 * HOUR) : null,
        lastUpdatedAt: iso(now - (imp * 14 + idx) * 1000),
      });
    }
  }
  return rows;
}

function ampValue(imp, t) {
  return (18 + Math.sin(imp) * 6 + Math.sin(t / 9e5 + imp) * 0.8).toFixed(2);
}

/** Section 2 result for a filter request (or the default "latest" one). */
export function buildSection2(now, filter = null, requestId = 42, selected = DEFAULT_SELECTED) {
  const f = filter ?? {
    filterBy: 'time', filterStart: iso(now - DAY), filterEnd: iso(now), periodLabel: 'day',
  };
  const isTime = f.filterBy === 'time';
  const start = isTime ? Date.parse(f.filterStart) : now - DAY;
  const end = isTime ? Date.parse(f.filterEnd) : now;

  const cycleCount = f.filterBy === 'cycle'
    ? Math.min(40, Math.max(0, f.filterCycleTo - f.filterCycleFrom + 1))
    : 12;
  const firstCycle = f.filterBy === 'cycle' ? f.filterCycleFrom : 18331;
  const span = Math.max(1, end - start);

  const cycles = Array.from({ length: cycleCount }, (_, i) => {
    const blastStart = start + (span / (cycleCount + 1)) * (i + 1);
    const steel = i % 3 === 0;
    const metal1 = f.filterBy === 'metal' ? f.filterMetalName : 'Cast Iron';
    return {
      cycleNumber: firstCycle + i,
      blastStart: iso(blastStart),
      blastEnd: iso(blastStart + 90 * 60e3),
      metal1Name: metal1,
      metal2Name: steel ? 'Steel Scrap' : null,
      metal3Name: null,
      metal4Name: null,
      metal1WeightKg: 620 + i * 3,
      metal2WeightKg: steel ? 140 + i : null,
      metal3WeightKg: null,
      metal4WeightKg: null,
      productionKg: Math.round((740 + Math.sin(i) * 60) * 100) / 100,
      energyKwh: Math.round((410 + Math.cos(i) * 35) * 1000) / 1000,
    };
  });

  const byMetal = new Map();
  for (const c of cycles) {
    for (const n of [1, 2, 3, 4]) {
      const w = c[`metal${n}WeightKg`];
      if (w == null) continue;
      const name = c[`metal${n}Name`] ?? 'unspecified';
      byMetal.set(name, (byMetal.get(name) ?? 0) + w);
    }
  }
  const metals = [...byMetal]
    .map(([metalName, kg]) => ({ metalName, productionKg: Math.round(kg * 100) / 100 }))
    .sort((a, b) => b.productionKg - a.productionKg);

  // Every reading in the window for the shown impellers, interleaved, ascending.
  const ampsHistory = [];
  const step = Math.max(10 * 60e3, span / 48);
  for (let t = start; t <= end; t += step) {
    for (const imp of selected) {
      ampsHistory.push({ parameterName: `Current_imp_${imp}`, value: ampValue(imp, t), timestamp: iso(t) });
    }
  }

  return {
    requestId,
    filterBy: f.filterBy,
    filterStart: isTime ? f.filterStart : iso(now),
    filterEnd: isTime ? f.filterEnd : iso(now),
    periodLabel: f.periodLabel ?? null,
    filterCycleFrom: f.filterBy === 'cycle' ? f.filterCycleFrom : null,
    filterCycleTo: f.filterBy === 'cycle' ? f.filterCycleTo : null,
    filterMetalName: f.filterBy === 'metal' ? f.filterMetalName : null,
    processedAt: iso(now),
    results: [
      { parameterName: 'blast_time_sec', value: String(cycleCount * 5400) + '.0' },
      { parameterName: 'cycle_count', value: String(cycleCount) },
      { parameterName: 'energy_kwh_total', value: '4921.500' },
      { parameterName: 'energy_per_casting_kwh_kg', value: '0.5540' },
      { parameterName: 'machine_utility_pct', value: '68.90' },
    ],
    cycles,
    metals,
    ampsHistory,
  };
}

/** Full GET /api/admin/live payload. */
export function buildLive(now = Date.now(), { selected = DEFAULT_SELECTED, section2 } = {}) {
  const shown = [...selected].sort((a, b) => a - b);
  const grid = spareGrid(now, shown);

  // Only the shown impellers, ordered LEXICOGRAPHICALLY by parameterName (contract).
  const amps = shown
    .map(n => ({ parameterName: `Current_imp_${n}`, value: ampValue(n, now), lastUpdated: iso(now - n * 250) }))
    .sort((a, b) => a.parameterName.localeCompare(b.parameterName));

  // Ten params, ascending by parameterName, values as decimal text.
  const lifetime = [
    { parameterName: 'avg_shot_refill_time_sec', value: '412.5' },
    { parameterName: 'blast_time_sec', value: '5423000.0' },
    { parameterName: 'cycle_count', value: '18342' },
    { parameterName: 'effective_shots_usage', value: '3.1250' },
    { parameterName: 'energy_kwh_total', value: '90312.108' },
    { parameterName: 'energy_per_casting_kwh_kg', value: '0.5701' },
    { parameterName: 'last_refill_epoch_sec', value: String(Math.floor((now - 5 * HOUR) / 1000)) },
    { parameterName: 'machine_status', value: '1' },
    { parameterName: 'machine_utility_pct', value: '72.41' },
    { parameterName: 'production_qty_kg', value: '158430.25' },
  ].map(p => ({ ...p, updatedAt: iso(now - 60e3) }));

  const shotsBreakdown = Array.from({ length: 8 }, (_, i) => ({
    refillTimestamp: iso(now - (8 - i) * 36 * HOUR),
    blastCount: 40 + ((i * 7) % 25),
  }));

  return {
    generatedAtUtc: iso(now),
    plcConnected: true,
    lastScanAt: iso(now - 1000),
    changedAt: iso(now - 6 * HOUR),
    machineStatus: { value: '1', running: true, isStale: false, lastUpdated: iso(now - 5000) },
    lifetime,
    shotsBreakdown,
    impellers: { selected: shown },
    amps,
    spareGrid: grid,
    spareAlerts: grid.filter(r => r.triggerActive && r.thresholdHours > 0),
    section2: section2 === undefined ? buildSection2(now, null, 42, shown) : section2,
  };
}

/**
 * GET /api/admin/trends series. Every bucket in range is present, including
 * empty ones (all zeros, tonnageEnd carried forward) — every 5th day is empty.
 */
export function buildTrends(now = Date.now(), { bucket = 'day', start, end } = {}) {
  const endMs = end ? Date.parse(end) : now;
  const out = [];
  let tonnage = 150000;
  if (bucket === 'month') {
    const e = new Date(endMs);
    const first = start ? new Date(start) : new Date(Date.UTC(e.getUTCFullYear(), e.getUTCMonth() - 5, 1));
    for (let d = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), 1)); d.getTime() <= endMs;
         d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1))) {
      out.push(trendPoint(d.toISOString(), 30, (tonnage += 21000), d.getUTCMonth()));
    }
    return out;
  }
  const stepMs = bucket === 'hour' ? HOUR : DAY;
  const startMs = start ? Date.parse(start) : endMs - 60 * DAY;
  let i = 0;
  for (let t = Math.floor(startMs / stepMs) * stepMs; t <= endMs; t += stepMs, i++) {
    const empty = i % 5 === 4;
    if (!empty) tonnage += 700;
    out.push(empty ? emptyPoint(iso(t), tonnage) : trendPoint(iso(t), bucket === 'hour' ? 1 / 24 : 1, tonnage, i));
  }
  return out;
}

function trendPoint(day, days, tonnageEnd, seed) {
  const machineOnSec = Math.round(days * 16 * 3600 * (0.8 + 0.2 * Math.sin(seed)));
  const blastOnSec = Math.round(machineOnSec * (0.65 + 0.1 * Math.cos(seed)));
  const productionKg = Math.round(days * 700 * (1 + 0.2 * Math.sin(seed)) * 100) / 100;
  const energyKwh = Math.round(days * 400 * (1 + 0.1 * Math.cos(seed)) * 1000) / 1000;
  return {
    day,
    machineOnSec,
    blastOnSec,
    utilityPct: Math.round((blastOnSec / machineOnSec) * 10000) / 100,
    cycleCount: Math.max(1, Math.round(days * 6)),
    productionKg,
    tonnageEnd,
    energyKwh,
    efficiencyKwhPerKg: Math.round((energyKwh / productionKg) * 10000) / 10000,
  };
}

function emptyPoint(day, tonnageEnd) {
  return {
    day, machineOnSec: 0, blastOnSec: 0, utilityPct: 0, cycleCount: 0,
    productionKg: 0, tonnageEnd, energyKwh: 0, efficiencyKwhPerKg: 0,
  };
}

/** GET /api/admin/history — a sine-wave series between from/to. */
export function buildHistory(query) {
  const metric = query.get('metric') ?? 'unknown';
  const from = new Date(query.get('from') ?? Date.now() - DAY);
  const to = new Date(query.get('to') ?? Date.now());
  const limit = Math.min(Number(query.get('limit') ?? 5000), 20000);
  const offset = Number(query.get('offset') ?? 0);

  const points = [];
  const stepMs = Math.max(60e3, (to.getTime() - from.getTime()) / 500);
  for (let t = from.getTime(), i = 0; t <= to.getTime() && points.length < limit; t += stepMs, i++) {
    if (i < offset) continue;
    const value = 50 + 25 * Math.sin(t / 7.2e6) + 5 * Math.sin(t / 9.1e5);
    points.push({ value: value.toFixed(3), timestamp: iso(t), reason: 'COV' });
  }
  return { metric, from: from.toISOString(), to: to.toISOString(), count: points.length, limit, offset, points };
}
