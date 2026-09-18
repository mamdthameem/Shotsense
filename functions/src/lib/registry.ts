import { getFirestore, DocumentReference, Timestamp } from "firebase-admin/firestore";

export type ContactStatus = "ok" | "unreachable" | "auth-failed";

export type ClientEventType =
  | "license-ok"
  | "license-denied"
  | "pull-ok"
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
}

export type LicenseStatus = "active" | "grace" | "expired" | "suspended";

const MAX_EVENTS = 20;

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

/** Append an event to the capped recentEvents list (newest last). */
export function appendEvent(existing: ClientEvent[] | undefined, event: ClientEvent): ClientEvent[] {
  const events = [...(existing ?? []), event];
  return events.slice(-MAX_EVENTS);
}
