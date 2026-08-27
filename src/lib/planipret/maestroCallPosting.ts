/**
 * Maestro call-posting rules (agreed with Scott, Aug 2026).
 *
 *   1. POST when creating an outbound call to a client.
 *   2. POST when creating an outbound call to a broker's VoIP number.
 *   3. POST when receiving an inbound call from a client.
 *   4. Do NOT post when receiving an inbound call from a broker's VoIP number
 *      (the calling broker already created the record via rule 2).
 *
 * `POST /calls` is idempotent upstream, so a duplicate post from a second
 * device is safe; we still de-duplicate locally by provider_call_id and by a
 * short-lived dedup key (direction + number) so that the push-then-INVITE
 * sequence never produces two records.
 *
 * Every decision is recorded as telemetry so the in-app status panel and
 * production logs can explain why a call was posted or skipped.
 */
import { supabase } from "@/integrations/supabase/client";
import { maestroTelecom } from "@/lib/planipret/maestroTelecom";

export type MaestroPostState = "pending" | "posted" | "skipped" | "failed";
export type MaestroCallDirection = "inbound" | "outbound";
export type MaestroClassification = "client" | "broker_voip" | "unknown" | "n/a";

export interface MaestroPostRecord {
  callId: string;
  dedupKey: string;
  direction: MaestroCallDirection;
  number: string;
  state: MaestroPostState;
  /** Machine-readable reason code for the current state. */
  reason: string;
  classification: MaestroClassification;
  attempts: number;
  lastError: string | null;
  /** Set once the end-of-call update has been sent. */
  endedUpdate: "none" | "sent" | "failed" | "blocked";
  createdAt: number;
  updatedAt: number;
}

const MAX_RECORDS = 40;
const DEDUP_WINDOW_MS = 90_000;
const POST_MAX_ATTEMPTS = 3;
const POST_WAIT_TIMEOUT_MS = 8_000;

const records = new Map<string, MaestroPostRecord>();
const inflight = new Map<string, Promise<MaestroPostRecord>>();
/** dedupKey → { callId, at } for cross-callId de-duplication. */
const recentDedup = new Map<string, { callId: string; at: number }>();
/** local provider call id → Maestro call id returned by the server publisher. */
const maestroIds = new Map<string, string>();
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) {
    try { l(); } catch { /* listener errors must not break call flow */ }
  }
}

