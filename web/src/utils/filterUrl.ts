import {
  FILTER_PARAMETER_KEYS,
  type FilterParameterKey, type GatewayFilterRequest, type GatewaySection2,
} from '../types';

/**
 * The applied filter, carried in the client page's URL — the same format the gateway dashboard
 * uses (D:\PLCGateway\dashboard\src\utils\filterUrl.ts).
 *
 * Each browser tab keeps its own filter: in React state and in its own address bar, never in
 * Firestore or on the gateway. Two people (or two tabs) looking at the same client therefore
 * cannot change each other's filter, and a refresh keeps it. Example:
 *
 *   /clients/abc?filter=time&period=day&start=…&end=…&result=124
 *   /clients/abc?filter=cycle&cycles=1-104&params=energy_kwh_total,cycle_count&result=125
 *   /clients/abc?filter=item&item=Aluminium&result=126
 *
 * `result` is the gateway's id for the saved calculation. On a refresh the page reopens that
 * result by id (GET /api/admin/filter/{id}) instead of computing it again; the other parameters
 * only describe it, and are used on their own to refill the filter bar when the saved result no
 * longer exists. `params` lists the ticked parameters; left out, it means all of them. "item" is
 * the word users see, so the URL says item; the API still says metal.
 */

export const PERIODS = ['hour', 'shift', 'day', 'week', 'month', 'year'] as const;

export interface FilterFromUrl {
  /** The filter the URL describes, or null when it describes none (or nothing valid). */
  request: GatewayFilterRequest | null;
  /** The saved result to reopen, or null. */
  resultId: number | null;
}

export function filterToSearchParams(req: GatewayFilterRequest, resultId: number): URLSearchParams {
  const p = new URLSearchParams();

  if (req.filterBy === 'time') {
    p.set('filter', 'time');
    if (req.periodLabel) p.set('period', req.periodLabel);
    p.set('start', req.filterStart ?? '');
    p.set('end', req.filterEnd ?? '');
  } else if (req.filterBy === 'cycle') {
    p.set('filter', 'cycle');
    p.set('cycles', `${req.filterCycleFrom}-${req.filterCycleTo}`);
  } else {
    p.set('filter', 'item');
    p.set('item', req.filterMetalName ?? '');
  }

  const selected = req.selectedParameters ?? [];
  if (selected.length > 0 && selected.length < FILTER_PARAMETER_KEYS.length) p.set('params', selected.join(','));

  p.set('result', String(resultId));
  return p;
}

export function filterFromSearchParams(p: URLSearchParams): FilterFromUrl {
  const idText = p.get('result');
  const id = idText && /^\d{1,9}$/.test(idText) ? Number(idText) : null;
  return { request: requestFromParams(p), resultId: id && id > 0 ? id : null };
}

function requestFromParams(p: URLSearchParams): GatewayFilterRequest | null {
  const selectedParameters = parseParams(p.get('params'));

  switch (p.get('filter')) {
    case 'time': {
      const start = p.get('start');
      const end = p.get('end');
      if (!start || !end || isNaN(Date.parse(start)) || isNaN(Date.parse(end))) return null;
      const period = p.get('period');
      return {
        filterBy: 'time', filterStart: start, filterEnd: end,
        ...(period && (PERIODS as readonly string[]).includes(period) ? { periodLabel: period } : {}),
        selectedParameters,
      };
    }
    case 'cycle': {
      const m = /^(\d+)-(\d+)$/.exec(p.get('cycles') ?? '');
      if (!m) return null;
      return { filterBy: 'cycle', filterCycleFrom: Number(m[1]), filterCycleTo: Number(m[2]), selectedParameters };
    }
    case 'item': {
      const item = p.get('item')?.trim();
      if (!item) return null;
      return { filterBy: 'metal', filterMetalName: item, selectedParameters };
    }
    default:
      return null;
  }
}

function parseParams(text: string | null): FilterParameterKey[] {
  if (!text) return [];
  const known = new Set<string>(FILTER_PARAMETER_KEYS);
  return text.split(',').filter((k): k is FilterParameterKey => known.has(k));
}

/** The gateway's saved copy of a request, as the filter the filter bar shows. */
export function requestFromSection2(s: GatewaySection2): GatewayFilterRequest {
  const known = new Set<string>(FILTER_PARAMETER_KEYS);
  // null from the gateway means "all were computed", which the filter bar shows as an empty list.
  const selectedParameters = (s.selectedParameters ?? []).filter((k): k is FilterParameterKey => known.has(k));

  if (s.filterBy === 'cycle') {
    return { filterBy: 'cycle', filterCycleFrom: s.filterCycleFrom ?? 0, filterCycleTo: s.filterCycleTo ?? 0, selectedParameters };
  }
  if (s.filterBy === 'metal') {
    return { filterBy: 'metal', filterMetalName: s.filterMetalName ?? '', selectedParameters };
  }
  return {
    filterBy: 'time', filterStart: s.filterStart, filterEnd: s.filterEnd,
    ...(s.periodLabel ? { periodLabel: s.periodLabel } : {}),
    selectedParameters,
  };
}
