import { getFirestore } from "firebase-admin/firestore";
import { HttpsError, CallableRequest } from "firebase-functions/v2/https";

/**
 * Callable guard: the caller must be signed in AND listed in the admins
 * collection. Admin membership is managed from the Firebase console only.
 */
export async function assertAdmin(request: CallableRequest): Promise<string> {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "Sign in required.");
  }
  const adminDoc = await getFirestore().collection("admins").doc(uid).get();
  if (!adminDoc.exists) {
    throw new HttpsError("permission-denied", "Admin access required.");
  }
  return uid;
}

/**
 * Callable guard for managing client logins: the caller must carry the
 * superAdmin custom claim. The claim is set once per super admin with
 * scripts/grant-super-admin.mjs and never from the app, so an account can
 * only gain it with the project's own service-account credentials.
 */
export function assertSuperAdmin(request: CallableRequest): string {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "Sign in required.");
  }
  if (request.auth?.token?.superAdmin !== true) {
    throw new HttpsError("permission-denied", "Super admin access required.");
  }
  return uid;
}
