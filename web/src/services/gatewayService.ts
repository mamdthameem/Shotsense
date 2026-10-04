import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase';
import {
  normalizeCycleAmps, normalizeFilterAmps, normalizeLive, normalizeSection2, normalizeTrends,
} from '../utils/normalize';
import type {
  GatewayCycleAmpPoint, GatewayFailureReason, GatewayFilterAmps, GatewayFilterRequest,
  GatewayLiveResponse, GatewaySection2, GatewayTrendPoint, GatewayTrendsQuery,
  ProxyResult, TrendBucket, TrendSeries,
} from '../types';

const FAILURE_LABELS: Record<GatewayFailureReason, string> = {
  timeout: 'Gateway request timed out',
  dns: 'DNS lookup failed',
  'connection-refused': 'Connection refused',
  'tls-error': 'TLS/certificate error',
  unreachable: 'Client unreachable',
  'auth-failed': 'Gateway rejected the API key',
  'gateway-error': 'Gateway error',
};

/** Turns a failed ProxyResult into one clear line for an admin — reason label,
 *  HTTP status if any, and the specific upstream detail when the proxy has one. */
export function describeGatewayFailure(result: Extract<ProxyResult<unknown>, { ok: false }>): string {
  const label = FAILURE_LABELS[result.reason] ?? 'Gateway request failed';
  const head = result.status ? `${label} (HTTP ${result.status})` : label;
  return result.message ? `${head} — ${result.message}` : `${head}.`;
}

// The proxy also serves 'history'; the client page has no history view, so
// nothing here calls it.
interface ProxyRequest {
  clientId: string;
  view: 'live' | 'trends' | 'filter' | 'amps-by-cycle' | 'filter-amps';
  trendsQuery?: GatewayTrendsQuery;
  filterBody?: GatewayFilterRequest;
  impeller?: number;
  requestId?: number;
}

const proxy = httpsCallable<ProxyRequest, ProxyResult<unknown>>(functions, 'gatewayProxy');

// The filter call can take up to 60s at the gateway (75s function limit), so
// the browser must wait longer than the SDK's 70s default before giving up.
const filterProxy = httpsCallable<ProxyRequest, ProxyResult<unknown>>(functions, 'gatewayProxy', { timeout: 80_000 });

/** One on-demand pull of the client's live snapshot — nothing is cached. */
export async function fetchLive(clientId: string): Promise<ProxyResult<GatewayLiveResponse>> {
  const result = (await proxy({ clientId, view: 'live' })).data as ProxyResult<GatewayLiveResponse>;
  return result.ok ? { ok: true, data: normalizeLive(result.data) } : result;
}

const TREND_BUCKETS: readonly string[] = ['hour', 'day', 'month'];

/**
 * Bucketed series behind the tile charts, always with bucket=auto: the
 * gateway picks hour/day/month and says which in X-Trend-Bucket, which the
 * proxy relays. No start/end = all history. One call per chart opened, like
 * the gateway dashboard — not on the live poll cadence.
 */
export async function fetchTrends(
  clientId: string,
  window: { start?: string; end?: string } = {}
): Promise<ProxyResult<TrendSeries>> {
  const trendsQuery: GatewayTrendsQuery = { bucket: 'auto', ...window };
  const result = (await proxy({ clientId, view: 'trends', trendsQuery })).data as ProxyResult<GatewayTrendPoint[]>;
  if (!result.ok) return result;
  // Same default as the gateway's own dashboard when the header is absent.
  const bucket = (TREND_BUCKETS.includes(result.trendBucket ?? '') ? result.trendBucket : 'day') as TrendBucket;
  return { ok: true, data: { bucket, rows: normalizeTrends(result.data) } };
}

/**
 * The chart components ported from the gateway dashboard expect a promise that
 * rejects, the way `fetch` does, rather than our ProxyResult union.
 */
async function orThrow<T>(request: Promise<ProxyResult<T>>): Promise<T> {
  const result = await request;
  if (!result.ok) throw new Error(describeGatewayFailure(result));
  return result.data;
}

/** Trend series for one chart (gateway: trendsService.fetchTrends). */
export function fetchTrendSeries(clientId: string, start?: string, end?: string): Promise<TrendSeries> {
  return orThrow(fetchTrends(clientId, { start, end }));
}

/** One impeller's average current per completed cycle (gateway: cyclesService.fetchPerCycleAmps). */
export function fetchPerCycleAmps(clientId: string, impeller: number): Promise<GatewayCycleAmpPoint[]> {
  return orThrow(fetchAmpsByCycle(clientId, impeller));
}

/** One filtered calculation's per-impeller cycles (gateway: filterService.fetchFilterAmps). */
export function fetchFilteredAmps(clientId: string, requestId: number): Promise<GatewayFilterAmps[]> {
  return orThrow(fetchFilterAmps(clientId, requestId));
}

/** Cloud-triggered synchronous filtered calculation (time/cycle/item) — no polling. */
export async function fetchFilteredCalculation(
  clientId: string,
  filterBody: GatewayFilterRequest
): Promise<ProxyResult<GatewaySection2>> {
  const result = (await filterProxy({ clientId, view: 'filter', filterBody })).data as ProxyResult<GatewaySection2 | null>;
  if (!result.ok) return result;
  const section2 = normalizeSection2(result.data);
  return section2
    ? { ok: true, data: section2 }
    : { ok: false, reason: 'gateway-error', message: 'Gateway returned an empty filter result.' };
}

/** One impeller's average current for every completed cycle (live impeller tile chart). */
export async function fetchAmpsByCycle(
  clientId: string,
  impeller: number
): Promise<ProxyResult<GatewayCycleAmpPoint[]>> {
  const result = (await proxy({ clientId, view: 'amps-by-cycle', impeller })).data as ProxyResult<GatewayCycleAmpPoint[]>;
  return result.ok ? { ok: true, data: normalizeCycleAmps(result.data) } : result;
}

/** One filtered calculation's impeller current, with the per-cycle chart points. */
export async function fetchFilterAmps(
  clientId: string,
  requestId: number
): Promise<ProxyResult<GatewayFilterAmps[]>> {
  const result = (await proxy({ clientId, view: 'filter-amps', requestId })).data as ProxyResult<GatewayFilterAmps[]>;
  return result.ok ? { ok: true, data: normalizeFilterAmps(result.data) } : result;
}
