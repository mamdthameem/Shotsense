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
  shotsUsage: number;
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
  shotsBreakdown: GatewayShotsBreakdownEntry[];
}

export interface GatewayLiveResponse {
  generatedAtUtc: string;
  plcConnected: boolean;
  lastScanAt: string | null;
  changedAt: string | null;
  machineStatus: GatewayMachineStatus | null;
  lifetime: GatewayLifetimeParam[];
  shotsBreakdown: GatewayShotsBreakdownEntry[];
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

export type ProxyResult<T> =
  | { ok: true; data: T }
  | { ok: false; reason: 'unreachable' | 'auth-failed' | 'gateway-error'; status?: number };
