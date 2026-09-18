/**
 * Display rule (CONTRACT-admin-api.md Rule #1): every value is shown exactly
 * as the gateway sent it — no rounding, no padding, no unit conversion, no
 * recalculation. The only thing added is the unit label. Timestamps are the
 * one exception: they are shown as a local date/time (same instant, readable).
 */

export interface ParamMeta {
  label: string;
  unit?: string;
  lowerIsBetter?: boolean;
  isEpochSeconds?: boolean;
}

export const PARAM_META: Record<string, ParamMeta> = {
  machine_utility_pct:       { label: 'Machine Utility',       unit: '%' },
  production_qty_kg:         { label: 'Production',            unit: 'kg' },
  energy_kwh_total:          { label: 'Total Energy',          unit: 'kWh' },
  energy_per_casting_kwh_kg: { label: 'Energy per Casting',    unit: 'kWh/kg' },
  blast_time_sec:            { label: 'Blast Time',            unit: 's' },
  cycle_count:               { label: 'Blast Cycles',          unit: 'cycles' },
  avg_shot_refill_time_sec:  { label: 'Avg Shot Refill Time',  unit: 's' },
  last_refill_epoch_sec:     { label: 'Last Shot Refill',      isEpochSeconds: true },
  effective_shots_usage:     { label: 'Effective Shots Usage', unit: 'kg/T', lowerIsBetter: true },
  effective_shots_usage_kg_per_ton: { label: 'Effective Shots Usage', unit: 'kg/T', lowerIsBetter: true },
};

/** The gateway's value text (or JSON number) plus its unit, untouched. Missing or "" shows as "—". */
export function withUnit(raw: string | number | null | undefined, unit?: string): string {
  if (raw === null || raw === undefined || raw === '') return '—';
  return unit ? `${raw} ${unit}` : String(raw);
}

export function formatParameterValue(name: string, raw: string): string {
  const meta = PARAM_META[name];
  if (meta?.isEpochSeconds) {
    const epoch = Number(raw);
    return raw !== '' && Number.isFinite(epoch) && epoch > 0
      ? new Date(epoch * 1000).toLocaleString()
      : withUnit(raw);
  }
  return withUnit(raw, meta?.unit);
}
