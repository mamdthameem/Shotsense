import { initializeApp } from "firebase-admin/app";

initializeApp();

export { licenseCheck } from "./licenseCheck";
export { gatewayProxy } from "./gatewayProxy";
export { siteProfile, uploadSiteProfile } from "./siteProfile";
export { syncCloudAdminClaim, syncAdminClaims } from "./adminClaims";
export {
  createClientUser,
  listClientUsers,
  disableClientUser,
  enableClientUser,
  sendPasswordReset,
  changeUserRole,
} from "./clientUsers";
