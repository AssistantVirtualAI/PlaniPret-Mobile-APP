/**
 * maestroCallPosting.ts
 * ─────────────────────
 * Implémente les 4 règles de Scott (Maestro) pour le posting des appels :
 *
 *  Règle 1 : POST /calls pour tout appel SORTANT vers un client.
 *  Règle 2 : POST /calls pour tout appel SORTANT vers un numéro VoIP de courtier.
 *  Règle 3 : POST /calls pour tout appel ENTRANT depuis un client.
 *  Règle 4 : NE PAS poster pour un appel ENTRANT depuis un numéro VoIP de courtier
 *             (seul l'appelant crée l'enregistrement — règle 2 côté appelant).
 *
 * Caractéristiques :
 *  - Déduplication locale par provider_call_id (90 s) + clé direction:10-derniers-chiffres (90 s)
 *    → neutralise le scénario push-puis-INVITE qui arrive deux fois.
 *  - Classification broker VoIP : extensions courtes (3-5 chiffres) OU numéros présents
 *    dans le cache de la liste /users/{id}/brokers (mis à jour toutes les 5 min).
 *  - Retry 3× avec backoff exponentiel (0 / 800 ms / 2 s).
 *  - Fire-and-forget : ne bloque jamais l'UI d'appel.
 *  - Télémétrie structurée : [maestro-call] <event> {json} dans la console.
 */

import { maestroTelecom, type MaestroCallCreate } from "./maestroTelecom";
import { supabase } from "@/integrations/supabase/client";

// ─── Types ────────────────────────────────────────────────────────────────────

export type CallDirection = "inbound" | "outbound";

export type PostingDecision =
  | "posted"
  | "skipped_broker_voip"
  | "skipped_dedup"
  | "failed";

export interface PostingResult {
  decision: PostingDecision;
  providerCallId: string;
  direction: CallDirection;
  number: string;
  classification: "client" | "broker_voip" | "unknown";
  attempts: number;
  error?: string;
}

// ─── Déduplication ────────────────────────────────────────────────────────────

const DEDUP_TTL_MS = 90_000; // 90 secondes
const dedupById = new Map<string, number>(); // provider_call_id → timestamp
const dedupByKey = new Map<string, number>(); // "direction:last10digits" → timestamp

function isDuplicate(providerCallId: string, direction: CallDirection, number: string): boolean {
  const now = Date.now();
  // Purge expired entries
  for (const [k, t] of dedupById) { if (now - t > DEDUP_TTL_MS) dedupById.delete(k); }
  for (const [k, t] of dedupByKey) { if (now - t > DEDUP_TTL_MS) dedupByKey.delete(k); }

  const last10 = number.replace(/\D/g, "").slice(-10);
  const key = `${direction}:${last10}`;

  if (dedupById.has(providerCallId) || dedupByKey.has(key)) return true;

  dedupById.set(providerCallId, now);
  dedupByKey.set(key, now);
  return false;
}

// ─── Cache broker VoIP ────────────────────────────────────────────────────────

const BROKER_CACHE_TTL_MS = 5 * 60_000; // 5 minutes
let brokerNumberCache: Set<string> = new Set();
let brokerCacheLoadedAt = 0;

/** Charge (ou recharge) la liste des numéros VoIP de courtiers depuis Maestro. */
async function refreshBrokerCache(): Promise<void> {
  if (Date.now() - brokerCacheLoadedAt < BROKER_CACHE_TTL_MS) return;
  try {
    const { data, error } = await supabase.functions.invoke("maestro-actions", {
      body: { action: "list_brokers", payload: { limit: 500 } },
    });
    if (error || !data?.success) return;
    const brokers: any[] = data.brokers ?? [];
    const numbers = new Set<string>();
    for (const b of brokers) {
      const phones = [b.phone, b.mobile, b.extension, b.voip_number].filter(Boolean);
      for (const p of phones) {
        const digits = String(p).replace(/\D/g, "");
        if (digits) numbers.add(digits.slice(-10));
      }
    }
    brokerNumberCache = numbers;
    brokerCacheLoadedAt = Date.now();
    mlog("broker_cache_refreshed", { count: numbers.size });
  } catch (e) {
    mlog("broker_cache_refresh_failed", { error: String(e) });
  }
}

// ─── Classification ───────────────────────────────────────────────────────────

/**
 * Classifie un numéro comme broker VoIP ou client.
 * - Extension courte (3-5 chiffres) → broker_voip
 * - Numéro présent dans le cache broker → broker_voip
 * - Sinon → client
 */
