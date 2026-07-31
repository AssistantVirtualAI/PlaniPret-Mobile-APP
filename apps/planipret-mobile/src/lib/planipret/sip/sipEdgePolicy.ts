/**
 * NetSapiens WSS endpoint policy (updated 2026-07, per carrier instruction).
 *
 * SIP clients MUST register on a call-processing core node
 * (`core1.cluster1.ucstack.io` / `core2.cluster1.ucstack.io`), NOT on the
 * portal server. `voice.ava-telecom.ca` resolves to `portal1.cluster1.ucstack.io`,
 * which accepts the REGISTER but does not carry the registration for call
 * delivery — inbound calls then go straight to voicemail.
 *
 * So: portal hosts are dropped, core hosts are preferred.
 */
export const PP_SIP_CORE_PRIMARY = "wss://core1.cluster1.ucstack.io:9002";
export const PP_SIP_CORE_SECONDARY = "wss://core2.cluster1.ucstack.io:9002";
export const PP_SIP_EDGE_FALLBACK = PP_SIP_CORE_PRIMARY;

const PORTAL_HOST = /(^|\.)(portal\d*|voice)[^/]*\.(ucstack\.io|ava-telecom\.ca)$/i;
const CORE_HOST = /(^|\.)core\d+\.[^/]*ucstack\.io$/i;

function hostOf(u: string): string {
  try { return new URL(u).hostname; } catch { return ""; }
}

/** True for portal / non-call-processing hosts that must never carry a REGISTER. */
export function isPortalWssUrl(u: string): boolean {
  const h = hostOf(u);
  return h ? PORTAL_HOST.test(h) : /voice\.ava-telecom\.ca|portal\d*\./i.test(u);
}

/** True for a call-processing core node (valid registration target). */
export function isCoreWssUrl(u: string): boolean {
  const h = hostOf(u);
  return h ? CORE_HOST.test(h) : /core\d+\./i.test(u);
}

/** Keep a SINGLE core WSS target (no core1/core2 alternation). */
export function edgeOnlyWssUrls(candidates: (string | null | undefined)[]): string[] {
  const kept = Array.from(
    new Set(
      candidates
        .map((u) => String(u ?? "").trim())
        .filter((u) => /^wss?:\/\//i.test(u))
        .filter((u) => !isPortalWssUrl(u))
        .filter(isCoreWssUrl)
    )
  );
  return [kept[0] ?? PP_SIP_CORE_PRIMARY];
}
