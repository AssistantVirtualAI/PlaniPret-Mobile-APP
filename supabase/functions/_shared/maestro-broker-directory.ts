// Maestro broker directory — resolves a broker's numeric Maestro telecom user
// id from their (Microsoft) email using Scott's new mobile endpoint:
//
//   GET /users/{id}/brokers
//
// Why: the previous resolution strategy probed `/users/{id}/sip` one id at a
// time (1..800) with a 10 minute cooldown, which never converged for 350+
// brokers. The brokers endpoint returns the whole directory in one call, and
// each entry carries the broker's email — which is the same email brokers sign
// in with through Microsoft. One call, exact match, no guessing.

import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import {
  getMaestroTelecomConfig,
  isMaestroTelecomConfigured,
  maestroTelecomFetch,
} from "./maestro-telecom.ts";

export interface BrokerDirectoryEntry {
  id: string;
  email: string | null;
  name: string | null;
  extension: string | null;
  phones: string[]; // last-10 digits
}

const digits = (v: unknown) => String(v ?? "").replace(/\D/g, "");
const norm = (v: unknown) => String(v ?? "").trim().toLowerCase();

/** Accent-insensitive, punctuation-free, sorted-token name key. */
export const nameKey = (v: unknown): string =>
  String(v ?? "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z\s]/g, " ")
    .split(/\s+/).filter(Boolean).sort().join(" ");

/** Find a directory entry by full name (unique normalized match only). */
export function findByName(entries: BrokerDirectoryEntry[], fullName: string): BrokerDirectoryEntry | null {
  const k = nameKey(fullName);
  if (!k || k.split(" ").length < 2) return null;
  const hits = entries.filter((x) => nameKey(x.name) === k);
  return hits.length === 1 ? hits[0] : null;
}

let cache: { at: number; entries: BrokerDirectoryEntry[]; seed: string | null } | null = null;
const CACHE_TTL_MS = 5 * 60_000;

function normalizeEntry(b: any): BrokerDirectoryEntry | null {
  if (!b || typeof b !== "object") return null;
  const id = b.id ?? b.user_id ?? b.broker_id ?? b.telecom_user_id ?? null;
  if (id === null || id === undefined || !/^\d+$/.test(String(id).trim())) return null;
  const first = b.first_name ?? b.firstname ?? null;
  const last = b.last_name ?? b.lastname ?? null;
  const name = b.full_name ?? b.name ?? b.display_name ??
    ([first, last].filter(Boolean).join(" ").trim() || null);
  const tels: any[] = Array.isArray(b.telephones) ? b.telephones : [];
  const phones = [
    digits(b.phone), digits(b.phone_number), digits(b.cell_phone), digits(b.mobile),
    digits(b.sms_number), ...tels.map((t) => digits(t?.telephone_number)),
  ].filter((n) => n.length >= 10).map((n) => n.slice(-10));
  return {
    id: String(id).trim(),
    email: norm(b.email ?? b.email_address ?? b.username ?? "") || null,
    name,
    extension: String(b.extension ?? b.sip_username ?? b.provider_external_user_id ?? "").trim() || null,
    phones: [...new Set(phones)],
  };
}

/** Candidate seed ids used to read the directory (any linked broker works). */
async function seedIds(admin: SupabaseClient): Promise<string[]> {
  const out: string[] = [];
  try {
    const { data } = await admin
      .from("planipret_profiles")
      .select("maestro_telecom_user_id")
      .not("maestro_telecom_user_id", "is", null)
      .limit(25);
    for (const r of data ?? []) {
      const v = String((r as any).maestro_telecom_user_id ?? "").trim();
      if (/^\d+$/.test(v) && !out.includes(v)) out.push(v);
    }
  } catch { /* ignore */ }
  try {
    const { data } = await admin
      .from("planipret_integration_secrets")
      .select("provider, config")
      .in("provider", ["maestro_telecom", "maestro"]);
    for (const row of data ?? []) {
      const c = ((row as any).config ?? {}) as Record<string, unknown>;
      for (const k of ["broker_id", "maestro_broker_id", "user_id"]) {
        const v = String(c[k] ?? "").trim();
        if (/^\d+$/.test(v) && !out.includes(v)) out.push(v);
      }
    }
  } catch { /* ignore */ }
  return out.slice(0, 6);
}

/** Load (and cache) the Maestro broker directory. */
export async function loadBrokerDirectory(
  admin: SupabaseClient,
  opts: { force?: boolean } = {},
): Promise<{ entries: BrokerDirectoryEntry[]; seed: string | null; error?: string }> {
  if (!opts.force && cache && Date.now() - cache.at < CACHE_TTL_MS) {
    return { entries: cache.entries, seed: cache.seed };
  }
  const cfg = await getMaestroTelecomConfig(admin);
  if (!isMaestroTelecomConfigured(cfg)) return { entries: [], seed: null, error: "maestro_telecom_not_configured" };

  const seeds = await seedIds(admin);
  if (!seeds.length) return { entries: [], seed: null, error: "no_seed_broker_id" };

  let lastError = "no_broker_directory";
  for (const seed of seeds) {
    const r = await maestroTelecomFetch(cfg, `/users/${seed}/brokers`, {
      method: "GET",
      maxAttempts: 2,
      timeoutMs: 12000,
    });
    if (!r.ok) { lastError = `seed_${seed}_http_${r.status}`; continue; }
    const d: any = r.data;
    const listRaw = Array.isArray(d) ? d : (d?.brokers ?? d?.data ?? d?.results ?? []);
    const entries = (Array.isArray(listRaw) ? listRaw : [])
      .map(normalizeEntry)
      .filter(Boolean) as BrokerDirectoryEntry[];
    if (entries.length) {
      cache = { at: Date.now(), entries, seed };
      console.log(`[maestro-directory] loaded ${entries.length} brokers via seed ${seed}`);
      return { entries, seed };
    }
    lastError = `seed_${seed}_empty`;
  }
  console.warn(`[maestro-directory] unable to load directory: ${lastError}`);
  return { entries: [], seed: null, error: lastError };
}

/** Find a directory entry matching an email (exact, then local-part). */
export function findByEmail(entries: BrokerDirectoryEntry[], email: string): BrokerDirectoryEntry | null {
  const e = norm(email);
  if (!e) return null;
  const exact = entries.find((x) => x.email && x.email === e);
  if (exact) return exact;
  const local = e.split("@")[0];
  if (!local) return null;
  const hits = entries.filter((x) => x.email && x.email.split("@")[0] === local);
  return hits.length === 1 ? hits[0] : null;
}

/**
 * Resolve + persist `planipret_profiles.maestro_telecom_user_id` from the broker's
 * email (Microsoft email first, then account email). Falls back to extension
 * and phone matching against the same directory.
 */
export async function linkBrokerIdByEmail(
  admin: SupabaseClient,
  profile: {
    id: string;
    email?: string | null;
    ms365_email?: string | null;
    extension?: string | null;
    phone?: string | null;
    maestro_broker_id?: string | null;
    maestro_telecom_user_id?: string | null;
    full_name?: string | null;
  },
  opts: { force?: boolean } = {},
): Promise<{ ok: boolean; maestro_broker_id: string | null; matched_by: string | null; error?: string }> {
  if (!opts.force && profile.maestro_telecom_user_id && /^\d+$/.test(String(profile.maestro_telecom_user_id).trim())) {
    return { ok: true, maestro_broker_id: String(profile.maestro_telecom_user_id).trim(), matched_by: "already_linked" };
  }
  const { entries, error } = await loadBrokerDirectory(admin);
  if (!entries.length) return { ok: false, maestro_broker_id: null, matched_by: null, error: error ?? "directory_unavailable" };

  const emails = [profile.ms365_email, profile.email].map(norm).filter(Boolean) as string[];
  let hit: BrokerDirectoryEntry | null = null;
  let matchedBy: string | null = null;
  for (const e of emails) {
    hit = findByEmail(entries, e);
    if (hit) { matchedBy = "email"; break; }
  }
  if (!hit) {
    const ext = String(profile.extension ?? "").trim();
    if (ext) {
      hit = entries.find((x) => x.extension && x.extension === ext) ?? null;
      if (hit) matchedBy = "extension";
    }
  }
  if (!hit) {
    const ph = digits(profile.phone);
    if (ph.length >= 10) {
      const tail = ph.slice(-10);
      hit = entries.find((x) => x.phones.includes(tail)) ?? null;
      if (hit) matchedBy = "phone";
    }
  }
  if (!hit && (profile as any).full_name) {
    hit = findByName(entries, (profile as any).full_name);
    if (hit) matchedBy = "name";
  }
  if (!hit) {
    // No directory row, but the broker already signed in to Maestro (OAuth):
    // their own /users/me id is authoritative — keep the existing link.
    const oauthId = String(profile.maestro_broker_id ?? "").trim();
    if (/^\d+$/.test(oauthId)) {
      return { ok: true, maestro_broker_id: oauthId, matched_by: "oauth_session" };
    }
    return { ok: false, maestro_broker_id: null, matched_by: null, error: "no_directory_match" };
  }

  const { error: upErr } = await admin
    .from("planipret_profiles")
    .update({ maestro_telecom_user_id: hit.id, maestro_telecom_linked_at: new Date().toISOString() })
    .eq("id", profile.id);
  if (upErr) return { ok: false, maestro_broker_id: hit.id, matched_by: matchedBy, error: upErr.message };

  console.log(`[maestro-directory] linked profile ${profile.id} → maestro id ${hit.id} (${matchedBy})`);
  return { ok: true, maestro_broker_id: hit.id, matched_by: matchedBy };
}

/** Convenience: resolve the Maestro id for a Supabase auth user id. */
export async function resolveMaestroIdForUser(
  admin: SupabaseClient,
  userId: string,
  opts: { force?: boolean } = {},
): Promise<{ maestro_broker_id: string | null; matched_by: string | null; error?: string }> {
  const { data } = await admin
    .from("planipret_profiles")
    .select("id, user_id, email, ms365_email, extension, phone, full_name, maestro_broker_id, maestro_telecom_user_id")
    .or(`user_id.eq.${userId},id.eq.${userId}`)
    .limit(1)
    .maybeSingle();
  if (!data) return { maestro_broker_id: null, matched_by: null, error: "profile_not_found" };
  const r = await linkBrokerIdByEmail(admin, data as any, opts);
  return { maestro_broker_id: r.maestro_broker_id, matched_by: r.matched_by, error: r.error };
}

/**
 * Authoritative resolver for the **Telecom** user id (`/telecom/api/v1/users/{id}`).
 * The CRM/OAuth broker id lives in a different namespace and must never be sent
 * to the telecom API unless it is proven valid there (SIP probe).
 *
 * Order: stored maestro_telecom_user_id → directory match (email/ext/phone/name)
 *        → candidate CRM id validated with GET /users/{id}/sip.
 */
export async function resolveTelecomUserId(
  admin: SupabaseClient,
  authUserId: string | null | undefined,
  opts: { candidate?: string | null; force?: boolean } = {},
): Promise<{ id: string | null; matched_by: string | null; profile_id: string | null; error?: string }> {
  if (!authUserId) return { id: null, matched_by: null, profile_id: null, error: "no_user" };
  const { data: prof } = await admin
    .from("planipret_profiles")
    .select("id, user_id, email, ms365_email, extension, phone, full_name, maestro_broker_id, maestro_telecom_user_id")
    .or(`user_id.eq.${authUserId},id.eq.${authUserId}`)
    .limit(1)
    .maybeSingle();
  if (!prof) return { id: null, matched_by: null, profile_id: null, error: "profile_not_found" };

  const stored = String((prof as any).maestro_telecom_user_id ?? "").trim();
  if (!opts.force && /^\d+$/.test(stored)) {
    return { id: stored, matched_by: "stored", profile_id: (prof as any).id };
  }

  const linked = await linkBrokerIdByEmail(admin, prof as any, { force: opts.force }).catch(() => null);
  if (linked?.ok && linked.maestro_broker_id) {
    return { id: linked.maestro_broker_id, matched_by: linked.matched_by, profile_id: (prof as any).id };
  }

  // Last resort: validate a candidate (CRM/OAuth) id against the telecom API.
  const candidate = String(opts.candidate ?? (prof as any).maestro_broker_id ?? "").trim();
  if (/^\d+$/.test(candidate)) {
    const cfg = await getMaestroTelecomConfig(admin);
    if (isMaestroTelecomConfigured(cfg)) {
      const probe = await maestroTelecomFetch(cfg, `/users/${candidate}/sip`, { method: "GET", maxAttempts: 1, timeoutMs: 7000 });
      if (probe.ok) {
        await admin.from("planipret_profiles")
          .update({ maestro_telecom_user_id: candidate, maestro_telecom_linked_at: new Date().toISOString() })
          .eq("id", (prof as any).id);
        return { id: candidate, matched_by: "sip_probe", profile_id: (prof as any).id };
      }
    }
  }
  return { id: null, matched_by: null, profile_id: (prof as any).id, error: linked?.error ?? "telecom_id_unresolved" };
}
