import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
} from 'firebase/firestore';
import { db } from '../firebase';
import type { Client, ClientEvent, ContactStatus, LicenseStatus } from '../types';
import { endOfDay } from '../utils/formatters';

const CLIENTS = 'clients';

const toDateOrNull = (value: unknown): Date | null =>
  value instanceof Timestamp ? value.toDate() : null;

const fromSnapshot = (id: string, data: Record<string, unknown>): Client => ({
  id,
  name: (data.name as string) ?? '',
  staticIp: (data.staticIp as string) ?? '',
  port: (data.port as number) ?? 443,
  useTls: (data.useTls as boolean) ?? false,
  hostnameOverride: (data.hostnameOverride as string | null) ?? null,
  adminApiKey: (data.adminApiKey as string) ?? '',
  licenseKey: (data.licenseKey as string) ?? '',
  licenseExpiresAt: toDateOrNull(data.licenseExpiresAt),
  graceDays: (data.graceDays as number) ?? 0,
  suspended: (data.suspended as boolean) ?? false,
  lastLicenseCheckAt: toDateOrNull(data.lastLicenseCheckAt),
  lastAdminContactAt: toDateOrNull(data.lastAdminContactAt),
  lastContactStatus: (data.lastContactStatus as ContactStatus | null) ?? null,
  recentEvents: (data.recentEvents as ClientEvent[]) ?? [],
  createdAt: toDateOrNull(data.createdAt),
  updatedAt: toDateOrNull(data.updatedAt),
});

/** Live subscription to the whole registry (small collection, admin-only). */
export function subscribeClients(
  onChange: (clients: Client[]) => void,
  onError: (error: Error) => void
): () => void {
  const q = query(collection(db, CLIENTS), orderBy('name'));
  return onSnapshot(
    q,
    (snap) => onChange(snap.docs.map((d) => fromSnapshot(d.id, d.data()))),
    onError
  );
}

export interface ClientInput {
  name: string;
  staticIp: string;
  port: number;
  useTls: boolean;
  hostnameOverride: string | null;
  adminApiKey: string;
  licenseKey: string;
  licenseExpiresAt: Date | null;
  graceDays: number;
  suspended: boolean;
}

const inputToDoc = (input: ClientInput) => ({
  ...input,
  // License is valid through the end of the chosen day.
  licenseExpiresAt: input.licenseExpiresAt
    ? Timestamp.fromDate(endOfDay(input.licenseExpiresAt) as Date)
    : null,
  updatedAt: serverTimestamp(),
});

export async function addClient(id: string, input: ClientInput): Promise<void> {
  await setDoc(doc(db, CLIENTS, id), {
    ...inputToDoc(input),
    lastLicenseCheckAt: null,
    lastAdminContactAt: null,
    lastContactStatus: null,
    recentEvents: [],
    createdAt: serverTimestamp(),
  });
}

export async function updateClient(id: string, input: ClientInput): Promise<void> {
  await updateDoc(doc(db, CLIENTS, id), inputToDoc(input));
}

export async function extendLicense(id: string, newExpiry: Date): Promise<void> {
  await updateDoc(doc(db, CLIENTS, id), {
    licenseExpiresAt: Timestamp.fromDate(endOfDay(newExpiry) as Date),
    updatedAt: serverTimestamp(),
  });
}

export async function deleteClient(id: string): Promise<void> {
  await deleteDoc(doc(db, CLIENTS, id));
}

/** Derived, never stored — mirrors the licenseCheck function's logic. */
export function licenseStatusOf(client: Client, now: Date = new Date()): LicenseStatus {
  if (client.suspended) return 'suspended';
  if (!client.licenseExpiresAt) return 'expired';
  if (now <= client.licenseExpiresAt) return 'active';
  const graceMs = (client.graceDays ?? 0) * 24 * 60 * 60 * 1000;
  if (now.getTime() <= client.licenseExpiresAt.getTime() + graceMs) return 'grace';
  return 'expired';
}
