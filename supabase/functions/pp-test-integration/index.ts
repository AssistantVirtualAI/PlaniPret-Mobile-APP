// Test a saved Planiprêt integration with a real upstream ping.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

type TestResult = { success: boolean; message: string; details?: Record<string, unknown> };

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

    const body = await req.json().catch(() => null);
    const integration_key = String(body?.integration_key ?? "");
    if (!integration_key) return json({ error: "integration_key required" }, 400);

    const { data: row } = await admin
      .from("planipret_integration_config")
      .select("config_data")
      .eq("integration_key", integration_key)
      .maybeSingle();
    let cfg = (row?.config_data ?? {}) as Record<string, string>;
    if (integration_key === "ms365") {
      const { data: secretRow } = await admin
        .from("planipret_integration_secrets")
        .select("config")
        .in("provider", ["microsoft", "ms365"])
        .limit(1)
        .maybeSingle();
      cfg = { ...cfg, ...((secretRow?.config ?? {}) as Record<string, string>) };
    }

    let result: TestResult;
    try {
      switch (integration_key) {
        case "ns_api":     result = await testNsApi(cfg); break;
        case "anthropic":  result = await testAnthropic(cfg); break;
        case "elevenlabs": result = await testElevenLabs(cfg); break;
        case "ms365":      result = await testMs365(cfg); break;
        case "maestro":    result = await testMaestro(cfg); break;
        case "webhooks":   result = await testWebhooks(cfg); break;
        case "mobile_app": result = await testMobileApp(admin); break;
        case "compliance": result = await testCompliance(admin, cfg); break;
        default:           result = { success: false, message: `Tests not implemented for ${integration_key}` };
      }
    } catch (e) {
      result = { success: false, message: String((e as Error).message ?? e) };
    }

    await admin.from("planipret_integration_config").upsert({
      integration_key,
      last_tested_at: new Date().toISOString(),
      last_test_success: result.success,
      last_test_result: result.message.slice(0, 500),
      updated_at: new Date().toISOString(),
    }, { onConflict: "integration_key" });

    return json(result);
  } catch (e) {
    return json({ success: false, message: String((e as Error).message ?? e) }, 500);
  }
});

async function testNsApi(cfg: Record<string, string>): Promise<TestResult> {
  const base = (cfg.base_url || Deno.env.get("NS_API_BASE_URL") || "https://voice.ava-telecom.ca/ns-api/v2").replace(/\/$/, "");
  const key = cfg.api_key || Deno.env.get("NS_API_KEY") || "";
  const domain = cfg.domain || Deno.env.get("NS_DEFAULT_DOMAIN") || "";
  if (!key) return { success: false, message: "Missing api_key (config ou NS_API_KEY)" };
  // Ping a real authenticated endpoint. Root "/" returns 404 on many NS deployments.
  const url = domain ? `${base}/domains/${encodeURIComponent(domain)}` : `${base}/domains`;
  const r = await fetch(url, { headers: { Authorization: `Bearer ${key}`, Accept: "application/json" } });
  const txt = await r.text();
  return {
    success: r.ok,
    message: r.ok ? `NS-API OK (${r.status}) · ${domain || "domains"}` : `HTTP ${r.status}: ${txt.slice(0, 160)}`,
    details: { status: r.status, base, domain },
  };
}

async function testAnthropic(cfg: Record<string, string>): Promise<TestResult> {
  const key = cfg.api_key || Deno.env.get("ANTHROPIC_API_KEY") || "";
  if (!key) return { success: false, message: "Missing api_key (config ou ANTHROPIC_API_KEY)" };
  const model = cfg.model || "claude-sonnet-4-5";
  const t0 = Date.now();
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model, max_tokens: 16, messages: [{ role: "user", content: "ping" }] }),
  });
  const ms = Date.now() - t0;
  const body = await r.json().catch(() => ({}));
  if (!r.ok) return { success: false, message: `HTTP ${r.status}: ${body?.error?.message ?? "error"}`, details: { ms, model } };
  return { success: true, message: `Claude OK · ${model} · ${ms}ms`, details: { ms, model } };
}

async function testElevenLabs(cfg: Record<string, string>): Promise<TestResult> {
  const key = cfg.api_key || Deno.env.get("ELEVENLABS_API_KEY") || "";
  if (!key) return { success: false, message: "Missing api_key (config ou ELEVENLABS_API_KEY)" };
  const r = await fetch("https://api.elevenlabs.io/v1/user", { headers: { "xi-api-key": key } });
  if (!r.ok) return { success: false, message: `HTTP ${r.status}` };
  const j = await r.json();
  return {
    success: true,
    message: `Connecté · plan ${j?.subscription?.tier ?? "?"} · ${j?.subscription?.character_count ?? "?"}/${j?.subscription?.character_limit ?? "?"} chars`,
    details: { tier: j?.subscription?.tier },
  };
}

