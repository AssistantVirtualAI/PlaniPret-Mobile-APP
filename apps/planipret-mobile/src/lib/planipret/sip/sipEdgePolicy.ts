/**
 * NetSapiens WSS endpoint policy.
 *
 * Verified against the live platform (2026-05): registering on the core node
 * `core1.cluster1.ucstack.io:9002` returns `200 OK` and then the server closes
 * the WebSocket with code **1001 (Going Away)** ~10-15 s later — core nodes are
 * not meant to carry client registrations, they drain them to the SBC edge.
 * The SBC edge `voice.ava-telecom.ca:9002` keeps the same registration alive.
 *
 * Any core/cluster host must therefore never be offered to JsSIP as a socket:
 * a single core socket in the list is enough to produce the endless
 * REGISTER -> 1001 -> reconnect loop, because JsSIP round-robins the sockets.
 */
const SIP_CORE_HOST_PATTERN = /(^|\.)(core\d*|cluster\d*)[^/]*\.ucstack\.io$/i;

export const PP_SIP_EDGE_FALLBACK = "wss://voice.ava-telecom.ca:9002";

export function isSipCoreWssUrl(url: string): boolean {
  try {
    return SIP_CORE_HOST_PATTERN.test(new URL(url).hostname);
  } catch {
    return /ucstack\.io/i.test(url);
  }
}

/**
 * Normalizes, de-duplicates and strips core-node URLs from a candidate list.
 * Falls back to the SBC edge when every candidate was a core node.
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
  const dropped = all.filter(isSipCoreWssUrl);
  const kept = all.filter((u) => !isSipCoreWssUrl(u));
  if (dropped.length) {
    onDrop?.(`sip core node(s) dropped (1001 Going Away): ${dropped.join(", ")}`);
  }
  if (!kept.length) {
    onDrop?.(`no SBC edge URL resolved → falling back to ${PP_SIP_EDGE_FALLBACK}`);
    return [PP_SIP_EDGE_FALLBACK];
  }
  return kept;
}
