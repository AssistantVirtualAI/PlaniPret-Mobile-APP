// Call Center sync + control endpoint.
// Pulls FusionPBX queue/agent stats into Supabase and exposes
// agent + supervisor actions (login, pause, monitor, whisper, barge).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const LEMTEL_ORG = "71755d33-ed64-4ad5-a828-61c9d2029eb7";

function env(n: string) {
  const v = Deno.env.get(n);
  if (!v) throw new Error(`Missing secret ${n}`);
  return v;
}

async function pbx(path: string, method = "GET", body?: any) {
  const url = `${env("FUSIONPBX_API_URL").replace(/\/$/, "")}${path}`;
  const auth = "Basic " + btoa(`${env("FUSIONPBX_USERNAME")}:${env("FUSIONPBX_API_KEY")}`);
  const res = await fetch(url, {
    method,
    headers: { Authorization: auth, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  try { return { ok: res.ok, status: res.status, data: JSON.parse(text) }; }
  catch { return { ok: res.ok, status: res.status, data: text }; }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const admin = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"));
  let body: any = {};
  try { body = await req.json(); } catch {}
  const action = body.action || "sync-queues";
  const organization_id = body.organization_id || LEMTEL_ORG;

  try {
    switch (action) {
      case "sync-queues": {
        const queues = await pbx("/app/api/7/fifo");
        const list = Array.isArray(queues.data) ? queues.data : queues.data?.queues || [];
        for (const q of list) {
          await admin.from("cc_queue_stats").upsert({
            organization_id,
            queue_name: q.name || q.queue_name || q.fifo_name,
            queue_extension: q.extension || q.fifo_extension || null,
            calls_waiting: q.callers_waiting || q.waiting || 0,
            calls_answered_today: q.calls_answered_today || 0,
            calls_abandoned_today: q.calls_abandoned_today || 0,
            avg_wait_time_seconds: q.avg_wait || 0,
            avg_handle_time_seconds: q.avg_handle || 0,
            service_level_percent: q.service_level || 0,
            agents_total: q.agents_total || 0,
            agents_available: q.agents_available || 0,
            agents_on_call: q.agents_on_call || 0,
            agents_paused: q.agents_paused || 0,
            agents_offline: q.agents_offline || 0,
            longest_wait_seconds: q.longest_wait || 0,
            updated_at: new Date().toISOString(),
          }, { onConflict: "queue_name,organization_id" as any });
        }
        return json({ ok: true, queues: list.length });
      }

      case "agent-login":
      case "agent-logout": {
        const status = action === "agent-login" ? "Logged In" : "Logged Out";
        await pbx("/app/api/7/fifo_agent_status", "POST", {
          action: action === "agent-login" ? "add" : "remove",
          agent: `${body.extension}@${env("FUSIONPBX_SIP_DOMAIN")}`,
          queue: body.queue,
          status,
        });
        await admin.from("pbx_softphone_users").update({
          cc_status: action === "agent-login" ? "available" : "offline",
          cc_logged_in_at: action === "agent-login" ? new Date().toISOString() : null,
        }).eq("extension", body.extension).eq("organization_id", organization_id);
        await admin.from("cc_agent_activity").insert({
          organization_id, agent_extension: body.extension,
          activity_type: action === "agent-login" ? "login" : "logout",
          queue_name: body.queue,
        });
        return json({ ok: true });
      }

      case "agent-pause":
      case "agent-unpause": {
        const paused = action === "agent-pause";
        await pbx("/app/api/7/fifo_agent_status", "POST", {
          action: "set-status",
          agent: `${body.extension}@${env("FUSIONPBX_SIP_DOMAIN")}`,
          status: paused ? "On Break" : "Available",
          pause_reason: body.reason,
        });
        await admin.from("pbx_softphone_users").update({
          cc_status: paused ? "paused" : "available",
          cc_pause_reason: paused ? body.reason : null,
        }).eq("extension", body.extension).eq("organization_id", organization_id);
        await admin.from("cc_agent_activity").insert({
          organization_id, agent_extension: body.extension,
          activity_type: paused ? "pause" : "unpause",
          pause_reason: body.reason,
        });
        return json({ ok: true });
      }

      case "monitor-start": {
        const type = body.monitor_type || "listen"; // listen | whisper | barge
        const domain = env("FUSIONPBX_DOMAIN_UUID");
        const cmd = type === "listen"
          ? `originate {origination_caller_id_number=spy,eavesdrop_group=default}loopback/${body.supervisor_extension}/default &eavesdrop(${body.call_uuid})`
          : type === "whisper"
          ? `originate {origination_caller_id_number=whisper,eavesdrop_whisper=true}loopback/${body.supervisor_extension}/default &eavesdrop(${body.call_uuid})`
          : `uuid_transfer ${body.call_uuid} conference:barge_${body.call_uuid}@${domain}`;
        await pbx("/app/api/7/cmd", "POST", { cmd });
        const { data } = await admin.from("cc_monitor_sessions").insert({
          organization_id,
          supervisor_extension: body.supervisor_extension,
          agent_extension: body.agent_extension,
          call_id: body.call_uuid,
          monitor_type: type,
        }).select().single();
        return json({ ok: true, session: data });
      }

      case "monitor-stop": {
        if (body.call_uuid) await pbx("/app/api/7/cmd", "POST", { cmd: `uuid_kill ${body.call_uuid}` });
        if (body.session_id) {
          await admin.from("cc_monitor_sessions").update({ ended_at: new Date().toISOString() }).eq("id", body.session_id);
        }
        return json({ ok: true });
      }

      case "get-wallboard": {
        const [active, queues] = await Promise.all([
          pbx("/app/api/7/call_active"),
          admin.from("cc_queue_stats").select("*").eq("organization_id", organization_id),
        ]);
        const { data: agents } = await admin
          .from("pbx_softphone_users")
          .select("extension, display_name, cc_status, cc_role, cc_queues, cc_pause_reason, cc_logged_in_at, cc_calls_today, cc_avg_handle_time")
          .eq("organization_id", organization_id)
          .neq("cc_role", "none");
        return json({
          activeCalls: Array.isArray(active.data) ? active.data : (active.data?.calls || []),
          queues: queues.data || [],
          agents: agents || [],
        });
      }

      case "force-answer":
      case "transfer-call": {
        const cmd = action === "force-answer"
          ? `uuid_answer ${body.call_uuid}`
          : `uuid_transfer ${body.call_uuid} ${body.destination}`;
        const r = await pbx("/app/api/7/cmd", "POST", { cmd });
        return json({ ok: r.ok, result: r.data });
      }

      default:
        return json({ error: "Unknown action", action }, 400);
    }
  } catch (e: any) {
    console.error("call-center-sync error", e);
    return json({ error: String(e?.message || e) }, 500);
  }
});
