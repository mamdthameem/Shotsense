import { licenseCheckUrl, siteProfileUrl } from '../firebase';

/**
 * The one code pasted into the gateway installer on a client's PC:
 *
 *   SSG1.<base64url of UTF-8 JSON>
 *
 * It carries everything that PC needs from the cloud — keys, licence and tag-file addresses, and the
 * Cloudflare tunnel token — so nobody types or copies settings by hand. The format is defined in the
 * gateway repo, INSTALLATION-CODE.md, and read by installer/scripts/Common.ps1
 * (ConvertFrom-InstallCode); keep the three in step. The installer ignores whitespace, so a code that
 * wraps when pasted still works.
 *
 * It contains every secret for that client: show it only to staff doing installs.
 */
export interface InstallCodeInput {
  clientId: string;
  clientName: string;
  /** The address the client's dashboard is reached at, host name only (e.g. plant.shotsense.com). */
  publicHostname: string;
  licenseKey: string;
  adminApiKey: string;
  tunnelToken: string | null;
}

export function buildInstallCode(c: InstallCodeInput): string {
  const tunnelToken = c.tunnelToken?.trim() ?? '';
  const payload = {
    v: 1,
    clientId: c.clientId,
    clientName: c.clientName,
    publicHostname: c.publicHostname,
    licenseCheckUrl: licenseCheckUrl(c.clientId),
    licenseKey: c.licenseKey,
    adminApiKey: c.adminApiKey,
    tunnelToken,
    siteProfileUrl: siteProfileUrl(c.clientId),
  };
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return 'SSG1.' + btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
