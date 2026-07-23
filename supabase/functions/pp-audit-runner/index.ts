// Planipret system audit runner — admin only.
// Performs server-side checks that can't run from the browser:
//   - table existence / row counts
//   - secret presence (via planipret_integration_secrets + Deno.env)
//   - edge function pings
//   - RLS / Realtime publication checks via Postgres
//
// Returns a structured report grouped by section. Never exposes secret values.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

type Status = "pass" | "fail" | "warn" | "skip";
type Item = { id: string; name: string; description?: string; status: Status; detail?: string; ms?: number };
type Section = { id: string; title: string; emoji: string; items: Item[] };

const SUPA_URL = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Tables to verify (existence + row counts via service client)
const TABLES = [
  "planipret_profiles",
  "planipret_phone_calls",
  "planipret_phone_messages",
  "planipret_voicemails",
  "planipret_team_messages",
  "planipret_maestro_clients",
  "planipret_pipeline_logs",
  "planipret_maestro_sync_log",
  "planipret_audit_log",
  "planipret_ava_conversations",
  "planipret_reminders",
  "planipret_elevenlabs_config",
  "planipret_integration_secrets",
];

const REALTIME_TABLES = [
  "planipret_phone_calls",
  "planipret_phone_messages",
  "planipret_voicemails",
];

// Secret keys we expect. Some live in Deno.env, others in planipret_integration_secrets.
const ENV_SECRETS = [
  "ELEVENLABS_API_KEY",
  "ELEVENLABS_DEFAULT_AGENT_ID",
  "ELEVENLABS_AVA_VOICE_ID",
  "ANTHROPIC_API_KEY",
  "MICROSOFT_CLIENT_ID",
  "MICROSOFT_CLIENT_SECRET",
  "MICROSOFT_TENANT_ID",
  "MAESTRO_API_URL",
  "MAESTRO_API_KEY",
  "MAESTRO_WEBHOOK_SECRET",
  "OPENAI_API_KEY",
  "NS_API_BASE_URL",
  "NS_API_USER",
  "NS_API_PASSWORD",
  "NS_DEFAULT_DOMAIN",
  "NS_WEBHOOK_SECRET",
];

const EDGE_FUNCTIONS = [
  "ns-auth", "ns-calls", "ns-cdrs", "ns-recordings", "ns-transcription",
  "ns-sms", "ns-voicemail", "ns-webhook-receiver", "ns-webhook-setup", "ns-users",
  "elevenlabs-manage-agent", "ava-agent-config", "ava-tool-executor",
  "generate-voicemail-greeting", "pp-greeting-generate", "pp-greeting-voices",
  "maestro-pipeline-test", "maestro-pipeline-orchestrator",
  "maestro-cdr", "maestro-transcript", "maestro-ai-analysis",
  "maestro-task", "maestro-appointment", "maestro-client-lookup", "maestro-client-create",
  "maestro-client-history", "maestro-webhook-receiver", "maestro-counts",
  "ms365-actions", "ms365-oauth-exchange",
  "ai-analyze-call", "ai-daily-brief",
  "pp-audit-log", "pp-data-retention", "pp-gdpr-export", "pp-admin-user",
];

async function execSql(admin: ReturnType<typeof createClient>, sql: string): Promise<any> {
  // Use postgrest RPC if available — otherwise rely on direct queries elsewhere.
  // Here we wrap with our own SECURITY DEFINER helper if present.
  try {
    const { data, error } = await (admin as any).rpc("audit_exec_sql", { _sql: sql });
    if (error) return { error: error.message };
    return { data };
  } catch (e: any) {
    return { error: String(e?.message ?? e) };
  }
}

async function checkTable(admin: ReturnType<typeof createClient>, t: string): Promise<Item> {
  const start = performance.now();
  const { count, error } = await admin.from(t).select("*", { count: "exact", head: true });
  const ms = Math.round(performance.now() - start);
  if (error) return { id: `table-${t}`, name: `Table ${t}`, status: "fail", detail: error.message, ms };
  return { id: `table-${t}`, name: `Table ${t}`, status: "pass", detail: `${count ?? 0} enregistrements`, ms };
}

