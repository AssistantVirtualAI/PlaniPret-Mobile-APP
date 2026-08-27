/**
 * Cross-source de-duplication for Maestro call records.
 *
 * Calls reach Maestro from two publishers (the mobile app while the call is
 * live, and the server CDR pipeline afterwards) and NetSapiens often produces
 * several legs (orig/term, multi-device fork) for the same physical call.
 * Every publisher must claim a stable key here BEFORE posting; whoever claims
 * first owns the Maestro record and the others reuse its id instead of
 * creating a duplicate.
 */
const TABLE = "planipret_maestro_call_dedupe";

function last10(n?: string | null): string {
  const d = String(n ?? "").replace(/\D/g, "");
  return d.length > 10 ? d.slice(-10) : d;
}

/** direction + remote party + 2-minute bucket → stable across legs & publishers. */
export function callDedupeKey(input: {
  direction: string;
  remoteNumber?: string | null;
  startedAt?: string | number | Date | null;
  fallback?: string | null;
}): string {
  const dir = input.direction === "outbound" ? "outbound" : "inbound";
  const num = last10(input.remoteNumber as string) || "unknown";
  const t = input.startedAt ? new Date(input.startedAt as any).getTime() : NaN;
  if (!Number.isFinite(t)) {
    return `${dir}:${num}:${String(input.fallback ?? "nots").slice(0, 64)}`;
  }
  return `${dir}:${num}:${Math.floor(t / 120_000)}`;
}

export interface DedupeClaim {
  /** true when this caller owns the claim and must perform the POST. */
  owner: boolean;
  dedupeKey: string;
  maestroCallId: string | null;
}

/** Atomically claim (or read) the dedupe row for a call. */
export async function claimCallPost(
  admin: any,
  args: {
    userId?: string | null;
    dedupeKey: string;
    providerCallId?: string | null;
    localCallId?: string | null;
    source: string;
  },
): Promise<DedupeClaim> {
  const { dedupeKey } = args;
  const existing = await admin
    .from(TABLE)
    .select("id, maestro_call_id")
    .eq("dedupe_key", dedupeKey)
    .eq("user_id", args.userId ?? null)
    .maybeSingle();

  if (existing.data) {
    return { owner: false, dedupeKey, maestroCallId: existing.data.maestro_call_id ?? null };
  }

  const ins = await admin.from(TABLE).insert({
    user_id: args.userId ?? null,
    dedupe_key: dedupeKey,
    provider_call_id: args.providerCallId ?? null,
    local_call_id: args.localCallId ?? null,
    source: args.source,
  }).select("id, maestro_call_id").maybeSingle();

  if (ins.error) {
    // Unique violation → another publisher won the race.
    const again = await admin
      .from(TABLE)
      .select("maestro_call_id")
      .eq("dedupe_key", dedupeKey)
      .eq("user_id", args.userId ?? null)
      .maybeSingle();
    return { owner: false, dedupeKey, maestroCallId: again.data?.maestro_call_id ?? null };
  }

  return { owner: true, dedupeKey, maestroCallId: null };
}

export async function saveClaimResult(
  admin: any,
  args: { userId?: string | null; dedupeKey: string; maestroCallId: string | null },
) {
  await admin
    .from(TABLE)
    .update({ maestro_call_id: args.maestroCallId, updated_at: new Date().toISOString() })
    .eq("dedupe_key", args.dedupeKey)
    .eq("user_id", args.userId ?? null);
}

/** Release the claim so a later retry can post again (used when the POST failed). */
export async function releaseClaim(
  admin: any,
  args: { userId?: string | null; dedupeKey: string },
) {
  await admin
    .from(TABLE)
    .delete()
    .eq("dedupe_key", args.dedupeKey)
    .eq("user_id", args.userId ?? null)
    .is("maestro_call_id", null);
}
