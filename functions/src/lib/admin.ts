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
