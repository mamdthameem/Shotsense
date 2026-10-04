// ── Client registry (Firestore: clients/{id}) ────────────────────────────────

export type LicenseStatus = 'active' | 'grace' | 'expired' | 'suspended';

export type ContactStatus = 'ok' | 'unreachable' | 'auth-failed';

export type ClientEventType =
  | 'license-ok'
  | 'license-denied'
  | 'pull-ok'
  | 'pull-unreachable'
  | 'pull-auth-failed';

export interface ClientEvent {
  at: string; // ISO timestamp
  type: ClientEventType;
  detail?: string;
}

export interface Client {
  id: string;
  name: string;               // company/site identifier only — never person names
  staticIp: string;
  port: number;
  useTls: boolean;
  hostnameOverride: string | null;
  adminApiKey: string;        // cloud → client X-Api-Key
  licenseKey: string;         // client → cloud X-License-Key
  licenseExpiresAt: Date | null;
  graceDays: number;
  suspended: boolean;
  lastLicenseCheckAt: Date | null;
  lastAdminContactAt: Date | null;
  lastContactStatus: ContactStatus | null;
  recentEvents: ClientEvent[];
  createdAt: Date | null;
  updatedAt: Date | null;
}

// ── Admin account (Firebase Auth + admins/{uid}) ─────────────────────────────

export interface AdminUser {
  uid: string;
  email: string;
  name: string; // display label derived from the email
}

// ── Gateway API payloads (returned as-is by the proxy, never stored) ─────────

// Extended /api/admin/live payload — exact shape from CONTRACT-admin-api.md.
// Rule #1: render verbatim. `value` fields are decimal-text strings straight
// from the gateway; parse only for formatting/plotting, never for further math.

export interface GatewayMachineStatus {
  value: string;          // "0"–"255" as decimal text
  running: boolean;       // value != "0" — use as delivered
  isStale: boolean;       // true while PLC disconnected
  lastUpdated: string;    // timestamp
}

export interface GatewayLifetimeParam {
  parameterName: string;
  value: string;          // decimal text; "" if never computed
  updatedAt: string;
}

// One row per FINISHED refill interval, keyed by the refill that closed it.
// The interval running now has no row.
export interface GatewayShotsBreakdownEntry {
  refillTimestamp: string;                 // the refill that CLOSED the interval
  intervalStartTimestamp?: string | null;  // the refill that OPENED it; null = none on record; absent on older gateways
  blastCount: number;
}

export interface GatewayAmpReading {
  parameterName: string;  // Current_imp_1 … Current_imp_10, in impeller-number order
  value: string;          // amperes, decimal text ("0" when absent)
  lastUpdated: string;    // for ampsLastCycle: blastEnd of that cycle
}

export interface GatewaySpareRow {
  impellerNum: number;    // 1–10
  spareIndex: number;     // 0–13
  spareName: string;
  thresholdHours: number; // 0 means "not monitored"
  currentRunHours: number;
  triggerActive: boolean;
  lastReplacedAt: string | null;
  lastUpdatedAt: string;
}

export interface GatewaySection2Result {
  parameterName: string;
  value: string;          // decimal text; "" if null
}

export interface GatewaySection2Cycle {
  cycleNumber: number;
  blastStart: string;
  blastEnd: string;
  metal1Name: string | null;
  metal2Name: string | null;
  metal3Name: string | null;
  metal4Name: string | null;
  metal1WeightKg: number | null;
  metal2WeightKg: number | null;
  metal3WeightKg: number | null;
  metal4WeightKg: number | null;
  productionKg: number;
  energyKwh: number;
}

export interface GatewaySection2Metal {
  metalName: string;       // "unspecified" for a weight declared with a blank name
  productionKg: number;    // 2 dp
}

export interface GatewaySection2Amp {
  impellerNumber: number;
  overallAvgAmps: number | null;  // 2 dp; null when no in-scope cycle had a sample
}

/** The parameter keys POST /api/admin/filter accepts in selectedParameters. */
export type FilterParameterKey =
  | 'machine_utility_pct'
  | 'production_qty_kg'
  | 'energy_kwh_total'
  | 'energy_per_casting_kwh_kg'
  | 'blast_time_sec'
  | 'cycle_count'
  | 'impeller_current';

