import type { GatewayLiveResponse, GatewaySection2, GatewayTrendPoint } from '../types';

/*
 * Gateway versions differ in which lists they send (the real gateway, for
 * example, sends no section2.ampsHistory). These helpers turn a missing or
 * null list into an empty one, so an absent field shows as "no data" instead
 * of crashing the page. Values themselves are never touched.
 */

const list = <T,>(value: T[] | null | undefined): T[] => (Array.isArray(value) ? value : []);

export function normalizeSection2(s: GatewaySection2 | null | undefined): GatewaySection2 | null {
  if (!s) return null;
  return {
    ...s,
    results: list(s.results),
    cycles: list(s.cycles),
    metals: list(s.metals),
    ampsHistory: list(s.ampsHistory),
  };
}

export function normalizeLive(live: GatewayLiveResponse): GatewayLiveResponse {
  return {
    ...live,
    lifetime: list(live.lifetime),
    shotsBreakdown: list(live.shotsBreakdown),
    amps: list(live.amps),
    spareGrid: list(live.spareGrid),
    spareAlerts: list(live.spareAlerts),
    // Only trust impellers.selected when it is the documented list of numbers;
    // otherwise the grids fall back to whatever impellers the rows cover.
    impellers: Array.isArray(live.impellers?.selected) ? live.impellers : null,
    section2: normalizeSection2(live.section2),
  };
}

export function normalizeTrends(points: GatewayTrendPoint[] | null | undefined): GatewayTrendPoint[] {
  return list(points);
}
