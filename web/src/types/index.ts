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
  castingMetals: string[];    // metal 1–4 names
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

export interface GatewayLifetimeParam {
  parameter: string;
  value: number | null;
  updatedAt: string;
}

export interface GatewaySpareAlert {
  impeller: number;
  spareIndex: number;
  spareName: string;
  runHours: number;
  thresholdHours: number;
}

export interface GatewayLiveResponse {
  plcConnected: boolean;
  lastScanAt: string | null;
  changedAt: string | null;
  lifetime: GatewayLifetimeParam[];
  spareAlerts: GatewaySpareAlert[];
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