export interface GatewaySection2 {
  requestId: number;
  filterBy: 'time' | 'cycle' | 'metal';
  filterStart: string;
  filterEnd: string;
  periodLabel: string | null;
  filterCycleFrom: number | null;
  filterCycleTo: number | null;
  filterMetalName: string | null;
  processedAt: string | null;
  // null = all were computed; absent on gateways older than 2026-09-19.
  selectedParameters?: string[] | null;
  results: GatewaySection2Result[];
  cycles: GatewaySection2Cycle[];
  metals: GatewaySection2Metal[];    // ordered by productionKg descending
  amps?: GatewaySection2Amp[];       // absent on gateways older than 2026-09-19
}

/** One cycle's average impeller current (amps/by-cycle and filter/{id}/amps). */
export interface GatewayCycleAmpPoint {
  cycleNumber: number;
  blastEnd: string;
  avgAmps: number | null;   // null when the cycle has no recorded sample
}

/** GET /api/admin/filter/{requestId}/amps — one entry per impeller. */
export interface GatewayFilterAmps {
  impellerNumber: number;
  overallAvgAmps: number | null;
  cycles: GatewayCycleAmpPoint[];
}

// Which impellers the gateway is set to show. amps[] and spareGrid[] only
// carry rows for these, so both lists can be shorter than 10 / 140.
// Optional: a gateway older than this change does not send it.
export interface GatewayImpellers {
  selected: number[];     // impeller numbers, e.g. [1, 2, 3, 5]
}

export interface GatewayLiveResponse {
  generatedAtUtc: string;
  plcConnected: boolean;
  lastScanAt: string | null;
  changedAt: string | null;
  machineStatus: GatewayMachineStatus | null;
  lifetime: GatewayLifetimeParam[];
  shotsBreakdown: GatewayShotsBreakdownEntry[];
  impellers?: GatewayImpellers | null;
  amps: GatewayAmpReading[];
  // Average current over the last completed cycle. Match to amps[] by
  // parameterName: an impeller with no sample in that cycle is absent.
  ampsLastCycle: GatewayAmpReading[];
  spareGrid: GatewaySpareRow[];
  spareAlerts: GatewaySpareRow[];
  section2: GatewaySection2 | null;  // not shown: the page computes its own filters
}

// /api/admin/history has no type here: the client page has no history view.
// gatewayProxy still proxies that endpoint (see CONTRACT-admin-api.md).

// POST /api/admin/filter request body — matches CONTRACT-admin-api.md exactly.
export interface GatewayFilterRequest {
  filterBy: 'time' | 'cycle' | 'metal';
  filterStart?: string;    // required when filterBy === 'time'
  filterEnd?: string;      // required when filterBy === 'time'
  periodLabel?: string;    // passed through verbatim, purely descriptive
  filterCycleFrom?: number; // required when filterBy === 'cycle'
  filterCycleTo?: number;   // required when filterBy === 'cycle'
  filterMetalName?: string; // required when filterBy === 'metal'
  selectedParameters?: FilterParameterKey[];
}

export type TrendBucket = 'hour' | 'day' | 'month';

export interface GatewayTrendsQuery {
  bucket: 'auto';  // always auto: only the gateway knows how much history exists
  start?: string;
  end?: string;
}

// GET /api/admin/trends — bucketed rollup behind the tile charts. Fetch once
// per dashboard load (and once per applied time filter), not on the live poll
// cadence — the underlying data changes at most once a minute server-side.
// Every bucket in the range is returned, including empty ones. Values are
// plotted as sent: a 0 is a real zero; a null is drawn as a gap, never replaced.
// Field for field the gateway dashboard's own DailyTrend, so its chart components port over
// unchanged. Only tonnageEnd is nullable (no Tonnage reading yet); an idle bucket is zeros.
export interface GatewayTrendPoint {
  day: string;              // bucket start (calendar day, or first-of-month for bucket=month)
  machineOnSec: number;
  blastOnSec: number;
  utilityPct: number;       // rebuilt from summed seconds, not averaged
  cycleCount: number;
  productionKg: number;
  tonnageEnd: number | null;
  energyKwh: number;
  efficiencyKwhPerKg: number;
}

/** A trends fetch: the rows plus the bucket the gateway picked (X-Trend-Bucket). */
export interface TrendSeries {
  /** The granularity the server actually used — the axis is titled from this. */
  bucket: TrendBucket;
  rows: GatewayTrendPoint[];
}

export type GatewayFailureReason =
  | 'timeout'
  | 'dns'
  | 'connection-refused'
  | 'tls-error'
  | 'unreachable'
  | 'auth-failed'
  | 'gateway-error';

export type ProxyResult<T> =
  | { ok: true; data: T; trendBucket?: string }
  | { ok: false; reason: GatewayFailureReason; status?: number; message?: string };