async function classifyNumber(number: string): Promise<"client" | "broker_voip"> {
  const digits = number.replace(/\D/g, "");
  // Extension courte = numéro interne VoIP
  if (digits.length >= 3 && digits.length <= 5) return "broker_voip";
  // Vérifier dans le cache
  await refreshBrokerCache();
  const last10 = digits.slice(-10);
  if (brokerNumberCache.has(last10)) return "broker_voip";
  return "client";
}

// ─── Télémétrie ───────────────────────────────────────────────────────────────

function mlog(event: string, data: Record<string, unknown>): void {
  console.log(`[maestro-call] ${event}`, JSON.stringify(data));
}

// ─── Suivi des appels postés ──────────────────────────────────────────────────

/** Ensemble des provider_call_id effectivement postés à Maestro. */
const postedCallIds = new Set<string>();

export function wasPostedToMaestro(providerCallId: string): boolean {
  return postedCallIds.has(providerCallId);
}

// ─── Retry helper ─────────────────────────────────────────────────────────────

const RETRY_DELAYS_MS = [0, 800, 2000];

async function postWithRetry(body: MaestroCallCreate): Promise<void> {
  let lastError: unknown;
  for (let i = 0; i < RETRY_DELAYS_MS.length; i++) {
    if (i > 0) await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[i]));
    try {
      await maestroTelecom.createCall(body);
      return;
    } catch (e) {
      lastError = e;
      mlog("post_attempt_failed", { attempt: i + 1, providerCallId: body.provider_call_id, error: String(e) });
    }
  }
  throw lastError;
}

// ─── API publique ─────────────────────────────────────────────────────────────

/**
 * Évalue les 4 règles Scott et poste l'appel si nécessaire.
 * Fire-and-forget : retourne immédiatement une promesse non bloquante.
 */
export function postCallToMaestro(
  providerCallId: string,
  direction: CallDirection,
  number: string,
): Promise<PostingResult> {
  return _postCallInternal(providerCallId, direction, number);
}

async function _postCallInternal(
  providerCallId: string,
  direction: CallDirection,
  number: string,
): Promise<PostingResult> {
  const base = { providerCallId, direction, number };

  // Déduplication
  if (isDuplicate(providerCallId, direction, number)) {
    mlog("deduped", { ...base });
    return { ...base, decision: "skipped_dedup", classification: "unknown", attempts: 0 };
  }

  // Classification
  const classification = await classifyNumber(number);

  // Règle 4 : inbound depuis broker VoIP → skip
  if (direction === "inbound" && classification === "broker_voip") {
    mlog("skipped", { ...base, reason: "rule_4_inbound_broker_voip", classification });
    return { ...base, decision: "skipped_broker_voip", classification, attempts: 0 };
  }

  // Règles 1, 2, 3 : poster
  const body: MaestroCallCreate = {
    provider_call_id: providerCallId,
    to_user_number: direction === "outbound" ? number : undefined,
    status: direction === "outbound" ? "dialing" : "created",
    direction,
  };

  let attempts = 0;
  try {
    await postWithRetry(body);
    attempts = 1; // au moins 1 tentative réussie
    postedCallIds.add(providerCallId);
    mlog("posted", { ...base, classification, rule: direction === "outbound" ? (classification === "broker_voip" ? 2 : 1) : 3 });
    return { ...base, decision: "posted", classification, attempts };
  } catch (e) {
    attempts = RETRY_DELAYS_MS.length;
    mlog("post_failed_all_retries", { ...base, classification, error: String(e) });
    return { ...base, decision: "failed", classification, attempts, error: String(e) };
  }
}

/**
 * Met à jour le statut d'un appel dans Maestro (ended) — seulement si l'appel
 * a bien été posté (évite les updateCall orphelins).
 */
export async function updateCallIfPosted(
  providerCallId: string,
  update: { status: "ended"; ended_reason?: string },
  timeoutMs = 8000,
): Promise<"sent" | "blocked" | "not_posted"> {
  if (!postedCallIds.has(providerCallId)) {
    // Attendre jusqu'à timeoutMs qu'un POST en vol se termine
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 200));
      if (postedCallIds.has(providerCallId)) break;
    }
  }
  if (!postedCallIds.has(providerCallId)) {
    mlog("update_blocked_not_posted", { providerCallId });
    return "not_posted";
  }
  try {
    await maestroTelecom.updateCall(providerCallId, update);
    mlog("update_sent", { providerCallId, ...update });
    return "sent";
  } catch (e) {
    mlog("update_failed", { providerCallId, error: String(e) });
    return "blocked";
  }
}
