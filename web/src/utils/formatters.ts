type DateInput = Date | string | number | null | undefined;

const toDate = (value: DateInput): Date | null => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

/** End of the given date (23:59:59.999). Used so "valid until X" means through end of day X. */
export const endOfDay = (value: DateInput): Date | null => {
  const date = toDate(value);
  if (!date) return null;
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
};

/** Days until date (can be negative if in the past). Uses calendar day difference. */
export const daysUntil = (value: DateInput): number | null => {
  const date = toDate(value);
  if (!date) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return Math.ceil((d.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
};

export const formatDate = (
  value: DateInput,
  options: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'short', day: '2-digit' }
): string => {
  const date = toDate(value);
  if (!date) return 'N/A';
  return new Intl.DateTimeFormat(undefined, options).format(date);
};

export const formatTime = (
  value: DateInput,
  options: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit' }
): string => {
  const date = toDate(value);
  if (!date) return 'N/A';
  return new Intl.DateTimeFormat(undefined, options).format(date);
};

// ── Plant time ───────────────────────────────────────────────────────────────
// The gateway sends UTC; the plant reads India Standard Time (UTC+05:30, no
// daylight saving), whatever time zone the admin's browser is in. Wall-clock
// fields are read with the UTC getters of an instant shifted by the offset.

const PLANT_OFFSET_MS = 330 * 60_000;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const pad2 = (n: number) => String(n).padStart(2, '0');

export interface PlantFields {
  year: number;
  month: number;   // 0–11
  day: number;
  hour: number;
  minute: number;
  second: number;
}

export const plantFields = (value: DateInput): PlantFields | null => {
  const date = toDate(value);
  if (!date) return null;
  const d = new Date(date.getTime() + PLANT_OFFSET_MS);
  return {
    year: d.getUTCFullYear(), month: d.getUTCMonth(), day: d.getUTCDate(),
    hour: d.getUTCHours(), minute: d.getUTCMinutes(), second: d.getUTCSeconds(),
  };
};

/** The instant at the given plant wall-clock time. Out-of-range fields roll over like Date.UTC. */
export const fromPlantFields = (f: PlantFields): Date =>
  new Date(Date.UTC(f.year, f.month, f.day, f.hour, f.minute, f.second) - PLANT_OFFSET_MS);

const clock = (f: PlantFields) => `${pad2(f.hour)}:${pad2(f.minute)}:${pad2(f.second)}`;

/** `14/05/2026, 15:29:33` in plant time; `—` when missing. */
export const formatPlantDateTime = (value: DateInput): string => {
  const f = plantFields(value);
  return f ? `${pad2(f.day)}/${pad2(f.month + 1)}/${f.year}, ${clock(f)}` : '—';
};

/** `15:29:33` in plant time. */
export const formatPlantTime = (value: DateInput): string => {
  const f = plantFields(value);
  return f ? clock(f) : '—';
};

/** `21 Jan 2026` in plant time. */
export const formatPlantDate = (value: DateInput): string => {
  const f = plantFields(value);
  return f ? `${f.day} ${MONTHS[f.month]} ${f.year}` : '—';
};

/** `21 Jan` in plant time. */
export const formatPlantDayMonth = (value: DateInput): string => {
  const f = plantFields(value);
  return f ? `${f.day} ${MONTHS[f.month]}` : '—';
};

/** `May 2026` in plant time. */
export const formatPlantMonth = (value: DateInput): string => {
  const f = plantFields(value);
  return f ? `${MONTHS[f.month]} ${f.year}` : '—';
};

/** `15:00` in plant time. */
export const formatPlantHourMinute = (value: DateInput): string => {
  const f = plantFields(value);
  return f ? `${pad2(f.hour)}:${pad2(f.minute)}` : '—';
};

/** Plant calendar date as `YYYY-MM-DD`, for grouping by day. */
export const plantDateKey = (value: DateInput): string => {
  const f = plantFields(value);
  return f ? `${f.year}-${pad2(f.month + 1)}-${pad2(f.day)}` : '';
};

/**
 * The tile timestamp rule: time only when it is today in plant time
 * (`15:29:33`), otherwise the date in front (`14 May, 15:29:33`), with the
 * year added when it is not this year (`14 May 2025, 15:29:33`).
 */
export const formatTileTimestamp = (value: DateInput, now: Date = new Date()): string => {
  const f = plantFields(value);
  const today = plantFields(now);
  if (!f || !today) return '—';
  if (f.year === today.year && f.month === today.month && f.day === today.day) return clock(f);
  const year = f.year === today.year ? '' : ` ${f.year}`;
  return `${f.day} ${MONTHS[f.month]}${year}, ${clock(f)}`;
};

/**
 * `/api/admin/history` timestamps are already gateway-local wall time with no
 * zone (`2026-05-05T15:22:38.10097`), so they are reformatted, not converted.
 */
export const formatWallDateTime = (value: string): string => {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?$/.exec(value);
  return m ? `${m[3]}/${m[2]}/${m[1]}, ${m[4]}:${m[5]}:${m[6]}` : formatPlantDateTime(value);
};

/** Relative "Xm ago / Xh ago / Xd ago" for reachability columns. */
export const timeAgo = (value: DateInput): string => {
  const date = toDate(value);
  if (!date) return 'never';
  const diffMs = Date.now() - date.getTime();
  if (diffMs < 0) return 'just now';
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
};