export function subscribeMaestroPosting(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function getMaestroPostingRecords(): MaestroPostRecord[] {
  return [...records.values()].sort((a, b) => b.createdAt - a.createdAt);
}

export function getMaestroPostRecord(callId?: string | null): MaestroPostRecord | null {
  const id = String(callId ?? "").trim();
  return id ? records.get(id) ?? null : null;
}

export function wasPostedToMaestro(providerCallId?: string | null): boolean {
  return getMaestroPostRecord(providerCallId)?.state === "posted";
}

function log(event: string, payload: Record<string, unknown>) {
  // Single structured line so production log search can filter on [maestro-call].
  console.info(`[maestro-call] ${event}`, JSON.stringify(payload));
}

function digits(n: string): string {
  return String(n || "").replace(/[^\d]/g, "");
}

/** Last 10 digits — NANP-safe comparison key. */
function key(n: string): string {
  const d = digits(n);
  return d.length > 10 ? d.slice(-10) : d;
}

export function buildDedupKey(direction: MaestroCallDirection, number: string): string {
  return `${direction}:${key(number) || "unknown"}`;
}

function upsert(callId: string, patch: Partial<MaestroPostRecord> & { direction: MaestroCallDirection; number: string }): MaestroPostRecord {
  const now = Date.now();
  const prev = records.get(callId);
  const next: MaestroPostRecord = {
    callId,
    dedupKey: prev?.dedupKey ?? buildDedupKey(patch.direction, patch.number),
    direction: patch.direction,
    number: patch.number,
    state: patch.state ?? prev?.state ?? "pending",
    reason: patch.reason ?? prev?.reason ?? "queued",
    classification: patch.classification ?? prev?.classification ?? "unknown",
    attempts: patch.attempts ?? prev?.attempts ?? 0,
    lastError: patch.lastError !== undefined ? patch.lastError : prev?.lastError ?? null,
    endedUpdate: patch.endedUpdate ?? prev?.endedUpdate ?? "none",
    createdAt: prev?.createdAt ?? now,
    updatedAt: now,
  };
  records.set(callId, next);
  if (records.size > MAX_RECORDS) {
    const oldest = getMaestroPostingRecords().slice(MAX_RECORDS);
    for (const r of oldest) records.delete(r.callId);
  }
  emit();
  return next;
}

let brokerNumbers: Set<string> | null = null;
let brokerLoad: Promise<Set<string> | null> | null = null;

async function loadBrokerNumbers(): Promise<Set<string> | null> {
  if (brokerNumbers) return brokerNumbers;
  if (brokerLoad) return brokerLoad;
  brokerLoad = (async () => {
    try {
      const { data, error } = await supabase.functions.invoke("maestro-actions", {
        body: { action: "list_brokers", page_size: 200 },
      });
      if (error || (data as any)?.success === false) return null;
      const list: any[] = (data as any)?.brokers ?? (data as any)?.clients ?? [];
      if (!Array.isArray(list)) return null;
      const set = new Set<string>();
      for (const b of list) {
        for (const v of [b?.phone, b?.voip_number, b?.cell_phone, b?.work_phone, b?.did, b?.extension]) {
          const k = key(String(v ?? ""));
          if (k) set.add(k);
        }
      }
      brokerNumbers = set;
      return set;
    } catch {
      return null;
    } finally {
      brokerLoad = null;
    }
  })();
  return brokerLoad;
}

/**
 * Is the remote party an internal broker VoIP number?
 * Returns `null` when it cannot be determined (network/link failure).
 */
export async function isBrokerVoipNumber(number: string): Promise<boolean | null> {
  const d = digits(number);
  if (!d) return null;
  // Bare extension → always internal.
  if (d.length >= 3 && d.length <= 5) return true;
  const set = await loadBrokerNumbers();
  if (!set) return null;
  return set.has(key(d));
}

type PostArgs = { providerCallId?: string | null; number?: string | null };

/** Returns an existing record when this call (or its dedup key) was already handled. */
function findDuplicate(callId: string, dedupKey: string): MaestroPostRecord | null {
  const own = records.get(callId);
  if (own && own.state !== "failed") return own;
  const recent = recentDedup.get(dedupKey);
  if (recent && Date.now() - recent.at < DEDUP_WINDOW_MS && recent.callId !== callId) {
    const r = records.get(recent.callId);
    if (r && (r.state === "posted" || r.state === "pending")) return r;
  }
  return null;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Maestro rejects non-E.164 numbers with HTTP 422 — normalise before posting. */
function toE164(raw: string): string | undefined {
  const digits = String(raw ?? "").replace(/[^\d]/g, "");
  if (!digits) return undefined;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  if (digits.length > 11) return `+${digits}`;
  return undefined;
}

/**
 * Le pipeline serveur (`maestro-cdr` / `maestro-sync-call`) crée déjà l'appel
 * dans Maestro avec `provider_call_id = ns_call_id`. L'appareil utilisait son
 * propre identifiant SIP : Maestro recevait donc DEUX enregistrements par appel
 * (et davantage après une relance). Le serveur est désormais l'unique écrivain;
 * l'appareil ne fait plus que journaliser localement.
 */
const DEVICE_CREATES_CALLS = false;

async function post(
  callId: string,
  number: string,
  direction: MaestroCallDirection,
  classification: MaestroClassification,
): Promise<MaestroPostRecord> {
  const dedupKey = buildDedupKey(direction, number);
  recentDedup.set(dedupKey, { callId, at: Date.now() });
  if (!DEVICE_CREATES_CALLS) {
    const rec = upsert(callId, { direction, number, classification, state: "skipped", reason: "server_owns_creation" });
    log("skipped_server_owns_creation", { callId, dedupKey, direction, number, classification });
    return rec;
  }
  upsert(callId, { direction, number, classification, state: "pending", reason: "posting" });


  const e164 = toE164(number);
  let lastError: string | null = null;
  for (let attempt = 1; attempt <= POST_MAX_ATTEMPTS; attempt++) {
    upsert(callId, { direction, number, attempts: attempt, state: "pending", reason: `posting_attempt_${attempt}` });
    try {
      // Server-side single publisher: it claims a shared dedupe key so the
      // CDR pipeline never creates a second Maestro record for this call.
      const { data, error } = await supabase.functions.invoke("maestro-call-post", {
        body: {
          provider_call_id: callId,
          number: e164 ?? number,
          direction,
          status: direction === "outbound" ? "dialing" : "created",
          started_at: new Date().toISOString(),
        },
      });
      if (error) throw new Error(error.message || "maestro-call-post failed");
      if ((data as any)?.success === false) throw new Error(String((data as any)?.error ?? "maestro_post_failed"));
      const returnedId = (data as any)?.maestro_call_id;
      if (returnedId) maestroIds.set(callId, String(returnedId));
      const rec = upsert(callId, { direction, number, state: "posted", reason: "posted", lastError: null });
      log("posted", { callId, dedupKey, direction, number, classification, attempts: attempt });
      return rec;
    } catch (e: any) {
      lastError = String(e?.message ?? e);
      log("post_attempt_failed", { callId, dedupKey, direction, attempt, error: lastError });
      // A dead refresh token will fail identically on every retry: stop hammering
      // the API during a live call and surface the reconnect requirement instead.
      if (/maestro_reconnect_required|needs_reauth|invalid_grant/i.test(lastError)) {
        const rec = upsert(callId, { direction, number, state: "failed", reason: "needs_reauth", lastError });
        log("post_needs_reauth", { callId, dedupKey, direction, number, classification, error: lastError });
        try { window.dispatchEvent(new CustomEvent("pp:maestro-needs-reauth", { detail: { callId } })); } catch {}
        return rec;
      }
      if (attempt < POST_MAX_ATTEMPTS) await sleep(attempt * 800);
    }
  }
  const rec = upsert(callId, { direction, number, state: "failed", reason: "post_failed", lastError });
  log("post_failed", { callId, dedupKey, direction, number, classification, error: lastError });
  return rec;
}

function skip(callId: string, number: string, direction: MaestroCallDirection, reason: string, classification: MaestroClassification) {
  const rec = upsert(callId, { direction, number, state: "skipped", reason, classification });
  log("skipped", { callId, dedupKey: rec.dedupKey, direction, number, classification, reason });
  return rec;
}

function track(callId: string, p: Promise<MaestroPostRecord>) {
  inflight.set(callId, p);
  void p.finally(() => { if (inflight.get(callId) === p) inflight.delete(callId); });
}

/** Rules 1 & 2 — always post outbound calls (client or broker VoIP). */
export function postOutboundCall({ providerCallId, number }: PostArgs): void {
  const id = String(providerCallId ?? "").trim();
  const num = String(number ?? "");
  if (!id) { log("ignored_no_call_id", { direction: "outbound", number: num }); return; }
  const dup = findDuplicate(id, buildDedupKey("outbound", num));
  if (dup) { log("deduped", { callId: id, matched: dup.callId, dedupKey: dup.dedupKey, state: dup.state }); return; }
  track(id, post(id, num, "outbound", "n/a"));
}

/** Rules 3 & 4 — post inbound only when the caller is not a broker VoIP number. */
export function postInboundCall({ providerCallId, number }: PostArgs): void {
  const id = String(providerCallId ?? "").trim();
  const num = String(number ?? "");
  if (!id) { log("ignored_no_call_id", { direction: "inbound", number: num }); return; }
  const dedupKey = buildDedupKey("inbound", num);
  const dup = findDuplicate(id, dedupKey);
  if (dup) { log("deduped", { callId: id, matched: dup.callId, dedupKey, state: dup.state }); return; }

  upsert(id, { direction: "inbound", number: num, state: "pending", reason: "classifying" });
  track(id, (async () => {
    const isBroker = await isBrokerVoipNumber(num);
    if (isBroker === true) {
      // Rule 4: the calling broker already created the record.
      return skip(id, num, "inbound", "rule_4_inbound_from_broker_voip", "broker_voip");
    }
    if (isBroker === null) {
      // Classification unavailable (directory/network failure). `POST /calls` is
      // idempotent upstream, so posting is safer than losing the record: only a
      // *confirmed* broker VoIP caller is skipped under rule 4.
      return post(id, num, "inbound", "unknown");
    }
    return post(id, num, "inbound", "client");
  })());
}

/**
 * Guarded end-of-call update.
 *
 * Only calls that were actually posted by this client get an update. When a
 * post is still in flight (late posting / very short call) we wait for it to
 * settle instead of dropping the update.
 */
export async function updateCallIfPosted(
  callId: string | null | undefined,
  body: Record<string, unknown>,
): Promise<"sent" | "blocked" | "failed"> {
  const id = String(callId ?? "").trim();
  if (!id) return "blocked";
  const pending = inflight.get(id);
  if (pending) {
    log("update_waiting_for_post", { callId: id });
    await Promise.race([pending, sleep(POST_WAIT_TIMEOUT_MS)]);
  }
  const rec = records.get(id);
  if (!rec || rec.state !== "posted") {
    upsert(id, {
      direction: rec?.direction ?? "inbound",
      number: rec?.number ?? "",
      endedUpdate: "blocked",
    });
    log("update_blocked_not_posted", { callId: id, state: rec?.state ?? "unknown", reason: rec?.reason ?? "no_record" });
    return "blocked";
  }
  try {
    const maestroId = maestroIds.get(id);
    if (!maestroId) {
      // No Maestro record id (deduped against another publisher): the server
      // pipeline sends the completion update, so skip it here.
      upsert(id, { direction: rec.direction, number: rec.number, endedUpdate: "blocked" });
      log("update_blocked_no_maestro_id", { callId: id });
      return "blocked";
    }
    await maestroTelecom.updateCall(maestroId, body as any);
    upsert(id, { direction: rec.direction, number: rec.number, endedUpdate: "sent" });
    log("update_sent", { callId: id, dedupKey: rec.dedupKey, body });
    return "sent";
  } catch (e: any) {
    const msg = String(e?.message ?? e);
    upsert(id, { direction: rec.direction, number: rec.number, endedUpdate: "failed", lastError: msg });
    log("update_failed", { callId: id, error: msg });
    return "failed";
  }
}

/** Test/diagnostic helper. */
export function resetMaestroCallPostingCache() {
  records.clear();
  maestroIds.clear();
  inflight.clear();
  recentDedup.clear();
  brokerNumbers = null;
  emit();
}
