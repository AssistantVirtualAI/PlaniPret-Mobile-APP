import { authBroker, corsHeaders, jsonResponse, supaAdmin } from "../_shared/ns-broker.ts";

const BASE = `${Deno.env.get("SUPABASE_URL")}/functions/v1`;

async function callFn(name: string, authHeader: string, body: any) {
  const res = await fetch(`${BASE}/${name}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: authHeader },
    body: JSON.stringify(body ?? {}),
  });
  const text = await res.text();
  try { return { ...JSON.parse(text), _http_ok: res.ok, _status: res.status }; } catch { return { success: res.ok, _http_ok: res.ok, _status: res.status, raw: text }; }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const authHeader = req.headers.get("Authorization") ?? "";
  try {
    const auth = await authBroker(req);
    if ("error" in auth) return auth.error;
    const { admin, userId, profile } = auth;

    const { tool_name, parameters = {} } = await req.json().catch(() => ({}));
    if (!tool_name) return jsonResponse({ success: false, error: "tool_name requis" }, 200);

    let result: any = { success: false, error: "Outil inconnu" };

    switch (tool_name) {
      case "make_call": {
        const to = parameters.to_number ?? parameters.to ?? parameters.destination ?? parameters.number;
        const r = await callFn("pp-ns-calls", authHeader, {
          action: "start",
          to_number: to,
          destination: to,
          caller_id_name: profile.full_name,
          client_type: parameters.client_type ?? "mobile",
        });
        result = r?.success === true
          ? { success: true, call_id: r.call_id, message: r?.message ?? `Appel lancé vers ${parameters.contact_name ?? to}` }
          : { success: false, error: r?.error ?? r?.message ?? "Échec de l'appel", message: r?.message };
        break;
      }
      case "send_sms": {
        const to = parameters.to ?? parameters.to_number ?? parameters.destination ?? parameters.number;
        const message = parameters.message ?? parameters.body ?? parameters.text ?? parameters.content;
        const r = await callFn("pp-ns-sms", authHeader, { action: "send", to, message, type: parameters.type ?? "sms" });
        result = (r?.ok === true || r?.success === true)
          ? { success: true, to: r.to ?? to, from: r.from, thread_id: r.thread_id, message: "SMS envoyé" }
          : { success: false, error: r?.error ?? r?.body ?? "Échec SMS", message: r?.message };
        break;
      }
      case "send_email": {
        const r = await callFn("ms365-actions", authHeader, {
          action: "send_email",
          payload: { to: parameters.to, subject: parameters.subject, body: parameters.body },
        });
        result = r?.success ? { success: true, message: "Courriel envoyé" } : { success: false, error: r?.error ?? "Échec de l'envoi" };
        break;
      }
      case "create_task": {
        const r = await callFn("maestro-actions", authHeader, { action: "create_task", payload: parameters });
        result = r?.success ? { success: true, task_id: r.task_id ?? r.id ?? null, message: "Tâche créée" } : { success: false, error: r?.error ?? "Échec création tâche" };
        break;
      }
      case "create_calendar_event": {
        const [m, ms] = await Promise.all([
          callFn("maestro-actions", authHeader, { action: "create_event", payload: parameters }),
          callFn("ms365-actions", authHeader, { action: "create_calendar_event", payload: parameters }),
        ]);
        const ok = !!(m?.success || ms?.success);
        result = ok
          ? { success: true, message: "RDV créé dans Maestro et Microsoft 365" }
          : { success: false, error: m?.error ?? ms?.error ?? "Échec création RDV" };
        break;
      }
      case "get_daily_briefing": {
        const r = await callFn("ai-daily-brief", authHeader, {});
        result = r?.success ? { success: true, briefing: r.briefing_text ?? r.briefing ?? "" } : { success: false, error: r?.error ?? "Échec brief" };
        break;
      }
      case "search_contact": {
        const r = await callFn("maestro-actions", authHeader, { action: "list_contacts", payload: { query: parameters.query } });
        result = r?.success ? { success: true, contacts: r.contacts ?? r.data ?? [] } : { success: false, error: r?.error ?? "Échec recherche" };
        break;
      }
      case "read_emails": {
        const r = await callFn("ms365-actions", authHeader, { action: "read_emails", payload: { limit: parameters.limit ?? 10 } });
        result = r?.success ? { success: true, emails: r.emails ?? r.data ?? [] } : { success: false, error: r?.error ?? "Échec lecture courriels" };
        break;
      }
      case "get_call_history": {
        const { data } = await admin.from("planipret_phone_calls")
          .select("id, direction, from_number, from_name, to_number, to_name, started_at, duration_seconds, status")
          .eq("user_id", userId).order("started_at", { ascending: false }).limit(parameters.limit ?? 10);
        result = { success: true, calls: data ?? [] };
        break;
      }
      case "read_voicemails": {
        const { data } = await admin.from("planipret_voicemails")
          .select("id, from_number, from_name, duration_seconds, transcript, received_at")
          .eq("user_id", userId).eq("is_read", false).order("created_at", { ascending: false });
        result = { success: true, voicemails: data ?? [], count: data?.length ?? 0 };
        break;
      }
    }

    // Audit log
    try {
      await supaAdmin().from("ai_request_audit_log").insert({
        user_id: userId,
        action: `elevenlabs_tool:${tool_name}`,
        metadata: { parameters, result },
      });
    } catch (_) { /* table may not accept; ignore */ }

    return jsonResponse(result);
  } catch (e) {
    console.error("elevenlabs-tool-handler", e);
    return jsonResponse({ success: false, error: "Erreur serveur: " + String(e) }, 200);
  }
});