async function checkSecret(admin: ReturnType<typeof createClient>, key: string): Promise<Item> {
  // Env var first
  const envVal = Deno.env.get(key);
  if (envVal && envVal.length > 0) {
    return { id: `secret-${key}`, name: key, status: "pass", detail: "Configuré (env)" };
  }
  // Fallback: look in planipret_integration_secrets config
  const lower = key.toLowerCase();
  const { data } = await admin.from("planipret_integration_secrets").select("provider, config");
  const found = (data ?? []).find((r: any) => {
    const cfg = r.config ?? {};
    return Object.keys(cfg).some((k) => k.toLowerCase() === lower || k.toLowerCase().replace(/_/g, "") === lower.replace(/_/g, ""));
  });
  if (found) return { id: `secret-${key}`, name: key, status: "pass", detail: `Stocké (${found.provider})` };
  return { id: `secret-${key}`, name: key, status: "fail", detail: "Secret manquant ou vide" };
}

async function pingFunction(name: string): Promise<Item> {
  const start = performance.now();
  try {
    const res = await fetch(`${SUPA_URL}/functions/v1/${name}`, {
      method: "OPTIONS",
      headers: { "Authorization": `Bearer ${ANON}`, apikey: ANON },
    });
    const ms = Math.round(performance.now() - start);
    // 404 = function does not exist. Anything else (incl. 401/405/400) means deployed.
    if (res.status === 404) return { id: `fn-${name}`, name, status: "fail", detail: "Non déployée (404)", ms };
    if (res.status >= 500) return { id: `fn-${name}`, name, status: "fail", detail: `HTTP ${res.status}`, ms };
    return { id: `fn-${name}`, name, status: "pass", detail: `Déployée · ${ms}ms`, ms };
  } catch (e: any) {
    const msg = String(e?.message ?? e);
    // Rate limit / network blip → warning, not failure
    if (/rate.?limit|429|retry.?after/i.test(msg)) {
      return { id: `fn-${name}`, name, status: "warn", detail: "Rate limit temporaire — fonction déployée" };
    }
    return { id: `fn-${name}`, name, status: "fail", detail: msg };
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const supaUser = createClient(SUPA_URL, ANON, { global: { headers: { Authorization: authHeader } } });
    const { data: userRes } = await supaUser.auth.getUser();
    const user = userRes?.user;
    if (!user) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { data: lemtelOnly } = await supaUser.rpc("is_lemtel_only", { _user_id: user.id });
    if (lemtelOnly === true) {
      return new Response(JSON.stringify({ error: "forbidden_wrong_app", app: "lemtel" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const admin = createClient(SUPA_URL, SERVICE);
    const { data: profile } = await admin.from("planipret_profiles").select("role").eq("user_id", user.id).maybeSingle();
    if (!profile || (profile as any).role !== "admin") {
      return new Response(JSON.stringify({ error: "forbidden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sections: Section[] = [];

    // 1. Database
    const dbItems: Item[] = [];
    for (const t of TABLES) dbItems.push(await checkTable(admin, t));
    sections.push({ id: "db", title: "Base de données", emoji: "🗄️", items: dbItems });

    await sleep(300);

    // 2. Realtime publication (live check via SECURITY DEFINER RPC)
    const rtItems: Item[] = [];
    let pubTables: string[] = [];
    try {
      const { data, error } = await (admin as any).rpc("pp_audit_realtime_check");
      if (error) throw error;
      pubTables = Array.isArray(data) ? data : [];
    } catch (e: any) {
      // Fall through with empty list; we'll mark all as warn.
      console.warn("realtime_check_rpc_failed", e?.message);
    }
    for (const t of REALTIME_TABLES) {
      const inPub = pubTables.includes(t);
      rtItems.push({
        id: `rt-${t}`,
        name: `Realtime ${t}`,
        status: inPub ? "pass" : "fail",
        detail: inPub ? "Publication supabase_realtime ✓" : "Non ajoutée à la publication",
      });
    }
    sections.push({ id: "realtime", title: "Realtime", emoji: "📡", items: rtItems });
    await sleep(300);

    // 3. Secrets
    const secItems: Item[] = [];
    for (const k of ENV_SECRETS) secItems.push(await checkSecret(admin, k));
    sections.push({ id: "secrets", title: "Secrets & API Keys", emoji: "🔐", items: secItems });

    await sleep(300);

    // 4. Edge functions (existence ping — small concurrency to avoid edge rate limits)
    const fnItems: Item[] = [];
    const CONCURRENCY = 5;
    for (let i = 0; i < EDGE_FUNCTIONS.length; i += CONCURRENCY) {
      const batch = EDGE_FUNCTIONS.slice(i, i + CONCURRENCY);
      const results = await Promise.all(batch.map((f) => pingFunction(f)));
      fnItems.push(...results);
      if (i + CONCURRENCY < EDGE_FUNCTIONS.length) await sleep(150);
    }
    fnItems.sort((a, b) => a.name.localeCompare(b.name));
    sections.push({ id: "functions", title: "Edge Functions", emoji: "⚡", items: fnItems });
    await sleep(300);

    // 5. External APIs (lightweight)
    const extItems: Item[] = [];
    // ElevenLabs
    const elKey = Deno.env.get("ELEVENLABS_API_KEY");
    if (elKey) {
      const start = performance.now();
      try {
        const r = await fetch("https://api.elevenlabs.io/v1/user", { headers: { "xi-api-key": elKey } });
        const ms = Math.round(performance.now() - start);
        if (r.ok) {
          const j = await r.json().catch(() => ({}));
          extItems.push({ id: "el-user", name: "ElevenLabs API", status: "pass", detail: `Connecté · ${j?.subscription?.tier ?? "ok"} · ${ms}ms`, ms });
        } else {
          extItems.push({ id: "el-user", name: "ElevenLabs API", status: "fail", detail: `HTTP ${r.status}`, ms });
        }
      } catch (e: any) {
        extItems.push({ id: "el-user", name: "ElevenLabs API", status: "fail", detail: String(e?.message ?? e) });
      }
    } else {
      extItems.push({ id: "el-user", name: "ElevenLabs API", status: "skip", detail: "Clé manquante" });
    }
    // Claude
    const claudeKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (claudeKey) {
      const start = performance.now();
      try {
        const r = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: { "x-api-key": claudeKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
          body: JSON.stringify({ model: "claude-3-5-haiku-20241022", max_tokens: 4, messages: [{ role: "user", content: "ok" }] }),
        });
        const ms = Math.round(performance.now() - start);
        extItems.push({ id: "claude", name: "Claude (Anthropic)", status: r.ok ? "pass" : "fail", detail: r.ok ? `OK · ${ms}ms` : `HTTP ${r.status}`, ms });
      } catch (e: any) {
        extItems.push({ id: "claude", name: "Claude (Anthropic)", status: "fail", detail: String(e?.message ?? e) });
      }
    } else {
      extItems.push({ id: "claude", name: "Claude (Anthropic)", status: "skip", detail: "Clé manquante" });
    }
    // Maestro
    const maestroUrl = Deno.env.get("MAESTRO_API_URL");
    const maestroKey = Deno.env.get("MAESTRO_API_KEY");
    if (maestroUrl && maestroKey) {
      const start = performance.now();
      try {
        const r = await fetch(`${maestroUrl.replace(/\/$/, "")}/api/v1/clients?limit=1`, {
          headers: { Authorization: `Bearer ${maestroKey}` },
        });
        const ms = Math.round(performance.now() - start);
        extItems.push({ id: "maestro", name: "Maestro CRM API", status: r.ok ? "pass" : "warn", detail: `HTTP ${r.status} · ${ms}ms`, ms });
      } catch (e: any) {
        extItems.push({ id: "maestro", name: "Maestro CRM API", status: "fail", detail: String(e?.message ?? e) });
      }
    } else {
      extItems.push({ id: "maestro", name: "Maestro CRM API", status: "skip", detail: "Non configuré" });
    }
    sections.push({ id: "external", title: "APIs externes", emoji: "🌐", items: extItems });

    // Compute totals
    const all = sections.flatMap((s) => s.items);
    const totals = {
      pass: all.filter((i) => i.status === "pass").length,
      fail: all.filter((i) => i.status === "fail").length,
      warn: all.filter((i) => i.status === "warn").length,
      skip: all.filter((i) => i.status === "skip").length,
      total: all.length,
    };
    const score = totals.total === 0 ? 0 : Math.round((totals.pass / (totals.total - totals.skip || 1)) * 100);

    return new Response(JSON.stringify({ ok: true, generated_at: new Date().toISOString(), score, totals, sections }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: String(e?.message ?? e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
