/**
 * NetSapiens core nodes (core1.cluster1.ucstack.io …) accept a REGISTER, answer
 * 200 OK, then close the WebSocket with 1001 "Going Away" a few seconds later.
 * Client registrations MUST live on the SBC edge (voice.ava-telecom.ca:9002).
 * Measured live 2026-05/07. This is the last-line client guard: even if the
 * backend or a cached device row hands us a core URL, we never dial it.
 */
export const PP_SIP_EDGE_FALLBACK = "wss://voice.ava-telecom.ca:9002";

export function isCoreWssUrl(u: string): boolean {
  try {
    return /(^|\.)(core\d*|cluster\d*)[^/]*\.ucstack\.io$/i.test(new URL(u).hostname);
  } catch {
    return /ucstack\.io/i.test(u);
  }
}

/** Keep only SBC-edge WSS targets; fall back to the known edge when empty. */
export function edgeOnlyWssUrls(candidates: (string | null | undefined)[]): string[] {
  const kept = Array.from(
    new Set(
      candidates
        .map((u) => String(u ?? "").trim())
        .filter((u) => /^wss?:\/\//i.test(u))
        .filter((u) => !isCoreWssUrl(u))
    )
  );
  return kept.length ? kept : [PP_SIP_EDGE_FALLBACK];
}
