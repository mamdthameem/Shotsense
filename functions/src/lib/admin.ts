import { getFirestore } from "firebase-admin/firestore";
import { HttpsError, CallableRequest } from "firebase-functions/v2/https";

/** True when this login is a cloud admin: an admins/{uid} document exists. */
export async function isCloudAdmin(uid: string): Promise<boolean> {
  return (await getFirestore().collection("admins").doc(uid).get()).exists;
}

/**
 * Callable guard: the caller must be signed in AND listed in the admins
 * collection. Admin membership is managed from the Firebase console only.
 *
 * Every cloud admin has the same access — clients, gateway pulls, impeller
 * selection and client logins alike (decided 2026-10-13). Roles (admin /
 * viewer) exist only for client users, on their own gateway.
 */
export async function assertAdmin(request: CallableRequest): Promise<string> {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "Sign in required.");
  }
  if (!(await isCloudAdmin(uid))) {
    throw new HttpsError("permission-denied", "Admin access required.");
  }
  return uid;
}
