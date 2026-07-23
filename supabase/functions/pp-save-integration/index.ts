// Save Planiprêt integration config (admin only). Stores non-secret + secret
// fields in planipret_integration_config (admin-RLS'd) so other edge functions
// can consume them via service-role reads.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const ALLOWED_KEYS = new Set([
  "ms365", "ns_api", "elevenlabs", "maestro", "anthropic",
  "webhooks", "mobile_app", "compliance",
]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return json({ error: "missing auth" }, 401);
    }

    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userRes, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userRes?.user) return json({ error: "invalid auth" }, 401);
    const userId = userRes.user.id;

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const [{ data: isPp }, { data: isSuper }] = await Promise.all([
      admin.rpc("is_planipret_admin", { _user_id: userId }),
      admin.rpc("is_super_admin", { _user_id: userId }),
    ]);
    if (!isPp && !isSuper) return json({ error: "forbidden" }, 403);

    const body = await req.json().catch(() => null);
    const integration_key = String(body?.integration_key ?? "");
    const config = body?.config && typeof body.config === "object" ? body.config : null;
    const is_enabled = typeof body?.is_enabled === "boolean" ? body.is_enabled : undefined;

    if (!ALLOWED_KEYS.has(integration_key)) return json({ error: "invalid integration_key" }, 400);
    if (!config && is_enabled === undefined) return json({ error: "nothing to update" }, 400);

    // Merge with existing config_data so partial saves keep prior values
    // (especially secrets the UI sends back as empty/mask).
    const { data: existing } = await admin
      .from("planipret_integration_config")
      .select("config_data")
      .eq("integration_key", integration_key)
      .maybeSingle();

    const prev = (existing?.config_data ?? {}) as Record<string, unknown>;
    const merged: Record<string, unknown> = { ...prev };
    if (config) {
      for (const [k, v] of Object.entries(config)) {
        // Skip masked placeholders coming back from UI
        if (typeof v === "string" && (v === "" || v === "__MASKED__")) continue;
        merged[k] = v;
      }
    }

    // Configured = at least one non-empty value present
    const isConfigured = Object.values(merged).some(
      (v) => v !== null && v !== undefined && v !== "",
    );

    const payload: Record<string, unknown> = {
      integration_key,
      config_data: merged,
      is_configured: isConfigured,
      updated_at: new Date().toISOString(),
    };
    if (is_enabled !== undefined) payload.is_enabled = is_enabled;

    const { data, error } = await admin
      .from("planipret_integration_config")
      .upsert(payload, { onConflict: "integration_key" })
      .select("integration_key,is_enabled,is_configured,last_tested_at,last_test_success,last_test_result,updated_at")
      .single();
    if (error) return json({ error: error.message }, 500);

    return json({ success: true, message: "saved", integration: data });
  } catch (e) {
    return json({ error: String((e as Error).message ?? e) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
