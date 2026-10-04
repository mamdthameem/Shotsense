import { useState, useEffect } from 'react';
import { fetchTrendSeries } from '../services/gatewayService';
import { formatBucketLabel, formatBucketFull } from './trendBuckets';
import type { GatewayTrendPoint, TrendBucket } from '../types';

export interface TrendPoint extends GatewayTrendPoint {
  /** Short axis label for this bucket. */
  label: string;
  /** Full interval description, for the tooltip. */
  full: string;
}

export interface TrendSeriesState {
  points: TrendPoint[];
  bucket: TrendBucket;
  loading: boolean;
  error: string | null;
}

/**
 * Fetches one bucketed trend series and decorates it with axis labels.
 *
 * Copied from the gateway dashboard, with its own `/api/trends` call swapped for our proxied
 * `/api/admin/trends` (same rows, same `X-Trend-Bucket` header, relayed by the Cloud Function).
 *
 * Every trend chart uses this, so they all share one fetch shape, one label format and one
 * granularity decision — five charts each choosing their own bucket is how two graphs of the same
 * window ended up with different period intervals.
 *
 * Omit both bounds for the all-time series. The granularity is resolved server-side and returned
 * with the rows, so the axis can be titled with the interval it is actually showing.
 */
export function useTrendSeries(clientId: string, windowStart?: string, windowEnd?: string): TrendSeriesState {
  const [points, setPoints]   = useState<TrendPoint[]>([]);
  const [bucket, setBucket]   = useState<TrendBucket>('day');
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);

    fetchTrendSeries(clientId, windowStart, windowEnd)
      .then(series => {
        if (!active) return;
        setBucket(series.bucket);
        setPoints(series.rows.map(r => ({
          ...r,
          label: formatBucketLabel(r.day, series.bucket),
          full:  formatBucketFull(r.day, series.bucket),
        })));
        setLoading(false);
      })
      .catch(e => {
        if (!active) return;
        setError((e as Error).message);
        setLoading(false);
      });

    return () => { active = false; };
  }, [clientId, windowStart, windowEnd]);

  return { points, bucket, loading, error };
}
