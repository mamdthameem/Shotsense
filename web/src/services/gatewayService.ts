import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase';
import type { GatewayHistoryResponse, GatewayLiveResponse, ProxyResult } from '../types';

interface ProxyRequest {
  clientId: string;
  view: 'live' | 'history';
  query?: {
    metric: string;
    from: string;
    to: string;
    limit?: number;
    offset?: number;
  };
}

const proxy = httpsCallable<ProxyRequest, ProxyResult<unknown>>(functions, 'gatewayProxy');

/** One on-demand pull of the client's live snapshot — nothing is cached. */
export async function fetchLive(clientId: string): Promise<ProxyResult<GatewayLiveResponse>> {
  const result = await proxy({ clientId, view: 'live' });
  return result.data as ProxyResult<GatewayLiveResponse>;
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
