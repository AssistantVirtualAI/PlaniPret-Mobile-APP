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