async function testMs365(cfg: Record<string, string>): Promise<TestResult> {
  const id = cfg.client_id || Deno.env.get("MICROSOFT_CLIENT_ID") || "";
  const secret = cfg.client_secret || Deno.env.get("MICROSOFT_CLIENT_SECRET") || "";
  const tenant = cfg.tenant_id || Deno.env.get("MICROSOFT_TENANT_ID") || "common";
  const mode = String(cfg.auth_mode || cfg.client_type || (cfg.public_client === "true" ? "public" : "auto")).toLowerCase();
  if (!id) return { success: false, message: "Missing client_id (config ou MICROSOFT_CLIENT_ID)" };
  if (!secret && (mode === "public" || mode === "auto")) {
    return { success: true, message: `Microsoft OAuth public OK · client ${id.slice(0, 8)}… · reconnecter l’utilisateur pour Mail/Calendar/Teams`, details: { auth_mode: "public", tenant } };
  }
  if (!secret) return { success: false, message: "Missing client_secret pour le mode confidential" };
  if (tenant === "common") return { success: false, message: "Tenant must be a real tenant ID for client-credentials test" };
  const r = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: id, client_secret: secret, grant_type: "client_credentials",
      scope: "https://graph.microsoft.com/.default",
    }).toString(),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) return { success: false, message: `Azure AD: ${j?.error_description ?? r.status}` };
  const org = await fetch("https://graph.microsoft.com/v1.0/organization?$select=id,displayName", {
    headers: { Authorization: `Bearer ${j.access_token}` },
  });
  if (!org.ok) {
    const body = await org.json().catch(() => ({}));
    return {
      success: true,
      message: `Microsoft OAuth OK · tests annuaire limités: ${body?.error?.message ?? org.status}`,
      details: { token_type: j?.token_type ?? "Bearer", directory_status: org.status, recommendation: "Reconnecter l'utilisateur pour Mail/Calendar/Teams; rôle Microsoft admin requis seulement pour les diagnostics annuaire." },
    };
  }
  return { success: true, message: `Microsoft OAuth OK · token type ${j?.token_type ?? "Bearer"}` };
}

async function testMaestro(cfg: Record<string, string>): Promise<TestResult> {
  const base = (cfg.api_url || Deno.env.get("MAESTRO_API_URL") || "").replace(/\/$/, "");
  const key = cfg.api_key || Deno.env.get("MAESTRO_API_KEY") || "";
  if (!base || !key) return { success: false, message: "Missing api_url / api_key (config ou MAESTRO_*)" };
  const r = await fetch(`${base}/health`, { headers: { Authorization: `Bearer ${key}` } });
  const txt = await r.text().catch(() => "");
  return { success: r.ok, message: r.ok ? `Maestro joignable (${r.status})` : `HTTP ${r.status}: ${txt.slice(0, 120)}` };
}

async function testWebhooks(cfg: Record<string, string>): Promise<TestResult> {
  const url = cfg.endpoint_url;
  const secret = cfg.secret || Deno.env.get("NS_WEBHOOK_SECRET") || "";
  if (!url) return { success: false, message: "Missing endpoint_url" };
  if (!secret) return { success: false, message: "Missing secret (générer ou définir NS_WEBHOOK_SECRET)" };
  try {
    // Sign the ping payload so receivers can validate the HMAC path.
    const body = JSON.stringify({ type: "ping", source: "planipret", ts: Date.now() });
    const enc = new TextEncoder();
    const keyObj = await crypto.subtle.importKey(
      "raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
    );
    const sig = await crypto.subtle.sign("HMAC", keyObj, enc.encode(body));
    const hex = Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
    const r = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", "x-pp-signature": hex, "x-pp-event": "ping" },
      body,
    });
    const txt = await r.text();
    return {
      success: r.ok,
      message: r.ok ? `Webhook OK (${r.status})` : `HTTP ${r.status}: ${txt.slice(0, 120)}`,
    };
  } catch (e) {
    return { success: false, message: `Unreachable: ${String((e as Error).message ?? e)}` };
  }
}

async function testMobileApp(admin: ReturnType<typeof createClient>): Promise<TestResult> {
  const since = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const { count: total } = await admin.from("planipret_profiles").select("user_id", { count: "exact", head: true });
  const { count: active } = await admin.from("planipret_profiles")
    .select("user_id", { count: "exact", head: true })
    .gte("updated_at", since);
  return {
    success: true,
    message: `Mobile App · ${active ?? 0}/${total ?? 0} courtiers actifs (7j)`,
    details: { total: total ?? 0, active_7d: active ?? 0 },
  };
}

async function testCompliance(admin: ReturnType<typeof createClient>, cfg: Record<string, string>): Promise<TestResult> {
  const { data: pol } = await admin.from("planipret_retention_policy").select("*").limit(1).maybeSingle();
  const fields = ["calls_retention_days", "messages_retention_days", "voicemails_retention_days", "ai_insights_retention_days", "audit_logs_retention_days"];
  const missing = fields.filter((f) => !pol?.[f]);
  const ok = missing.length === 0 && cfg.consent_call_recording === "true";
  return {
    success: ok,
    message: ok
      ? "Conformité OK · politique de rétention active · consentements activés"
      : `Manquant: ${missing.join(", ") || "consentement enregistrement"}`,
    details: { policy: pol ?? null, consents: cfg },
  };
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
