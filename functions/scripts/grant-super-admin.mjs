/**
 * One-time: give an account the superAdmin claim.
 *
 *   npm --prefix functions run grant-super-admin -- jc@example.com
 *
 * Needs the project's service-account credentials (see README, "Super admin"). That is the point:
 * the claim cannot be granted from the website or by any signed-in user, only by someone holding
 * the project's own key. Run it again any time to add another super admin, or with --revoke to
 * take the claim away.
 *
 * The account must already exist in Authentication → Users.
 */
import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

const args = process.argv.slice(2);
const revoke = args.includes("--revoke");
const email = args.find((a) => !a.startsWith("--"));

if (!email) {
  console.error("Usage: npm --prefix functions run grant-super-admin -- <email> [--revoke]");
  process.exit(1);
}

if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  console.error(
    "GOOGLE_APPLICATION_CREDENTIALS is not set. Download a service-account key\n" +
      "(Firebase console → Project settings → Service accounts → Generate new private key)\n" +
      "and point that variable at the JSON file."
  );
  process.exit(1);
}

initializeApp({ credential: applicationDefault() });

const auth = getAuth();
const user = await auth.getUserByEmail(email).catch(() => {
  console.error(`No account for ${email}. Create it in Authentication → Users first.`);
  process.exit(1);
});

const claims = { ...(user.customClaims ?? {}) };
if (revoke) {
  delete claims.superAdmin;
} else {
  claims.superAdmin = true;
}

await auth.setCustomUserClaims(user.uid, claims);
// Claims only reach a signed-in session when its ID token is reissued; revoking the refresh
// tokens forces that on the next request instead of up to an hour later.
await auth.revokeRefreshTokens(user.uid);

console.log(`${revoke ? "Removed" : "Granted"} superAdmin for ${email} (${user.uid}).`);
console.log("Sign out and back in on the dashboard to pick up the change.");
