/**
 * NetSapiens WSS endpoint policy (updated 2026-07, per carrier instruction).
 *
 * SIP clients MUST register on a call-processing core node
 * (`core1.cluster1.ucstack.io` / `core2.cluster1.ucstack.io`), NOT on the
 * portal server. `voice.ava-telecom.ca` resolves to `portal1.cluster1.ucstack.io`,
 * which accepts the REGISTER but does not carry it for call delivery — inbound
 * calls then go straight to voicemail.
 */
export const PP_SIP_CORE_PRIMARY = "wss://core1.cluster1.ucstack.io:9002";
export const PP_SIP_CORE_SECONDARY = "wss://core2.cluster1.ucstack.io:9002";
export const PP_SIP_EDGE_FALLBACK = PP_SIP_CORE_PRIMARY;

const PORTAL_HOST = /(^|\.)(portal\d*|voice)[^/]*\.(ucstack\.io|ava-telecom\.ca)$/i;
const CORE_HOST = /(^|\.)core\d+\.[^/]*ucstack\.io$/i;

function hostOf(url: string): string {
  try { return new URL(url).hostname; } catch { return ""; }
}

export function isSipPortalWssUrl(url: string): boolean {
  const h = hostOf(url);
  return h ? PORTAL_HOST.test(h) : /voice\.ava-telecom\.ca|portal\d*\./i.test(url);
}

export function isSipCoreWssUrl(url: string): boolean {
  const h = hostOf(url);
  return h ? CORE_HOST.test(h) : /core\d+\./i.test(url);
}

/**
 * Normalizes, de-duplicates and strips portal URLs, then pins a SINGLE core
 * node (no core1/core2 alternation for the same AOR).
 */
export function filterSipEdgeUrls(
  candidates: (string | undefined | null)[],
  onDrop?: (message: string) => void,
): string[] {
  const all = Array.from(
    new Set(
      candidates
        .map((u) => String(u ?? "").trim())
        .filter((u) => /^wss?:\/\//i.test(u)),
    ),
  );
  const dropped = all.filter((u) => isSipPortalWssUrl(u) || !isSipCoreWssUrl(u));
  const cores = all.filter((u) => !isSipPortalWssUrl(u) && isSipCoreWssUrl(u));
  if (dropped.length) {
    onDrop?.(`non-core sip node(s) dropped (registration must live on one core node): ${dropped.join(", ")}`);
  }
  if (!cores.length) {
    onDrop?.(`no core URL resolved → falling back to ${PP_SIP_CORE_PRIMARY}`);
    return [PP_SIP_CORE_PRIMARY];
  }
  return [cores[0]];
}
