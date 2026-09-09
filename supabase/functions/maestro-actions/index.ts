import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { getMaestroTelecomConfig, isMaestroTelecomConfigured, maestroTelecomFetch } from "../_shared/maestro-telecom.ts";
import { linkBrokerIdByEmail, loadBrokerDirectory, findByEmail, resolveTelecomUserId } from "../_shared/maestro-broker-directory.ts";
import { getMaestroOAuthEnv, getUserMaestroAccessToken, fetchMaestroUserProfile, extractMaestroBrokerId } from "../_shared/maestro-oauth.ts";


async function getMaestroConfig(admin: any) {
  const { data } = await admin.from("planipret_integration_secrets").select("config").eq("provider", "maestro").maybeSingle();
  const c = (data?.config ?? {}) as Record<string, string>;
  return {
    url: (c.api_url ?? Deno.env.get("MAESTRO_TELECOM_BASE_URL") ?? Deno.env.get("MAESTRO_API_URL") ?? "").replace(/\/$/, ""),
    key: c.api_key ?? Deno.env.get("MAESTRO_TELECOM_API_KEY") ?? Deno.env.get("MAESTRO_API_KEY") ?? "",
    accountId: c.account_id ?? Deno.env.get("MAESTRO_ACCOUNT_ID") ?? "",
  };
}

/** Normalize a Maestro client/broker payload into the shared contact shape. */
function normalizeContact(c: any) {
  if (!c || typeof c !== "object") return c;
  const first = c.first_name ?? c.firstname ?? c.given_name ?? null;
  const last = c.last_name ?? c.lastname ?? c.family_name ?? null;
  const full = c.full_name ?? c.name ?? c.display_name ??
    ([first, last].filter(Boolean).join(" ").trim() || null);
  const id = c.id ?? c.client_id ?? c.broker_id ?? c.user_id ?? c.uuid ?? null;
  // Maestro profiles carry numbers in a `telephones[]` array.
  const tels: any[] = Array.isArray(c.telephones) ? c.telephones : [];
  const telOf = (...types: string[]) => {
    const hit = tels.find((t) => types.includes(String(t?.telephone_type ?? "").toLowerCase()));
    return hit?.telephone_number ? String(hit.telephone_number) : null;
  };
  const cell = c.cell_phone ?? c.mobile ?? telOf("mobile", "cell") ?? null;
  const work = c.work_phone ?? c.office_phone ?? telOf("work", "office") ?? null;
  const home = c.home_phone ?? telOf("home") ?? null;
  const addrs: any[] = Array.isArray(c.addresses) ? c.addresses : [];
  const a0 = c.address && typeof c.address === "object" ? c.address : (addrs[0] ?? null);
  const addressLine = (() => {
    if (typeof c.address === "string" && c.address.trim()) return c.address.trim();
    if (!a0) return null;
    const parts = [
      [a0.civic_number ?? a0.street_number, a0.street ?? a0.street_name ?? a0.address1].filter(Boolean).join(" "),
      a0.apartment ?? a0.unit ?? a0.address2,
      a0.city ?? a0.municipality,
      a0.province ?? a0.state,
      a0.postal_code ?? a0.zip,
      a0.country,
    ].filter((p) => p && String(p).trim());
    return parts.length ? parts.join(", ") : null;
  })();
  const emails: string[] = Array.from(new Set([
    c.email, c.email_address, c.personal_email, c.work_email,
    ...(Array.isArray(c.emails) ? c.emails.map((e: any) => (typeof e === "string" ? e : e?.email ?? e?.email_address)) : []),
  ].filter(Boolean).map((e: any) => String(e))));
  return {
    ...c,
    id,
    first_name: first,
    last_name: last,
    name: full,
    display_name: full,
    email: emails[0] ?? null,
    emails,
    company: c.company ?? c.employer ?? c.organization ?? null,
    job_title: c.job_title ?? c.occupation ?? c.title ?? null,
    phone: c.phone ?? c.phone_number ?? cell ?? work ?? home ??
      (tels[0]?.telephone_number ? String(tels[0].telephone_number) : null),
    cell_phone: cell,
    work_phone: work,
    home_phone: home,
    telephones: tels,
    addresses: addrs,
    address_line: addressLine,
    city: a0?.city ?? a0?.municipality ?? c.city ?? null,
    province: a0?.province ?? a0?.state ?? c.province ?? null,
    postal_code: a0?.postal_code ?? a0?.zip ?? c.postal_code ?? null,
    country: a0?.country ?? c.country ?? null,
    language: c.language ?? c.preferred_language ?? c.locale ?? null,
    birth_date: c.birth_date ?? c.birthdate ?? c.date_of_birth ?? null,
    status: c.status ?? c.client_status ?? c.state ?? null,
    source: c.source ?? c.lead_source ?? null,
    notes: c.notes ?? c.note ?? c.comments ?? null,
    created_at: c.created_at ?? c.creation_date ?? c.created ?? null,
    updated_at: c.updated_at ?? c.modification_date ?? c.modified ?? null,
    broker_id: c.broker_id ?? c.user_id ?? null,
    maestro_client_id: c.client_id ?? id,
  };
}


