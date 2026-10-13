import { getAuth, UserRecord } from "firebase-admin/auth";
import { FieldValue, getFirestore, Timestamp } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v2";
import { assertAdmin, isCloudAdmin } from "./lib/admin";
import { clientRef, isValidClientId } from "./lib/registry";

/**
 * Logins for a client company's own people, managed by the cloud admins (any of them: every cloud
 * admin has the same access). These people sign in to their own gateway's dashboard only; the
 * cloud website stays admins-only.
 *
 * Who a user is lives in two places, each for a reason:
 *   - **Custom claims on the Firebase account** (`clientId`, `role`) are what a server trusts.
 *     They ride inside the signed ID token, so a gateway or a rule can act on them without a
 *     database read, and nobody can forge them.
 *   - **A document in `clientUsers`** is the readable copy — name, email, role, disabled — so the
 *     dashboard can list a client's people in one query. Firebase Auth has no "list users of
 *     client X" query, only a full-project scan.
 *
 * Claims are the source of truth for access; the document is the source of truth for display.
 * Every function here writes both, claims first.
 *
 * **No password ever passes through this code.** Accounts are created without one, and the person
 * sets their own through a Firebase password link. Nobody — not even a cloud admin — can read
 * or choose someone else's password.
 */

export type ClientUserRole = "admin" | "viewer";

const ROLES: ReadonlySet<string> = new Set<ClientUserRole>(["admin", "viewer"]);

const CALL_OPTIONS = { region: "asia-south1", maxInstances: 2, memory: "256MiB" } as const;

const USERS = "clientUsers";

interface ClientUserDoc {
  uid: string;
  email: string;
  name: string;
  clientId: string;
  role: ClientUserRole;
  disabled: boolean;
  createdAt: Timestamp | FieldValue;
  updatedAt: Timestamp | FieldValue;
}

/** What the dashboard receives. Timestamps become ISO strings; nothing secret is included. */
interface ClientUserView {
  uid: string;
  email: string;
  name: string;
  clientId: string;
  role: ClientUserRole;
  disabled: boolean;
  createdAt: string | null;
  lastSignInAt: string | null;
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new HttpsError("invalid-argument", `${field} is required.`);
  }
  return value.trim();
}

function requireRole(value: unknown): ClientUserRole {
  const role = requireString(value, "role");
  if (!ROLES.has(role)) {
    throw new HttpsError("invalid-argument", "role must be 'admin' or 'viewer'.");
  }
  return role as ClientUserRole;
}

function requireEmail(value: unknown): string {
  const email = requireString(value, "email").toLowerCase();
  // Deliberately loose: Firebase Auth is the real validator. This only rejects obvious rubbish.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new HttpsError("invalid-argument", "That does not look like an email address.");
  }
  return email;
}

/** The client must exist, so a typo cannot create users against a client that was never set up. */
async function requireClient(clientId: unknown): Promise<string> {
  if (!isValidClientId(clientId)) {
    throw new HttpsError("invalid-argument", "A valid clientId is required.");
  }
  const snap = await clientRef(clientId).get();
  if (!snap.exists) {
    throw new HttpsError("not-found", "Unknown client.");
  }
  return clientId;
}

/**
 * Loads a managed client user, by uid. Refuses accounts this screen does not own: a cloud admin
 * (so the roster cannot be used to lock an admin out of the project) and any account without a
 * clientId claim (one created by hand in the console).
 */
async function requireClientUser(uid: unknown): Promise<UserRecord> {
  const id = requireString(uid, "uid");
  let user: UserRecord;
  try {
    user = await getAuth().getUser(id);
  } catch {
    throw new HttpsError("not-found", "No such user.");
  }
  const claims = user.customClaims ?? {};
  if (await isCloudAdmin(user.uid)) {
    throw new HttpsError("failed-precondition", "That is a cloud admin account; manage it outside this screen.");
  }
  if (typeof claims.clientId !== "string") {
    throw new HttpsError("failed-precondition", "That account does not belong to a client.");
  }
  return user;
}

const iso = (value?: string): string | null => (value ? new Date(value).toISOString() : null);

function toView(user: UserRecord, doc: Partial<ClientUserDoc> | undefined): ClientUserView {
  const claims = user.customClaims ?? {};
  return {
    uid: user.uid,
    email: user.email ?? doc?.email ?? "",
    name: user.displayName ?? doc?.name ?? "",
    clientId: (claims.clientId as string) ?? doc?.clientId ?? "",
    role: ((claims.role as ClientUserRole) ?? doc?.role ?? "viewer"),
    // Firebase Auth is authoritative for disabled: a disabled account cannot sign in whatever
    // the mirror document says.
    disabled: user.disabled,
    createdAt: iso(user.metadata.creationTime),
    lastSignInAt: iso(user.metadata.lastSignInTime),
  };
}

