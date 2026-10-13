import { createHash, timingSafeEqual } from "crypto";
import { getFirestore, DocumentReference, Timestamp } from "firebase-admin/firestore";

export type ContactStatus = "ok" | "unreachable" | "auth-failed";

export type ClientEventType =
  | "license-ok"
  | "license-denied"
  | "pull-ok"
  // The gateway answered with an error: reached, but the query failed.
  | "pull-error"
  | "pull-unreachable"
  | "pull-auth-failed";

export interface ClientEvent {
  at: string; // ISO timestamp
  type: ClientEventType;
  detail?: string;
}

export interface ClientDoc {
  name: string;
  staticIp: string;
  port: number;
  useTls: boolean;
  hostnameOverride: string | null;
  adminApiKey: string;
  licenseKey: string;
  licenseExpiresAt: Timestamp | null;
  graceDays: number;
  suspended: boolean;
  lastLicenseCheckAt: Timestamp | null;
  lastAdminContactAt: Timestamp | null;
  lastContactStatus: ContactStatus | null;
  recentEvents: ClientEvent[];
  // The Cloudflare tunnel token for this client's PC. A credential: it goes into the installation
  // code and nowhere else. Admin-only, like the keys above.
  tunnelToken?: string | null;
  // Summary of the client's tag file (the file itself is in siteProfiles/{clientId}, never readable
  // from a browser). siteProfileVersion is also what licenseCheck reports to the gateway.
  siteProfileVersion?: string | null;
  siteProfileTagCount?: number | null;
  siteProfileFileName?: string | null;
  siteProfileUploadedAt?: Timestamp | null;
}

export type LicenseStatus = "active" | "grace" | "expired" | "suspended";

const MAX_EVENTS = 20;

/** Client IDs are short generated tokens; anything else (slashes, empty, huge) is rejected before touching Firestore. */
export function isValidClientId(id: unknown): id is string {
  return typeof id === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(id);
}

export function clientRef(clientId: string): DocumentReference {
  return getFirestore().collection("clients").doc(clientId);
}

/** Status is always derived from the allocated expiry date — never stored. */
export function deriveLicenseStatus(client: ClientDoc, now: Date): LicenseStatus {
  if (client.suspended) return "suspended";
  const expiresAt = client.licenseExpiresAt?.toDate();
  if (!expiresAt) return "expired";
  if (now <= expiresAt) return "active";
  const graceMs = (client.graceDays ?? 0) * 24 * 60 * 60 * 1000;
  if (now.getTime() <= expiresAt.getTime() + graceMs) return "grace";
  return "expired";
}

/** Constant-time key comparison (hashes normalize length first). */
export function keysMatch(provided: string, stored: string): boolean {
  if (!stored) return false;
  const a = createHash("sha256").update(provided).digest();
  const b = createHash("sha256").update(stored).digest();
  return timingSafeEqual(a, b);
}

/** Append an event to the capped recentEvents list (newest last). */
export function appendEvent(existing: ClientEvent[] | undefined, event: ClientEvent): ClientEvent[] {
  const events = [...(existing ?? []), event];
  return events.slice(-MAX_EVENTS);
}
