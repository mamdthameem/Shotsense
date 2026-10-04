import type { TrendBucket } from '../types';
import { PLANT_LOCALE, PLANT_TZ as PLANT, PLANT_TIME } from './plantLocale';

/*
 * Copied from the gateway dashboard (dashboard/src/utils/trendBuckets.ts), with one change: the
 * locale and time zone are pinned instead of left to the viewer (see plantLocale).
 */

const HOUR_MS = 3_600_000;
const DAY_MS  = 86_400_000;

/**
 * Axis label matched to the bucket size.
 *
 * Deliberately short — these are printed at an angle under a dense axis, and a long label forces
 * Recharts to drop ticks, which is how an axis ends up with uneven gaps between the labels that
 * survive.
 *
 * Bucket SELECTION does not live here. It is the server's (`bucket=auto`), which is the only
 * place that knows how much history exists.
 */
export function formatBucketLabel(iso: string, bucket: TrendBucket): string {
  const d = new Date(iso);
  switch (bucket) {
    case 'hour':
      return d.toLocaleString(PLANT_LOCALE, { day: 'numeric', month: 'short', ...PLANT_TIME });
    case 'month':
      return d.toLocaleDateString(PLANT_LOCALE, { month: 'short', year: 'numeric', ...PLANT });
    default:
      return d.toLocaleDateString(PLANT_LOCALE, { day: 'numeric', month: 'short', ...PLANT });
  }
}

/**
 * Full label for a tooltip — names the whole interval the point covers, not just its start.
 *
 * A bar labelled "10 Aug" is a whole day of production; without the interval spelled out
 * somewhere, a reader cannot tell whether the point is an instant or a total.
 */
export function formatBucketFull(iso: string, bucket: TrendBucket): string {
  const d = new Date(iso);
  switch (bucket) {
    case 'hour': {
      const end = new Date(d.getTime() + HOUR_MS);
      const hm  = PLANT_TIME;
      return `${d.toLocaleDateString(PLANT_LOCALE, { day: 'numeric', month: 'short', year: 'numeric', ...PLANT })}, ` +
             `${d.toLocaleTimeString(PLANT_LOCALE, hm)}–${end.toLocaleTimeString(PLANT_LOCALE, hm)}`;
    }
    case 'month':
      return d.toLocaleDateString(PLANT_LOCALE, { month: 'long', year: 'numeric', ...PLANT });
    default:
      return d.toLocaleDateString(PLANT_LOCALE, {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', ...PLANT,
      });
  }
}

/** `13 May 2026` in plant time — the range stamp above every trend chart. */
export function formatBucketStamp(iso: string): string {
  return new Date(iso).toLocaleDateString(PLANT_LOCALE, { day: 'numeric', month: 'short', year: 'numeric', ...PLANT });
}

export { HOUR_MS, DAY_MS };
