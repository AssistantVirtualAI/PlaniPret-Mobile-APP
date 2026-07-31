import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { getMaestroTelecomConfig, isMaestroTelecomConfigured, maestroTelecomFetch } from "../_shared/maestro-telecom.ts";

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
  return {
    ...c,
    id,
    first_name: first,
    last_name: last,
    name: full,
    display_name: full,
    email: c.email ?? c.email_address ?? null,
    company: c.company ?? c.employer ?? c.organization ?? null,
    phone: c.phone ?? c.phone_number ?? cell ?? work ?? home ??
      (tels[0]?.telephone_number ? String(tels[0].telephone_number) : null),
    cell_phone: cell,
    work_phone: work,
    home_phone: home,
    maestro_client_id: c.client_id ?? id,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { action, payload = {} } = await req.json();
    const cfg = await getMaestroConfig(admin);
    if (!cfg.url || !cfg.key) {
      if (action !== "find_user_by_email" && action !== "test") {
        return new Response(JSON.stringify({ success: false, error: "Maestro non configuré" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
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
        const q = payload.query ?? "";
        try {
          const r = await fetch(`${cfg.url}/contacts?search=${encodeURIComponent(q)}`, { headers: h });
          const d = await r.json().catch(() => ({}));
          const raw = Array.isArray(d) ? d : (Array.isArray(d?.contacts) ? d.contacts : []);
          if (!r.ok) {
            console.warn("maestro list_contacts non-ok", r.status, d);
            return j({ success: false, contacts: [], fallback: true, status: r.status });
          }
          return j({ success: true, contacts: raw });
        } catch (err: any) {
          console.error("maestro list_contacts error", err?.message);
          return j({ success: false, contacts: [], fallback: true, error: err?.message });
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
      case "list_clients":
      case "client_profile":
      case "list_brokers":
      case "broker_profile": {
        const tCfg = await getMaestroTelecomConfig(admin);
        if (!isMaestroTelecomConfigured(tCfg)) return j({ success: false, error: "maestro_telecom_not_configured" }, 500);

        // Resolve the caller's numeric Maestro telecom user id from their JWT.
        const authHeader = req.headers.get("Authorization") ?? "";
        let callerId: string | null = null;
        if (authHeader) {
          const { data: u } = await admin.auth.getUser(authHeader.replace(/^Bearer\s+/i, ""));
          callerId = u?.user?.id ?? null;
        }
        let telecomUserId: string | null = null;
        let isAdmin = false;
        if (callerId) {
          const { data: prof } = await admin
            .from("planipret_profiles")
            .select("id, maestro_broker_id, role")
            .or(`user_id.eq.${callerId},id.eq.${callerId}`)
            .limit(1)
            .maybeSingle();
          telecomUserId = prof?.maestro_broker_id ? String(prof.maestro_broker_id).trim() : null;
          isAdmin = prof?.role === "admin";
        }
        const requested = payload.user_id !== undefined && payload.user_id !== null
          ? String(payload.user_id).trim()
          : null;
        if (requested && (isAdmin || !callerId)) telecomUserId = requested;
        if (!telecomUserId || !/^\d+$/.test(telecomUserId)) {
          return j({ success: false, error: "maestro_user_id_unresolved" }, 400);
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

        const r = await maestroTelecomFetch(tCfg, path, { method: "GET", timeoutMs: 10000 });
        if (!r.ok) {
          console.error(`[maestro-actions] ${action} failed`, r.status, JSON.stringify(r.data)?.slice(0, 400));
          return j({ success: false, error: `maestro ${action} failed`, status: r.status, details: r.data }, r.status && r.status >= 400 ? r.status : 502);
        }
        const d: any = r.data;
        if (action === "client_profile" || action === "broker_profile") {
          const obj = d?.profile ?? d?.client ?? d?.broker ?? d?.data ?? d;
          return j({ success: true, profile: normalizeContact(obj), raw: obj });
        }
        const listRaw = Array.isArray(d)
          ? d
          : (d?.clients ?? d?.brokers ?? d?.data ?? d?.results ?? []);
        const list = Array.isArray(listRaw) ? listRaw : [];
        return j({
          success: true,
          [action === "list_clients" ? "clients" : "brokers"]: list.map(normalizeContact),
          count: list.length,
        });
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

