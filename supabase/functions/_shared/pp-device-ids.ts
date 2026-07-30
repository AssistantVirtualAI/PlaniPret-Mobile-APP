/**
 * Planiprêt device (AOR) naming convention.
 *
 * NetSapiens device names cannot be renamed in place (portal: "Phone Name cannot
 * be changed"), and several downstream systems (Snap Mobile provisioning, the
 * web widget, some SIP clients) mangle or reject underscores in the AOR user
 * part. The convention is therefore:
 *
 *   mobile app  ->  <ext>M   (e.g. 113M)   — legacy: <ext>_mobile
 *   web/widget  ->  <ext>W   (e.g. 113W)   — legacy: <ext>_web
 *
 * Migration is create-new + delete-legacy, handled by ns-provision-broker-devices.
 */
export const MOBILE_SUFFIX = "M";
export const WEB_SUFFIX = "W";

export const mobileDeviceId = (ext: string | number) => `${ext}${MOBILE_SUFFIX}`;
export const webDeviceId = (ext: string | number) => `${ext}${WEB_SUFFIX}`;

export const legacyMobileDeviceId = (ext: string | number) => `${ext}_mobile`;
export const legacyWebDeviceId = (ext: string | number) => `${ext}_web`;

/** Every legacy AOR that must be removed once <ext>M / <ext>W exist. */
export const legacyDeviceIds = (ext: string | number) => [
  legacyMobileDeviceId(ext),
  legacyWebDeviceId(ext),
];

export const bareAorId = (v: unknown) =>
  String(v ?? "").replace(/^sip:/i, "").split("@")[0].trim();

/** Matches <ext>M and the legacy <ext>_mobile (case-insensitive). */
export function isMobileDeviceId(id: unknown, ext: string | number): boolean {
  const v = bareAorId(id).toLowerCase();
  const e = String(ext).toLowerCase();
  return v === `${e}m` || v === `${e}_mobile`;
}

/** Matches <ext>W and the legacy <ext>_web (case-insensitive). */
export function isWebDeviceId(id: unknown, ext: string | number): boolean {
  const v = bareAorId(id).toLowerCase();
  const e = String(ext).toLowerCase();
  return v === `${e}w` || v === `${e}_web`;
}
