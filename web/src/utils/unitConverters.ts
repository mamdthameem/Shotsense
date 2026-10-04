import { formatPlantDateTime } from './formatters';

/**
 * Display rule (CONTRACT-admin-api.md Rule #1): every value is the gateway's
 * own number. Formatting only — units, a fixed number of decimals, thousands
 * separators, seconds shown as `23h 32m`, epoch seconds as a plant-time date.
 * Nothing is recalculated. A value that is not a number is shown as sent.
 */

const numberFormats = new Map<string, Intl.NumberFormat>();

/** `n` with exactly `decimals` decimals, optionally with thousands separators. `—` when not a number. */
export function formatNumber(n: number | null | undefined, decimals: number, grouping = false): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—';
  const key = `${decimals}|${grouping}`;
  let fmt = numberFormats.get(key);
  if (!fmt) {
    fmt = new Intl.NumberFormat('en-US', {
      minimumFractionDigits: decimals, maximumFractionDigits: decimals, useGrouping: grouping,
    });
    numberFormats.set(key, fmt);
  }
  return fmt.format(n);
}

/** The gateway's decimal text as a number; NaN for "" or anything else that is not a number. */
export function parseValue(raw: string | null | undefined): number {
  return raw == null || raw.trim() === '' ? NaN : Number(raw);
}

/** Seconds as `Z min` under an hour, `Xh Ym` under a day, `Xd Yh Zm` from a day (whole minutes). */
export function formatDuration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds) || seconds < 0) return '—';
  const minutes = Math.floor(seconds / 60);
  const d = Math.floor(minutes / 1440);
  const h = Math.floor((minutes % 1440) / 60);
  const m = minutes % 60;
  if (seconds < 3600) return `${m} min`;
  return d > 0 ? `${d}d ${h}h ${m}m` : `${h}h ${m}m`;
}

export interface ParamMeta {
  label: string;
  format: (n: number) => string;
}

export const PARAM_META: Record<string, ParamMeta> = {
  machine_utility_pct:              { label: 'Machine Utility',       format: n => `${formatNumber(n, 2)} %` },
  production_qty_kg:                { label: 'Production (Tonnage)',  format: n => `${formatNumber(n, 2, true)} kg` },
  energy_kwh_total:                 { label: 'Total Energy',          format: n => `${formatNumber(n, 1, true)} kWh` },
  energy_per_casting_kwh_kg:        { label: 'Energy per Casting',    format: n => `${formatNumber(n, 4)} kWh/kg` },
  blast_time_sec:                   { label: 'Blast Time',            format: formatDuration },
  cycle_count:                      { label: 'Blast Cycles',          format: n => formatNumber(n, 0, true) },
  avg_shot_refill_time_sec:         { label: 'Avg Shot Refill Time',  format: formatDuration },
  last_refill_epoch_sec:            { label: 'Last Shot Refill',      format: n => (n > 0 ? formatPlantDateTime(n * 1000) : '—') },
  effective_shots_usage_kg_per_ton: { label: 'Effective Shots Usage', format: n => `${formatNumber(n, 4)} kg/T` },
};

/** Lifetime tiles, in the gateway dashboard's order (the API sends them alphabetically). */
export const LIFETIME_ORDER = [
  'machine_utility_pct',
  'production_qty_kg',
  'energy_kwh_total',
  'energy_per_casting_kwh_kg',
  'blast_time_sec',
  'cycle_count',
  'avg_shot_refill_time_sec',
  'last_refill_epoch_sec',
  'effective_shots_usage_kg_per_ton',
] as const;

/** Filtered Parameters tiles, same order. */
export const FILTERED_ORDER = LIFETIME_ORDER.slice(0, 6);

/**
 * Tile name. Filtered production is the sum of declared casting-item weights,
 * not the PLC's Tonnage accumulator, so the gateway names that tile differently.
 */
export function paramLabel(name: string, filtered = false): string {
  if (filtered && name === 'production_qty_kg') return 'Production (Item Weight)';
  return PARAM_META[name]?.label ?? name;
}

/** A parameter's value text in its tile format; `—` for "", the raw text if it is not a number. */
export function formatParameterValue(name: string, raw: string | null | undefined): string {
  if (raw == null || raw.trim() === '') return '—';
  const n = parseValue(raw);
  if (!Number.isFinite(n)) return raw;
  const meta = PARAM_META[name];
  return meta ? meta.format(n) : raw;
}
