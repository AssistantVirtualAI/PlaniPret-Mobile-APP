// Legacy compatibility adapter. All tool execution is centralized in
// ava-tool-executor so confirmation, ownership and idempotence cannot drift.
import { corsHeaders, jsonResponse } from "../_shared/ns-broker.ts";

const ALIASES: Record<string, string> = {
  cancel_task: "delete_task",
  read_voicemails: "get_voicemails",
  list_clients: "list_my_clients",
  list_my_clients: "list_my_clients",
  client_profile: "get_maestro_client_profile",
  get_client_profile: "get_client_profile",
  list_brokers: "list_my_brokers",
  list_my_brokers: "list_my_brokers",
  broker_profile: "get_maestro_broker_profile",
  get_broker_profile: "get_maestro_broker_profile",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ success: false, error: "method_not_allowed" }, 405);

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return jsonResponse({ success: false, error: "unauthorized" }, 401);

  const body = await req.json().catch(() => ({}));
  const requested = String(body?.tool_name ?? "");
  const toolName = ALIASES[requested] ?? requested;
  if (!toolName) return jsonResponse({ success: false, error: "tool_name_required" }, 400);

  const response = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/ava-tool-executor`, {
    method: "POST",
    headers: {
      Authorization: authHeader,
      apikey: Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      tool_name: toolName,
      parameters: body?.parameters ?? {},
      session_id: body?.session_id ?? null,
    }),
  });
  const text = await response.text();
  return new Response(text, {
    status: response.status,
    headers: { ...corsHeaders, "Content-Type": response.headers.get("Content-Type") ?? "application/json" },
  });
});
