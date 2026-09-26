// Call center synchronization and control endpoint.
// Every action is scoped to the authenticated operator's own organization,
// extension and assigned queues. The client never supplies a trusted tenant
// or extension identifier.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

function env(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`missing_${name}`);
  return value;
}

async function pbx(path: string, method = "GET", body?: unknown) {
  // The configured URL may include /app/api; all paths below include it already.
  const baseUrl = env("FUSIONPBX_API_URL").trim().replace(/\/+$/, "").replace(/\/app\/api$/i, "");
  const url = `${baseUrl}/${path.replace(/^\/+/, "")}`;
  const auth = "Basic " + btoa(`${env("FUSIONPBX_USERNAME")}:${env("FUSIONPBX_API_KEY")}`);
  const response = await fetch(url, {
    method,
    headers: { Authorization: auth, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  try { return { ok: response.ok, status: response.status, data: JSON.parse(text) }; }
  catch { return { ok: response.ok, status: response.status, data: null }; }
}

type Actor = {
  userId: string;
  organizationId: string;
  extension: string;
  role: "agent" | "supervisor" | "admin";
  queues: string[];
};

// Supabase's remote ESM package does not carry this project's generated DB
// schema. Keep the schema boundary explicit rather than making every command
// payload type `never` during Deno's standalone check.
type AdminClient = any;

const extensionPattern = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,31}$/;
const queuePattern = /^[A-Za-z0-9][A-Za-z0-9 _.:@+-]{0,63}$/;
const callIdPattern = /^[A-Fa-f0-9][A-Fa-f0-9-]{7,127}$/;
const destinationPattern = /^(?:\+?[0-9]{2,20}|[A-Za-z0-9][A-Za-z0-9_.-]{0,31})$/;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function actorCanSupervise(actor: Actor) {
  return actor.role === "supervisor" || actor.role === "admin";
}

function actorIsAdmin(actor: Actor) {
  return actor.role === "admin";
}

async function requireActor(req: Request): Promise<{ actor: Actor; admin: AdminClient } | Response> {
  const authorization = req.headers.get("Authorization") ?? "";
  if (!authorization.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

  const token = authorization.slice("Bearer ".length).trim();
  if (!token) return json({ error: "Unauthorized" }, 401);

  const supabaseUrl = env("SUPABASE_URL");
  const userClient = createClient(supabaseUrl, env("SUPABASE_ANON_KEY"), {
    global: { headers: { Authorization: authorization } },
  });
  const { data: claims } = await userClient.auth.getClaims(token);
  const userId = typeof claims?.claims?.sub === "string" ? claims.claims.sub : "";
  if (!userId) return json({ error: "Unauthorized" }, 401);

  const admin = createClient(supabaseUrl, env("SUPABASE_SERVICE_ROLE_KEY"));
  const { data: operator, error } = await admin
    .from("pbx_softphone_users")
    .select("organization_id, extension, cc_role, cc_queues")
    .eq("portal_user_id", userId)
    .maybeSingle();
  if (error || !operator) return json({ error: "Call-center access denied" }, 403);

  const role = String(operator.cc_role ?? "");
  const organizationId = String(operator.organization_id ?? "");
  const extension = String(operator.extension ?? "");
  if (!(["agent", "supervisor", "admin"] as string[]).includes(role) || !organizationId || !extensionPattern.test(extension)) {
    return json({ error: "Call-center access denied" }, 403);
  }

  const queues = Array.isArray(operator.cc_queues)
    ? operator.cc_queues.map((queue: unknown) => asString(queue)).filter((queue) => queuePattern.test(queue))
    : [];
  return { actor: { userId, organizationId, extension, role: role as Actor["role"], queues }, admin };
}

function queueForActor(rawQueue: unknown, actor: Actor): string | null {
  const requested = asString(rawQueue);
  const queue = requested || (actor.queues.length === 1 ? actor.queues[0] : "");
  return queue && queuePattern.test(queue) && actor.queues.includes(queue) ? queue : null;
}

async function targetAgentExists(admin: AdminClient, organizationId: string, extension: string) {
  if (!extensionPattern.test(extension)) return false;
  const { data } = await admin
    .from("pbx_softphone_users")
    .select("extension")
    .eq("organization_id", organizationId)
    .eq("extension", extension)
    .maybeSingle();
  return Boolean(data);
}

async function callBelongsToOrganization(admin: AdminClient, organizationId: string, callUuid: string) {
  if (!callIdPattern.test(callUuid)) return false;
  const { data } = await admin
    .from("pbx_call_records")
    .select("pbx_uuid")
    .eq("organization_id", organizationId)
    .eq("pbx_uuid", callUuid)
    .maybeSingle();
  return Boolean(data);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const authenticated = await requireActor(req);
    if (authenticated instanceof Response) return authenticated;
    const { actor, admin } = authenticated;

    let body: Record<string, unknown> = {};
    try { body = asRecord(await req.json()); } catch { /* invalid JSON is handled as an empty request */ }
    const action = asString(body.action) || "sync-queues";

    switch (action) {
      case "sync-queues": {
        if (!actorCanSupervise(actor)) return json({ error: "Supervisor access required" }, 403);
        const queuesResponse = await pbx("/app/api/7/fifo");
        if (!queuesResponse.ok) return json({ error: "PBX unavailable" }, 502);
        const queues = Array.isArray(queuesResponse.data) ? queuesResponse.data : queuesResponse.data?.queues ?? [];
        for (const queue of queues) {
          await admin.from("cc_queue_stats").upsert({
            organization_id: actor.organizationId,
            queue_name: queue.name || queue.queue_name || queue.fifo_name,
            queue_extension: queue.extension || queue.fifo_extension || null,
            calls_waiting: queue.callers_waiting || queue.waiting || 0,
            calls_answered_today: queue.calls_answered_today || 0,
            calls_abandoned_today: queue.calls_abandoned_today || 0,
            avg_wait_time_seconds: queue.avg_wait || 0,
            avg_handle_time_seconds: queue.avg_handle || 0,
            service_level_percent: queue.service_level || 0,
            agents_total: queue.agents_total || 0,
            agents_available: queue.agents_available || 0,
            agents_on_call: queue.agents_on_call || 0,
            agents_paused: queue.agents_paused || 0,
            agents_offline: queue.agents_offline || 0,
            longest_wait_seconds: queue.longest_wait || 0,
            updated_at: new Date().toISOString(),
          }, { onConflict: "queue_name,organization_id" });
        }
        return json({ ok: true, queues: queues.length });
      }

      case "agent-login":
      case "agent-logout": {
        const queue = queueForActor(body.queue, actor);
        if (!queue) return json({ error: "Assigned queue required" }, 422);
        const loggedIn = action === "agent-login";
        const result = await pbx("/app/api/7/fifo_agent_status", "POST", {
          action: loggedIn ? "add" : "remove",
          agent: `${actor.extension}@${env("FUSIONPBX_SIP_DOMAIN")}`,
          queue,
          status: loggedIn ? "Logged In" : "Logged Out",
        });
        if (!result.ok) return json({ error: "PBX action failed" }, 502);
        await admin.from("pbx_softphone_users").update({
          cc_status: loggedIn ? "available" : "offline",
          cc_logged_in_at: loggedIn ? new Date().toISOString() : null,
        }).eq("portal_user_id", actor.userId).eq("organization_id", actor.organizationId).eq("extension", actor.extension);
        await admin.from("cc_agent_activity").insert({
          organization_id: actor.organizationId,
          agent_extension: actor.extension,
          activity_type: loggedIn ? "login" : "logout",
          queue_name: queue,
        });
        return json({ ok: true });
      }

      case "agent-pause":
      case "agent-unpause": {
        const paused = action === "agent-pause";
        const reason = paused ? asString(body.reason).slice(0, 120) : null;
        const result = await pbx("/app/api/7/fifo_agent_status", "POST", {
          action: "set-status",
          agent: `${actor.extension}@${env("FUSIONPBX_SIP_DOMAIN")}`,
          status: paused ? "On Break" : "Available",
          pause_reason: reason || undefined,
        });
        if (!result.ok) return json({ error: "PBX action failed" }, 502);
        await admin.from("pbx_softphone_users").update({
          cc_status: paused ? "paused" : "available",
          cc_pause_reason: paused ? reason : null,
        }).eq("portal_user_id", actor.userId).eq("organization_id", actor.organizationId).eq("extension", actor.extension);
        await admin.from("cc_agent_activity").insert({
          organization_id: actor.organizationId,
          agent_extension: actor.extension,
          activity_type: paused ? "pause" : "unpause",
          pause_reason: paused ? reason : null,
        });
        return json({ ok: true });
      }

      case "get-wallboard": {
        if (!actorCanSupervise(actor)) return json({ error: "Supervisor access required" }, 403);
        const [active, queuesResult, agentsResult] = await Promise.all([
          pbx("/app/api/7/call_active"),
          admin.from("cc_queue_stats").select("*").eq("organization_id", actor.organizationId),
          admin.from("pbx_softphone_users")
            .select("extension, display_name, cc_status, cc_role, cc_queues, cc_pause_reason, cc_logged_in_at, cc_calls_today, cc_avg_handle_time")
            .eq("organization_id", actor.organizationId)
            .neq("cc_role", "none"),
        ]);
        if (!active.ok) return json({ error: "PBX unavailable" }, 502);
        return json({
          activeCalls: Array.isArray(active.data) ? active.data : active.data?.calls ?? [],
          queues: queuesResult.data ?? [],
          agents: agentsResult.data ?? [],
        });
      }

      case "monitor-start": {
        if (!actorCanSupervise(actor)) return json({ error: "Supervisor access required" }, 403);
        const monitorType = asString(body.monitor_type);
        if (!(monitorType === "listen" || monitorType === "whisper" || monitorType === "barge")) return json({ error: "Invalid monitor type" }, 422);
        const callUuid = asString(body.call_uuid ?? body.callId);
        const agentExtension = asString(body.agent_extension);
        if (!(await callBelongsToOrganization(admin, actor.organizationId, callUuid))
          || !(await targetAgentExists(admin, actor.organizationId, agentExtension))) {
          return json({ error: "Valid active call and agent required" }, 422);
        }
        const domain = env("FUSIONPBX_DOMAIN_UUID");
        const command = monitorType === "listen"
          ? `originate {origination_caller_id_number=spy,eavesdrop_group=default}loopback/${actor.extension}/default &eavesdrop(${callUuid})`
          : monitorType === "whisper"
            ? `originate {origination_caller_id_number=whisper,eavesdrop_whisper=true}loopback/${actor.extension}/default &eavesdrop(${callUuid})`
            : `uuid_transfer ${callUuid} conference:barge_${callUuid}@${domain}`;
        const result = await pbx("/app/api/7/cmd", "POST", { cmd: command });
        if (!result.ok) return json({ error: "PBX action failed" }, 502);
        const { data } = await admin.from("cc_monitor_sessions").insert({
          organization_id: actor.organizationId,
          supervisor_extension: actor.extension,
          agent_extension: agentExtension,
          call_id: callUuid,
          monitor_type: monitorType,
        }).select().single();
        return json({ ok: true, session: data });
      }

      case "monitor-stop": {
        if (!actorCanSupervise(actor)) return json({ error: "Supervisor access required" }, 403);
        const callUuid = asString(body.call_uuid ?? body.callId);
        if (callUuid && !callIdPattern.test(callUuid)) return json({ error: "Invalid call" }, 422);
        if (callUuid) {
          const result = await pbx("/app/api/7/cmd", "POST", { cmd: `uuid_kill ${callUuid}` });
          if (!result.ok) return json({ error: "PBX action failed" }, 502);
        }
        const sessionId = asString(body.session_id);
        if (sessionId) await admin.from("cc_monitor_sessions")
          .update({ ended_at: new Date().toISOString() })
          .eq("id", sessionId)
          .eq("organization_id", actor.organizationId)
          .eq("supervisor_extension", actor.extension);
        return json({ ok: true });
      }

      case "force-answer":
      case "transfer-call": {
        if (!actorIsAdmin(actor)) return json({ error: "Administrator access required" }, 403);
        const callUuid = asString(body.call_uuid ?? body.callId);
        if (!(await callBelongsToOrganization(admin, actor.organizationId, callUuid))) return json({ error: "Valid call required" }, 422);
        const destination = action === "transfer-call" ? asString(body.destination) : "";
        if (action === "transfer-call" && !destinationPattern.test(destination)) return json({ error: "Valid destination required" }, 422);
        const command = action === "force-answer" ? `uuid_answer ${callUuid}` : `uuid_transfer ${callUuid} ${destination}`;
        const result = await pbx("/app/api/7/cmd", "POST", { cmd: command });
        return json({ ok: result.ok, result: result.ok ? result.data : null }, result.ok ? 200 : 502);
      }

      default:
        return json({ error: "Unknown action" }, 400);
    }
  } catch (error) {
    console.error("call-center-sync failed", { message: error instanceof Error ? error.message : "unknown" });
    return json({ error: "Server error" }, 500);
  }
});
