import type { TrendBucket } from '../types';

/*
 * Copied from the gateway dashboard (dashboard/src/utils/trendBuckets.ts), with one change: the
 * locale and time zone are pinned instead of left to the viewer.
 *
 * The gateway's own API sends plant-local times with no zone, and its dashboard is read on
 * machines at the plant, so `toLocaleDateString(undefined, …)` there means plant time in the
 * plant's locale. The admin API sends the same instants in UTC, and this page is read from
 * anywhere — so the viewer's zone would label a day bucket a day early for anyone outside IST
 * (18:30Z on 13 May is the 14 May bucket), and a US locale would print "May 13" where the
 * gateway prints "13 May".
 */
const PLANT = { timeZone: 'Asia/Kolkata' } as const;
const PLANT_LOCALE = 'en-GB';

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
      return d.toLocaleString(PLANT_LOCALE, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', ...PLANT });
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
      const hm  = { hour: '2-digit', minute: '2-digit', ...PLANT } as const;
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

export { HOUR_MS, DAY_MS, PLANT, PLANT_LOCALE };
