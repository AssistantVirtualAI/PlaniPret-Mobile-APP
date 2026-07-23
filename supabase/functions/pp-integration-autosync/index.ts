// pp-integration-autosync — Detects which integrations are configured (via env
// secrets or planipret_integration_secrets rows) and marks them accordingly in
// planipret_integration_config. Optionally runs a live test on each.
//
// Trigger this after adding a new secret, or from the admin UI's "Refresh all"
// button. It is idempotent and safe to call anytime.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

type Detected = {
  integration_key: string;
  is_configured: boolean;
  source: string;
  missing?: string[];
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return json({ error: "missing auth" }, 401);

    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userRes } = await userClient.auth.getUser();
    if (!userRes?.user) return json({ error: "invalid auth" }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const [{ data: isPp }, { data: isSuper }] = await Promise.all([
      admin.rpc("is_planipret_admin", { _user_id: userRes.user.id }),
      admin.rpc("is_super_admin", { _user_id: userRes.user.id }),
    ]);
    if (!isPp && !isSuper) return json({ error: "forbidden" }, 403);

    const runTests = !!(await req.json().catch(() => ({})))?.run_tests;

    // 1. Load current config + secret rows once
    const [{ data: cfgRows }, { data: secretRows }] = await Promise.all([
      admin.from("planipret_integration_config").select("integration_key, config_data"),
      admin.from("planipret_integration_secrets").select("provider, config"),
    ]);
    const cfgMap = new Map<string, Record<string, string>>();
    (cfgRows ?? []).forEach((r: any) => cfgMap.set(r.integration_key, (r.config_data ?? {}) as Record<string, string>));
    const secretMap = new Map<string, Record<string, string>>();
    (secretRows ?? []).forEach((r: any) => secretMap.set(String(r.provider), (r.config ?? {}) as Record<string, string>));

    // 2. Detect each integration
    const detected: Detected[] = [];

    // ns_api
    {
      const cfg = cfgMap.get("ns_api") ?? {};
      const secret = secretMap.get("ns_api") ?? secretMap.get("nsapi") ?? {};
      const hasKey = !!(cfg.api_key || secret.api_key || Deno.env.get("NS_API_KEY"));
      const hasBase = !!(cfg.base_url || secret.base_url || Deno.env.get("NS_API_BASE_URL"));
      detected.push({
        integration_key: "ns_api",
        is_configured: hasKey && hasBase,
        source: cfg.api_key ? "config" : secret.api_key ? "secret_row" : hasKey ? "env" : "none",
        missing: [!hasKey && "NS_API_KEY", !hasBase && "NS_API_BASE_URL"].filter(Boolean) as string[],
      });
    }

    // elevenlabs
    {
      const cfg = cfgMap.get("elevenlabs") ?? {};
      const hasKey = !!(cfg.api_key || Deno.env.get("ELEVENLABS_API_KEY"));
      detected.push({
        integration_key: "elevenlabs",
        is_configured: hasKey,
        source: cfg.api_key ? "config" : hasKey ? "env" : "none",
        missing: hasKey ? [] : ["ELEVENLABS_API_KEY"],
      });
    }

    // anthropic
    {
      const cfg = cfgMap.get("anthropic") ?? {};
      const hasKey = !!(cfg.api_key || Deno.env.get("ANTHROPIC_API_KEY"));
      detected.push({
        integration_key: "anthropic",
        is_configured: hasKey,
        source: cfg.api_key ? "config" : hasKey ? "env" : "none",
        missing: hasKey ? [] : ["ANTHROPIC_API_KEY"],
      });
    }

    // ms365 (client-credentials app; per-user OAuth is separate)
    {
      const cfg = cfgMap.get("ms365") ?? {};
      const secret = secretMap.get("microsoft") ?? secretMap.get("ms365") ?? {};
      const cid = cfg.client_id || secret.client_id || Deno.env.get("MICROSOFT_CLIENT_ID") || Deno.env.get("MS365_CLIENT_ID");
      const csec = cfg.client_secret || secret.client_secret || Deno.env.get("MICROSOFT_CLIENT_SECRET") || Deno.env.get("MS365_CLIENT_SECRET");
      const tid = cfg.tenant_id || secret.tenant_id || Deno.env.get("MICROSOFT_TENANT_ID") || Deno.env.get("MS365_TENANT_ID");
      const ok = !!(cid && csec && tid);
      detected.push({
        integration_key: "ms365",
        is_configured: ok,
        source: cfg.client_id ? "config" : secret.client_id ? "secret_row" : ok ? "env" : "none",
        missing: [!cid && "MS365_CLIENT_ID", !csec && "MS365_CLIENT_SECRET", !tid && "MS365_TENANT_ID"].filter(Boolean) as string[],
      });
    }

    // maestro
    {
      const cfg = cfgMap.get("maestro") ?? {};
      const secret = secretMap.get("maestro") ?? {};
      const url = cfg.api_url || secret.api_url || Deno.env.get("MAESTRO_API_URL");
      const key = cfg.api_key || secret.api_key || Deno.env.get("MAESTRO_API_KEY");
      const ok = !!(url && key);
      detected.push({
        integration_key: "maestro",
        is_configured: ok,
        source: cfg.api_key ? "config" : secret.api_key ? "secret_row" : ok ? "env" : "none",
        missing: [!url && "MAESTRO_API_URL", !key && "MAESTRO_API_KEY"].filter(Boolean) as string[],
      });
    }

    // webhooks
    {
      const cfg = cfgMap.get("webhooks") ?? {};
      const hasUrl = !!cfg.endpoint_url;
      const hasSecret = !!(cfg.secret || Deno.env.get("NS_WEBHOOK_SECRET"));
      detected.push({
        integration_key: "webhooks",
        is_configured: hasUrl && hasSecret,
        source: cfg.endpoint_url ? "config" : "none",
        missing: [!hasUrl && "endpoint_url", !hasSecret && "NS_WEBHOOK_SECRET"].filter(Boolean) as string[],
      });
    }

    // compliance (retention + consent)
    {
      const cfg = cfgMap.get("compliance") ?? {};
      const { data: pol } = await admin.from("planipret_retention_policy").select("calls_retention_days").limit(1).maybeSingle();
      const ok = !!pol?.calls_retention_days && cfg.consent_call_recording === "true";
      detected.push({
        integration_key: "compliance",
        is_configured: ok,
        source: "policy",
        missing: ok ? [] : ["retention_policy_or_consent"],
      });
    }

    // 3. Upsert
    const now = new Date().toISOString();
    const rows = detected.map((d) => ({
      integration_key: d.integration_key,
      is_configured: d.is_configured,
      is_enabled: true,
      updated_at: now,
    }));
    const { error: upErr } = await admin.from("planipret_integration_config").upsert(rows, { onConflict: "integration_key" });
    if (upErr) return json({ error: upErr.message }, 500);

    // 4. Optionally run live tests via pp-test-integration
    const testResults: Record<string, any> = {};
    if (runTests) {
      for (const d of detected.filter((x) => x.is_configured)) {
        try {
          const r = await fetch(`${SUPABASE_URL}/functions/v1/pp-test-integration`, {
            method: "POST",
            headers: { "content-type": "application/json", Authorization: authHeader },
            body: JSON.stringify({ integration_key: d.integration_key }),
          });
          testResults[d.integration_key] = await r.json().catch(() => ({ ok: r.ok }));
        } catch (e) {
          testResults[d.integration_key] = { success: false, message: String((e as Error).message) };
        }
      }
    }

    return json({ ok: true, detected, tested: testResults, ran_tests: runTests });
  } catch (e) {
    return json({ error: String((e as Error).message ?? e) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