/**
 * Creates a client login and returns a link for setting its first password.
 *
 * The account is created with no password at all, so there is no temporary secret to leak or to
 * be left in place. The link is also emailed by Firebase from the dashboard (its mailer is the
 * only one this project has); the returned link is the fallback for when that email does not
 * arrive.
 */
export const createClientUser = onCall(CALL_OPTIONS, async (request) => {
  await assertAdmin(request);

  const { email: rawEmail, name: rawName, clientId: rawClientId, role: rawRole } = request.data ?? {};
  const email = requireEmail(rawEmail);
  const name = requireString(rawName, "name");
  const clientId = await requireClient(rawClientId);
  const role = requireRole(rawRole);

  let user: UserRecord;
  try {
    user = await getAuth().createUser({ email, displayName: name, disabled: false });
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code === "auth/email-already-exists") {
      throw new HttpsError("already-exists", "That email already has an account.");
    }
    logger.error("createUser failed", { email, err });
    throw new HttpsError("internal", "Could not create the user.");
  }

  await getAuth().setCustomUserClaims(user.uid, { clientId, role });

  const doc: ClientUserDoc = {
    uid: user.uid,
    email,
    name,
    clientId,
    role,
    disabled: false,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };
  await getFirestore().collection(USERS).doc(user.uid).set(doc);

  const resetLink = await getAuth().generatePasswordResetLink(email);
  return { uid: user.uid, email, resetLink };
});

/** Every login belonging to one client. */
export const listClientUsers = onCall(CALL_OPTIONS, async (request) => {
  await assertAdmin(request);
  const clientId = await requireClient((request.data ?? {}).clientId);

  const snap = await getFirestore().collection(USERS).where("clientId", "==", clientId).get();
  const docs = snap.docs.map((d) => d.data() as ClientUserDoc);

  // Read each account back from Auth: disabled, last sign-in and the live claims are there, and
  // the mirror document can be out of date if an account was changed in the console.
  const users = await Promise.all(
    docs.map(async (doc) => {
      try {
        return toView(await getAuth().getUser(doc.uid), doc);
      } catch {
        // Deleted in the console but still mirrored here. Say so rather than dropping the row.
        return null;
      }
    })
  );

  return {
    users: users
      .filter((u): u is ClientUserView => u !== null)
      .sort((a, b) => a.email.localeCompare(b.email)),
  };
});

/** Blocks a login immediately: disabled in Auth, and existing sessions revoked. */
export const disableClientUser = onCall(CALL_OPTIONS, async (request) => {
  await assertAdmin(request);
  const user = await requireClientUser((request.data ?? {}).uid);

  await getAuth().updateUser(user.uid, { disabled: true });
  // Without this an already-signed-in user keeps working until their ID token expires (~1 hour).
  await getAuth().revokeRefreshTokens(user.uid);
  await getFirestore().collection(USERS).doc(user.uid).set(
    { disabled: true, updatedAt: FieldValue.serverTimestamp() },
    { merge: true }
  );

  return { uid: user.uid, disabled: true };
});

export const enableClientUser = onCall(CALL_OPTIONS, async (request) => {
  await assertAdmin(request);
  const user = await requireClientUser((request.data ?? {}).uid);

  await getAuth().updateUser(user.uid, { disabled: false });
  await getFirestore().collection(USERS).doc(user.uid).set(
    { disabled: false, updatedAt: FieldValue.serverTimestamp() },
    { merge: true }
  );

  return { uid: user.uid, disabled: false };
});

/**
 * A password-reset link for a client user. The dashboard has Firebase send the email as well;
 * this link is what a cloud admin can pass on by hand when it does not arrive.
 */
export const sendPasswordReset = onCall(CALL_OPTIONS, async (request) => {
  await assertAdmin(request);
  const email = requireEmail((request.data ?? {}).email);

  let user: UserRecord;
  try {
    user = await getAuth().getUserByEmail(email);
  } catch {
    throw new HttpsError("not-found", "No account with that email.");
  }
  await requireClientUser(user.uid);

  return { email, resetLink: await getAuth().generatePasswordResetLink(email) };
});

/** Moves a user between admin and viewer. */
export const changeUserRole = onCall(CALL_OPTIONS, async (request) => {
  await assertAdmin(request);
  const { uid, role: rawRole } = request.data ?? {};
  const user = await requireClientUser(uid);
  const role = requireRole(rawRole);

  const claims = user.customClaims ?? {};
  // Keep clientId: setCustomUserClaims replaces the whole claim set, so spreading is what stops
  // a role change from quietly detaching the user from their client.
  await getAuth().setCustomUserClaims(user.uid, { ...claims, role });
  // The old role sits in the user's current ID token until it expires; revoking forces a new one.
  await getAuth().revokeRefreshTokens(user.uid);
  await getFirestore().collection(USERS).doc(user.uid).set(
    { role, updatedAt: FieldValue.serverTimestamp() },
    { merge: true }
  );

  return { uid: user.uid, role };
});
