import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase';
import { normalizeLive, normalizeSection2, normalizeTrends } from '../utils/normalize';
import type {
  GatewayFailureReason, GatewayFilterRequest, GatewayHistoryResponse, GatewayLiveResponse,
  GatewaySection2, GatewayTrendPoint, GatewayTrendsQuery, ProxyResult,
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

interface ProxyRequest {
  clientId: string;
  view: 'live' | 'history' | 'trends' | 'filter';
  query?: {
    metric: string;
    from: string;
    to: string;
    limit?: number;
    offset?: number;
  };
  trendsQuery?: GatewayTrendsQuery;
  filterBody?: GatewayFilterRequest;
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

export async function fetchHistory(
  clientId: string,
  metric: string,
  from: Date,
  to: Date,
  limit = 2000,
  offset = 0
): Promise<ProxyResult<GatewayHistoryResponse>> {
  const result = await proxy({
    clientId,
    view: 'history',
    query: { metric, from: from.toISOString(), to: to.toISOString(), limit, offset },
  });
  return result.data as ProxyResult<GatewayHistoryResponse>;
}

/**
 * Whole-history graph series for the 4 graphable lifetime parameters.
 * Fetch once per dashboard load (or its own slow timer) — not on the live
 * poll cadence, per CONTRACT-admin-api.md (the underlying data changes at
 * most once a minute server-side).
 */
export async function fetchTrends(
  clientId: string,
  trendsQuery: GatewayTrendsQuery = {}
): Promise<ProxyResult<GatewayTrendPoint[]>> {
  const result = (await proxy({ clientId, view: 'trends', trendsQuery })).data as ProxyResult<GatewayTrendPoint[]>;
  return result.ok ? { ok: true, data: normalizeTrends(result.data) } : result;
}

/** Cloud-triggered synchronous filtered calculation (time/cycle/metal) — no polling. */
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
