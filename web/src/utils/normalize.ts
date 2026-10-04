import type {
  GatewayCycleAmpPoint, GatewayFilterAmps, GatewayLiveResponse, GatewaySection2, GatewayTrendPoint,
} from '../types';

/*
 * Gateway versions differ in which lists they send (fields added on
 * 2026-09-19 are absent until a gateway is updated). These helpers turn a
 * missing or null list into an empty one, so an absent field shows as "no
 * data" instead of crashing the page. Values themselves are never touched.
 */

const list = <T,>(value: T[] | null | undefined): T[] => (Array.isArray(value) ? value : []);

export function normalizeSection2(s: GatewaySection2 | null | undefined): GatewaySection2 | null {
  if (!s) return null;
  return {
    ...s,
    results: list(s.results),
    cycles: list(s.cycles),
    metals: list(s.metals),
    // Kept undefined when absent: an older gateway has no filtered amps at
    // all, which hides that panel, while [] means "computed, nothing found".
    amps: Array.isArray(s.amps) ? s.amps : undefined,
  };
}

export function normalizeLive(live: GatewayLiveResponse): GatewayLiveResponse {
  return {
    ...live,
    lifetime: list(live.lifetime),
    shotsBreakdown: list(live.shotsBreakdown),
    amps: list(live.amps),
    ampsLastCycle: list(live.ampsLastCycle),
    spareGrid: list(live.spareGrid),
    spareAlerts: list(live.spareAlerts),
    // Only trust impellers.selected when it is the documented list of numbers.
    impellers: Array.isArray(live.impellers?.selected) ? live.impellers : null,
    section2: normalizeSection2(live.section2),
  };
}

export function normalizeTrends(points: GatewayTrendPoint[] | null | undefined): GatewayTrendPoint[] {
  return list(points);
}

export function normalizeCycleAmps(points: GatewayCycleAmpPoint[] | null | undefined): GatewayCycleAmpPoint[] {
  return list(points);
}

export function normalizeFilterAmps(rows: GatewayFilterAmps[] | null | undefined): GatewayFilterAmps[] {
  return list(rows).map(r => ({ ...r, cycles: list(r.cycles) }));
}
