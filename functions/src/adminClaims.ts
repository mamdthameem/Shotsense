import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { onCall } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v2";
import { assertAdmin } from "./lib/admin";

/**
 * ShotSense office staff (cloud admins) may sign in to EVERY client's gateway dashboard with their own
 * email, as admin (decided 2026-10-26). A gateway cannot read Firestore, so it learns who is office
 * staff from the signed ID token: a `cloudAdmin: true` custom claim, kept in step with the admins
 * collection here.
 *
 *   - syncCloudAdminClaim: an admins/{uid} document created or deleted (in the Firebase console) sets
 *     or removes the claim at once. On removal the account's sessions are revoked too, so its gateway
 *     access ends within the hour an ID token lives.
 *   - syncAdminClaims: sets the claim on every current admin. For admins made before this existed;
 *     the cloud website calls it when a signed-in admin's token does not carry the claim yet.
 *
 * Other claims on the account are kept as they are.
 */

const REGION = "asia-south1";

async function setCloudAdmin(uid: string, isAdmin: boolean): Promise<boolean> {
  let claims: Record<string, unknown>;
  try {
    claims = { ...((await getAuth().getUser(uid)).customClaims ?? {}) };
  } catch {
    logger.warn("admins/{uid} names no existing account", { uid });
    return false;
  }
  if ((claims.cloudAdmin === true) === isAdmin) return false;
  if (isAdmin) claims.cloudAdmin = true;
  else delete claims.cloudAdmin;
  await getAuth().setCustomUserClaims(uid, claims);
  if (!isAdmin) await getAuth().revokeRefreshTokens(uid);
  logger.info(isAdmin ? "cloudAdmin claim set" : "cloudAdmin claim removed", { uid });
  return true;
}

export const syncCloudAdminClaim = onDocumentWritten(
  { document: "admins/{uid}", region: REGION, maxInstances: 2 },
  async (event) => {
    await setCloudAdmin(event.params.uid, event.data?.after.exists ?? false);
  }
);

export const syncAdminClaims = onCall(
  { region: REGION, maxInstances: 2, memory: "256MiB" },
  async (request) => {
    await assertAdmin(request);
    const admins = await getFirestore().collection("admins").get();
    let updated = 0;
    for (const doc of admins.docs) {
      if (await setCloudAdmin(doc.id, true)) updated++;
    }
    return { admins: admins.size, updated };
  }
);