/* ------------------------------------------------------------------ *
 * Lightweight in-memory cache for the Maestro mobile list endpoints.
 * Chat + voice tools hit /users/{id}/clients and /users/{id}/brokers
 * repeatedly while paginating; upstream has no offset support so we
 * fetch the full list once and page locally from the cached copy.
 * ------------------------------------------------------------------ */
const CACHE_TTL = 90_000; // 90 secondes
const _listCache = new Map<string, { ts: number; data: unknown }>();
function cacheGet(key: string) {
  const e = _listCache.get(key);
  return e && Date.now() - e.ts < CACHE_TTL ? e.data : null;
}
function cacheSet(key: string, data: unknown) {
  _listCache.set(key, { ts: Date.now(), data });
}
function cacheInvalidate(prefix: string) {
  for (const k of [..._listCache.keys()]) if (k.startsWith(prefix)) _listCache.delete(k);
}


/**
 * Fallback client list built from the documented Telecom endpoints when
 * GET /users/{id}/clients is unavailable (it is not part of the published
 * Telecom REST spec). Derives distinct counterparts from
 * GET /users/{id}/communications/all and enriches them with
 * POST /users/{id}/lookup-by-phone.
 */
async function clientsFromCommunications(cfg: any, uid: string, search: string): Promise<any[] | null> {
  const r = await maestroTelecomFetch(cfg, `/users/${encodeURIComponent(uid)}/communications/all`, { method: "GET", timeoutMs: 12000, maxAttempts: 2 });
  if (!r.ok) return null;
  const d: any = r.data;
  const rows: any[] = Array.isArray(d) ? d : (d?.communications ?? d?.data ?? d?.results ?? []);
  const byPhone = new Map<string, any>();
  for (const row of rows) {
    const phone = String(
      row?.contact_number ?? row?.to_user_number ?? row?.from_user_number ?? row?.phone ?? row?.number ?? "",
    ).trim();
    if (!phone) continue;
    const key = phone.replace(/[^\d]/g, "").slice(-10);
    if (!key) continue;
    const prev = byPhone.get(key);
    const name = row?.contact_name ?? row?.name ?? row?.display_name ?? null;
    const last = row?.created_at ?? row?.occurred_at ?? row?.started_at ?? null;
    if (!prev) {
      byPhone.set(key, { id: row?.contact_id ?? row?.to_user_id ?? key, phone, name, last_activity_at: last, source: "communications" });
    } else if (!prev.name && name) {
      prev.name = name;
    }
  }
  let list = [...byPhone.values()];
  // Enrich the first entries with the documented phone lookup.
  await Promise.all(list.slice(0, 25).map(async (c) => {
    const lr = await maestroTelecomFetch(cfg, `/users/${encodeURIComponent(uid)}/lookup-by-phone`, {
      method: "POST", body: { phone: c.phone }, maxAttempts: 1, timeoutMs: 7000,
    });
    if (lr.ok) {
      const u: any = (lr.data as any)?.user ?? (lr.data as any)?.data ?? lr.data;
      if (u && typeof u === "object") Object.assign(c, u, { phone: c.phone, source: "communications+lookup" });
    }
  }));
  const q = search.trim().toLowerCase();
  if (q) {
    list = list.filter((c) => JSON.stringify(c).toLowerCase().includes(q));
  }
  return list;
}


Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { action, payload = {} } = await req.json();
    const cfg = await getMaestroConfig(admin);
    // Only the CRM actions below talk to the `maestro` (CRM) base URL/key.
    // Everything else (clients, brokers, contacts, communications) runs on the
    // separate `maestro_telecom` config, so a missing CRM secret must not 500
    // the whole endpoint.
    const CRM_ACTIONS = new Set(["create_task", "create_event", "list_tasks", "list_events"]);
    if ((!cfg.url || !cfg.key) && CRM_ACTIONS.has(action)) {
      return new Response(
        JSON.stringify({ success: false, error: "Maestro non configuré", code: "maestro_not_configured" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    const h = { Authorization: `Bearer ${cfg.key}`, "Content-Type": "application/json", "X-Account-Id": cfg.accountId };
    const j = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    switch (action) {
      case "create_task": {
        const r = await fetch(`${cfg.url}/tasks`, { method: "POST", headers: h, body: JSON.stringify(payload) });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) return j({ success: false, error: "Maestro create_task failed", details: d }, 500);
        if (payload.call_id) {
          const { data: call } = await admin.from("planipret_phone_calls").select("metadata").eq("id", payload.call_id).maybeSingle();
          const meta = { ...(call?.metadata ?? {}), maestro_task_id: d.id ?? d.task_id };
          await admin.from("planipret_phone_calls").update({ metadata: meta }).eq("id", payload.call_id);
        }
        return j({ success: true, task_id: d.id ?? d.task_id });
      }
      case "create_event": {
        const r = await fetch(`${cfg.url}/calendar`, { method: "POST", headers: h, body: JSON.stringify(payload) });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) return j({ success: false, error: "Maestro create_event failed", details: d }, 500);
        if (payload.call_id) {
          const { data: call } = await admin.from("planipret_phone_calls").select("metadata").eq("id", payload.call_id).maybeSingle();
          const meta = { ...(call?.metadata ?? {}), maestro_event_id: d.id ?? d.event_id };
          await admin.from("planipret_phone_calls").update({ metadata: meta }).eq("id", payload.call_id);
        }
        return j({ success: true, event_id: d.id ?? d.event_id });
      }
      case "list_contacts": {
        // Backward compatibility for installed mobile builds: the old app calls
        // `list_contacts`, while Maestro now exposes broker-scoped clients at
        // GET /users/{id}/clients.
        try {
          const authHeader = req.headers.get("Authorization") ?? "";
          const token = authHeader.replace(/^Bearer\s+/i, "");
          const { data: authData } = token ? await admin.auth.getUser(token) : { data: { user: null } };
          const callerId = authData?.user?.id ?? null;
          if (!callerId) return j({ success: false, contacts: [], error: "Session expirée. Reconnectez-vous." });

          const { data: prof } = await admin
            .from("planipret_profiles")
            .select("id, maestro_broker_id, email, ms365_email, extension, phone, full_name")
            .or(`user_id.eq.${callerId},id.eq.${callerId}`)
            .limit(1)
            .maybeSingle();
          if (!prof) return j({ success: false, contacts: [], error: "Profil courtier introuvable." });

          // CRM (OAuth) identity and Telecom identity are two namespaces.
          // Refresh the CRM id opportunistically, but always call
          // /telecom/api/v1 with the resolved TELECOM user id.
          const tokenForIdentity = await getUserMaestroAccessToken(admin, callerId).catch(() => null);
          let crmId: string | null = null;
          if (tokenForIdentity) {
            crmId = extractMaestroBrokerId(await fetchMaestroUserProfile(getMaestroOAuthEnv(), tokenForIdentity).catch(() => null));
            if (crmId && String(prof.maestro_broker_id ?? "").trim() !== crmId) {
              await admin.from("planipret_profiles")
                .update({ maestro_broker_id: crmId, maestro_connected: true })
                .eq("id", prof.id);
            }
          }
          const resolved = await resolveTelecomUserId(admin, callerId, { candidate: crmId });
          const telecomUserId = resolved.id;
          if (!telecomUserId) {
            return j({ success: false, contacts: [], error: "Compte Maestro non lié au service télécom. Reconnectez Maestro dans Réglages.", code: "maestro_telecom_not_linked", link: { matched_by: resolved.matched_by, error: resolved.error } });
          }

          const tCfg = await getMaestroTelecomConfig(admin);
          if (!isMaestroTelecomConfigured(tCfg)) {
            return j({ success: false, contacts: [], error: "Intégration Maestro non configurée." });
          }
          const q = String(payload.query ?? "").trim();
          const path = `/users/${telecomUserId}/clients${q ? `?search=${encodeURIComponent(q)}` : ""}`;
          const r = await maestroTelecomFetch(tCfg, path, { method: "GET", timeoutMs: 10000 });
          if (!r.ok) {
            console.warn("maestro list_contacts non-ok", r.status, r.data);
            const derived = await clientsFromCommunications(tCfg, telecomUserId, q).catch(() => null);
            if (derived) {
              return j({ success: true, contacts: derived.map(normalizeContact), total: derived.length, maestro_user_id: telecomUserId, source: "communications" });
            }
            return j({ success: false, contacts: [], error: `Maestro indisponible (HTTP ${r.status || "?"})`, status: r.status });
          }
          const d: any = r.data;
          const raw = Array.isArray(d) ? d : (Array.isArray(d?.clients) ? d.clients : (Array.isArray(d?.data) ? d.data : []));
          return j({ success: true, contacts: raw.map(normalizeContact), total: d?.total_count ?? d?.total ?? raw.length, maestro_user_id: telecomUserId });
        } catch (err: any) {
          console.error("maestro list_contacts error", err?.message);
          return j({ success: false, contacts: [], error: err?.message ?? "Erreur Maestro" });
        }
      }
      case "list_tasks": {
        const r = await fetch(`${cfg.url}/tasks?assigned_to=${encodeURIComponent(payload.broker_email ?? "")}`, { headers: h });
        const d = await r.json().catch(() => ({}));
        return j({ success: r.ok, tasks: d.tasks ?? d ?? [] }, r.ok ? 200 : 500);
      }
      case "list_events": {
        const r = await fetch(`${cfg.url}/calendar?start=${encodeURIComponent(payload.start ?? "")}&end=${encodeURIComponent(payload.end ?? "")}`, { headers: h });
        const d = await r.json().catch(() => ({}));
        return j({ success: r.ok, events: d.events ?? d ?? [] }, r.ok ? 200 : 500);
      }
      case "find_user_by_email": {
        const email = String(payload.email ?? "").trim().toLowerCase();
        if (!email) return j({ success: false, error: "email required" }, 400);
        const tCfg = await getMaestroTelecomConfig(admin);
        const results: any[] = [];
        if (isMaestroTelecomConfigured(tCfg)) {
          const paths = [
            `/users/lookup?email=${encodeURIComponent(email)}`,
            `/users/by-email/${encodeURIComponent(email)}`,
            `/users?email=${encodeURIComponent(email)}`,
            `/users?search=${encodeURIComponent(email)}`,
            `/users?q=${encodeURIComponent(email)}`,
          ];
          for (const p of paths) {
            const r = await maestroTelecomFetch(tCfg, p, { method: "GET", maxAttempts: 1, timeoutMs: 6000 });
            results.push({ path: p, status: r.status, sample: Array.isArray(r.data) ? r.data.slice(0, 2) : r.data });
            if (!r.ok) continue;
            const dataObj: any = r.data;
            // Single-user response (e.g. /users/lookup)
            if (dataObj && typeof dataObj === "object" && !Array.isArray(dataObj) && (dataObj.email || dataObj.id)) {
              return j({ success: true, user: { id: dataObj.id ?? dataObj.user_id, email: dataObj.email, first_name: dataObj.first_name, last_name: dataObj.last_name }, source: "telecom" });
            }
            const list = Array.isArray(dataObj) ? dataObj : (dataObj?.users ?? dataObj?.data ?? []);
            const user = list.find((u: any) => String(u.email ?? "").toLowerCase() === email) ?? list[0];
            if (user) {
              return j({ success: true, user: { id: user.id ?? user.user_id, email: user.email, first_name: user.first_name, last_name: user.last_name }, source: "telecom" });
            }
          }
        }
        // Legacy fallback to CRM (non-telecom) if configured
        if (cfg.url && cfg.key) {
          const tryPaths = [
            `${cfg.url}/users?email=${encodeURIComponent(email)}`,
            `${cfg.url}/telecom/users?email=${encodeURIComponent(email)}`,
          ];
          for (const url of tryPaths) {
            const r = await fetch(url, { headers: h });
            results.push({ path: url, status: r.status });
            if (!r.ok) continue;
            const d = await r.json().catch(() => ({}));
            const list = Array.isArray(d) ? d : (d.users ?? d.data ?? []);
            const user = list.find((u: any) => String(u.email ?? "").toLowerCase() === email) ?? list[0];
            if (user) return j({ success: true, user: { id: user.id ?? user.user_id, email: user.email, first_name: user.first_name, last_name: user.last_name }, source: "crm" });
          }
        }
        return j({ success: false, error: "user_not_found", debug: results }, 404);
      }
      // Link a broker's Maestro telecom id from their (Microsoft) email using
      // GET /users/{seed}/brokers. Called after Microsoft sign-in.
      case "link_broker_by_email": {
        const authHeader = req.headers.get("Authorization") ?? "";
        let callerId: string | null = null;
        if (authHeader) {
          const { data: u } = await admin.auth.getUser(authHeader.replace(/^Bearer\s+/i, ""));
          callerId = u?.user?.id ?? null;
        }
        const targetUser = callerId ?? (payload.auth_user_id ? String(payload.auth_user_id) : null);
        if (targetUser) {
          const { data: prof } = await admin
            .from("planipret_profiles")
            .select("id, maestro_broker_id, maestro_telecom_user_id, email, ms365_email, extension, phone, full_name")
            .or(`user_id.eq.${targetUser},id.eq.${targetUser}`)
            .limit(1)
            .maybeSingle();
          if (!prof) return j({ success: false, error: "profile_not_found" }, 404);
          const r = await linkBrokerIdByEmail(admin, prof as any, { force: payload.force === true });
          return j({
            success: r.ok,
            maestro_broker_id: r.maestro_broker_id,
            maestro_telecom_user_id: r.maestro_broker_id,
            matched_by: r.matched_by,
            error: r.error,
          });
        }
        const email = String(payload.email ?? "").trim().toLowerCase();
        if (!email) return j({ success: false, error: "email_required" }, 400);
        const dir = await loadBrokerDirectory(admin);
        const hit = findByEmail(dir.entries, email);
        return hit
          ? j({ success: true, maestro_broker_id: hit.id, matched_by: "email", broker: hit })
          : j({ success: false, error: dir.error ?? "no_directory_match" }, 404);
      }

      // Hydrate the caller's own Maestro id from their OAuth session (/users/me).
      // This is the authoritative per-broker link: each broker signs in to
      // Maestro and therefore only ever sees their own clients.
      case "sync_my_maestro_id": {
        const authHeader = req.headers.get("Authorization") ?? "";
        const { data: u } = await admin.auth.getUser(authHeader.replace(/^Bearer\s+/i, ""));
        const uid = u?.user?.id ?? null;
        if (!uid) return j({ success: false, error: "unauthenticated" }, 401);
        const { data: prof } = await admin
          .from("planipret_profiles")
          .select("id, maestro_broker_id")
          .or(`user_id.eq.${uid},id.eq.${uid}`)
          .limit(1)
          .maybeSingle();
        if (!prof) return j({ success: false, error: "profile_not_found" }, 404);
        const env = getMaestroOAuthEnv();
        const token = await getUserMaestroAccessToken(admin, uid).catch(() => null);
        if (!token) return j({ success: false, error: "maestro_not_connected", code: "maestro_not_connected" });
        const me = await fetchMaestroUserProfile(env, token);
        const mid = extractMaestroBrokerId(me);
        if (!mid) return j({ success: false, error: "maestro_me_unavailable" });
        await admin.from("planipret_profiles")
          .update({ maestro_broker_id: String(mid), maestro_connected: true })
          .eq("id", (prof as any).id);
        return j({ success: true, maestro_broker_id: String(mid) });
      }




      case "list_clients":
      case "client_profile":
      case "list_brokers":
      case "broker_profile": {
        const tCfg = await getMaestroTelecomConfig(admin);
        // Always answer 200 on these list/profile reads: the mobile Contacts
        // screen surfaces `error` as readable text instead of the opaque
        // "Edge Function returned a non-2xx status code".
        if (!isMaestroTelecomConfigured(tCfg)) {
          return j({ success: false, clients: [], brokers: [], error: "Intégration Maestro non configurée." });
        }

        // Resolve the caller's numeric Maestro telecom user id from their JWT.
        const authHeader = req.headers.get("Authorization") ?? "";
        let callerId: string | null = null;
        if (authHeader) {
          const { data: u } = await admin.auth.getUser(authHeader.replace(/^Bearer\s+/i, ""));
          callerId = u?.user?.id ?? null;
        }
        let telecomUserId: string | null = null;
        let isAdmin = false;
        let linkInfo: { matched_by: string | null; error?: string } | null = null;
        if (callerId) {
          const { data: prof } = await admin
            .from("planipret_profiles")
            .select("id, maestro_broker_id, maestro_telecom_user_id, role, email, ms365_email, extension, phone, full_name")
            .or(`user_id.eq.${callerId},id.eq.${callerId}`)
            .limit(1)
            .maybeSingle();
          isAdmin = prof?.role === "admin";
          let crmId: string | null = null;
          if (prof && !isAdmin) {
            const tok = await getUserMaestroAccessToken(admin, callerId).catch(() => null);
            if (tok) {
              crmId = extractMaestroBrokerId(await fetchMaestroUserProfile(getMaestroOAuthEnv(), tok).catch(() => null));
              if (crmId && String(prof.maestro_broker_id ?? "").trim() !== crmId) {
                await admin.from("planipret_profiles")
                  .update({ maestro_broker_id: crmId, maestro_connected: true })
                  .eq("id", (prof as any).id);
              }
            } else {
              linkInfo = { matched_by: null, error: "maestro_oauth_required" };
            }
          }
          if (prof) {
            const resolved = await resolveTelecomUserId(admin, callerId, { candidate: crmId });
            telecomUserId = resolved.id;
            if (!telecomUserId) linkInfo = { matched_by: resolved.matched_by, error: resolved.error ?? linkInfo?.error };
          }
        }
        const requested = payload.user_id !== undefined && payload.user_id !== null
          ? String(payload.user_id).trim()
          : null;
        if (requested && (isAdmin || !callerId)) telecomUserId = requested;
        if (!telecomUserId || !/^\d+$/.test(telecomUserId)) {
          return j({
            success: false,
            clients: [],
            brokers: [],
            error: "Connectez votre compte Maestro dans Réglages → Maestro pour voir vos clients.",
            code: "maestro_not_connected",

            link: linkInfo,
          });
        }


        const qs: string[] = [];
        if (payload.search) qs.push(`search=${encodeURIComponent(String(payload.search))}`);
        if (payload.limit) qs.push(`limit=${encodeURIComponent(String(payload.limit))}`);
        const q = qs.length ? `?${qs.join("&")}` : "";

        let path = "";
        if (action === "list_clients") path = `/users/${telecomUserId}/clients${q}`;
        else if (action === "list_brokers") path = `/users/${telecomUserId}/brokers${q}`;
        else if (action === "client_profile") {
          const cid = String(payload.client_id ?? "").trim();
          if (!cid) return j({ success: false, error: "client_id required" }, 400);
          path = `/users/${telecomUserId}/clients/${encodeURIComponent(cid)}/profile`;
        } else {
          const bid = String(payload.broker_id ?? "").trim();
          if (!bid) return j({ success: false, error: "broker_id required" }, 400);
          path = `/users/${telecomUserId}/brokers/${encodeURIComponent(bid)}/profile`;
        }

        const isList = action === "list_clients" || action === "list_brokers";
        const cacheKey = `${action}:${telecomUserId}:${String(payload.search ?? "")}:${Number(payload.limit ?? 25)}:${Number(payload.offset ?? 0)}`;
        const refresh = payload.refresh === true || payload.no_cache === true;

        if (isList && !refresh) {
          const cached = cacheGet(cacheKey);
          if (cached) return j({ success: true, ...(cached as object), maestro_user_id: telecomUserId, cached: true });
        }

        let all: any[] | null = null;
        let totalFromResponse: number | undefined;

        if (!isList) {
          const r = await maestroTelecomFetch(tCfg, path, { method: "GET", timeoutMs: 10000 });
          if (!r.ok) {
            console.error(`[maestro-actions] ${action} failed`, r.status, JSON.stringify(r.data)?.slice(0, 400));
            return j({ success: false, error: `Maestro indisponible (HTTP ${r.status ?? "?"})`, status: r.status, details: r.data });
          }
          const d: any = r.data;
          const obj = d?.profile ?? d?.client ?? d?.broker ?? d?.data ?? d;
          return j({ success: true, profile: normalizeContact(obj), raw: obj });
        }

        const r = await maestroTelecomFetch(tCfg, path, { method: "GET", timeoutMs: 10000 });
        if (!r.ok) {
          console.error(`[maestro-actions] ${action} failed`, r.status, JSON.stringify(r.data)?.slice(0, 400));
          const derived = action === "list_clients"
            ? await clientsFromCommunications(tCfg, telecomUserId, String(payload.search ?? "")).catch(() => null)
            : null;
          if (!derived) {
            return j({ success: false, clients: [], brokers: [], error: `Maestro indisponible (HTTP ${r.status ?? "?"})`, status: r.status, details: r.data });
          }
          all = derived;
          totalFromResponse = derived.length;
        } else {
          const d: any = r.data;
          const listRaw = Array.isArray(d) ? d : (d?.clients ?? d?.brokers ?? d?.data ?? d?.results ?? []);
          all = Array.isArray(listRaw) ? listRaw : [];
          totalFromResponse = d?.total_count ?? d?.total;
        }

        const offset = Number(payload.offset ?? 0);
        const limit = Number(payload.limit ?? 25);
        const total = totalFromResponse ?? all.length;
        const list = all.slice(offset, offset + limit);
        const has_more = offset + list.length < total;
        const next_offset = has_more ? offset + limit : null;
        const prev_offset = offset > 0 ? Math.max(0, offset - limit) : null;
        const page = Math.floor(offset / limit) + 1;
        const page_count = Math.ceil(total / limit);

        const response = action === "list_clients"
          ? {
              success: true,
              clients: list.map(normalizeContact),
              total,
              has_more,
              next_offset,
              prev_offset,
              page,
              page_count,
              offset,
              limit,
              count: list.length,
            }
          : {
              success: true,
              brokers: list.map(normalizeContact),
              total,
              has_more,
              next_offset,
              prev_offset,
              page,
              page_count,
              offset,
              limit,
              count: list.length,
            };

        if (refresh) cacheInvalidate(`${action}:${telecomUserId}:`);
        cacheSet(cacheKey, response);

        return j({ ...response, maestro_user_id: telecomUserId, cached: false });

      }
      case "test": {
        const r = await fetch(`${cfg.url}/contacts?limit=1`, { headers: h });
        return j({ success: r.ok, status: r.status });
      }
      default:
        return j({ success: false, error: "Action inconnue" }, 400);
    }
  } catch (e: any) {
    console.error("maestro-actions error", e);
    return new Response(JSON.stringify({ success: false, error: e?.message ?? "Erreur serveur", code: 0 }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});

