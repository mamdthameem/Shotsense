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

export interface GatewayShotsBreakdownEntry {
  refillTimestamp: string;
  blastCount: number;
}

export interface GatewayAmpReading {
  parameterName: string;  // Current_imp_1 … Current_imp_10 (lexicographic in payload)
  value: string;          // amperes, decimal text ("0" when absent)
  lastUpdated: string;
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

export interface GatewaySection2AmpPoint {
  parameterName: string;  // Current_imp_1 … Current_imp_10
  value: string;          // amperes, decimal text
  timestamp: string;      // when this reading was recorded
}

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
  results: GatewaySection2Result[];
  cycles: GatewaySection2Cycle[];
  metals: GatewaySection2Metal[];    // ordered by productionKg descending
  ampsHistory: GatewaySection2AmpPoint[]; // historical impeller current within the filter window
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
  spareGrid: GatewaySpareRow[];
  spareAlerts: GatewaySpareRow[];
  section2: GatewaySection2 | null;
}

export interface GatewayHistoryPoint {
  value: string | null;
  timestamp: string;
  reason: string;
}

export interface GatewayHistoryResponse {
  metric: string;
  from: string;
  to: string;
  count: number;
  limit: number;
  offset: number;
  points: GatewayHistoryPoint[];
}

// POST /api/admin/filter request body — matches CONTRACT-admin-api.md exactly.
export interface GatewayFilterRequest {
  filterBy: 'time' | 'cycle' | 'metal';
  filterStart?: string;    // required when filterBy === 'time'
  filterEnd?: string;      // required when filterBy === 'time'
  periodLabel?: string;    // passed through verbatim, purely descriptive
  filterCycleFrom?: number; // required when filterBy === 'cycle'
  filterCycleTo?: number;   // required when filterBy === 'cycle'
  filterMetalName?: string; // required when filterBy === 'metal'
}

export interface GatewayTrendsQuery {
  bucket?: 'hour' | 'day' | 'month'; // default 'day'; 'hour' requires start+end
  start?: string;
  end?: string;
}

// GET /api/admin/trends — whole-history rollup for the 4 graphable lifetime
// params. Fetch once per dashboard load, not on the live poll cadence — the
// underlying data changes at most once a minute server-side.
// The gateway now includes empty days (no activity) as their own entries, so
// the series has no gaps in its dates. Values are plotted as sent: a 0 is a
// real zero; a null (if ever sent) is drawn as a gap, never replaced.
export interface GatewayTrendPoint {
  day: string;              // bucket start (calendar day, or first-of-month for bucket=month)
  machineOnSec: number | null;
  blastOnSec: number | null;
  utilityPct: number | null;       // rebuilt from summed seconds, not averaged
  cycleCount: number | null;
  productionKg: number | null;
  tonnageEnd: number | null;
  energyKwh: number | null;
  efficiencyKwhPerKg: number | null;
}

/** Both trend series, each fetched once per dashboard load. */
export interface TrendSeries {
  day: GatewayTrendPoint[];
  month: GatewayTrendPoint[];
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
  | { ok: true; data: T }
  | { ok: false; reason: GatewayFailureReason; status?: number; message?: string };
