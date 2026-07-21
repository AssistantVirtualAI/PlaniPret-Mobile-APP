// ElevenLabs Management API — admin-only edge function used by the
// Planiprêt admin "Intégrations" page to create, configure, and sync
// the AVA conversational agent without touching the ElevenLabs dashboard.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { buildAvaToolsArray, buildAvaToolConfigs } from "../_shared/ava-tools.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const EL_API = "https://api.elevenlabs.io/v1";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function stringifyElError(data: any, fallback: string): string {
  if (!data) return fallback;
  if (typeof data === "string") return data;
  // FastAPI/Pydantic style: detail can be string OR array of {loc,msg,type}
  const detail = data.detail ?? data.error ?? data.message;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail.map((d: any) => {
      if (typeof d === "string") return d;
      const loc = Array.isArray(d?.loc) ? d.loc.join(".") : "";
      return `${loc ? loc + ": " : ""}${d?.msg ?? JSON.stringify(d)}`;
    }).join(" | ");
  }
  if (detail && typeof detail === "object") {
    return detail.message || JSON.stringify(detail);
  }
  try { return JSON.stringify(data); } catch { return fallback; }
}

async function elFetch(apiKey: string, path: string, init: RequestInit = {}) {
  const r = await fetch(`${EL_API}${path}`, {
    ...init,
    headers: {
      "xi-api-key": apiKey,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const text = await r.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
  if (!r.ok) {
    const errStr = stringifyElError(data, text || `HTTP ${r.status}`);
    return { ok: false, status: r.status, error: errStr, data };
  }
  return { ok: true, status: r.status, data };
}


async function getConfig(admin: any, key: string): Promise<string | null> {
  const { data } = await admin.from("planipret_elevenlabs_config").select("value").eq("key", key).maybeSingle();
  return data?.value ?? null;
}

async function setConfig(admin: any, key: string, value: string, userId: string) {
  await admin.from("planipret_elevenlabs_config").upsert(
    { key, value, updated_by: userId, updated_at: new Date().toISOString() },
    { onConflict: "key" },
  );
}

async function broadcastSetup(admin: any, userId: string, payload: any) {
  try {
    const channel = admin.channel(`elevenlabs-setup:${userId}`);
    await channel.send({ type: "broadcast", event: "progress", payload });
    await admin.removeChannel(channel);
  } catch {/* noop */}
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ success: false, error: "method_not_allowed" }, 405);

  // Auth + admin check (with service_role bypass for internal server-to-server calls)
  const authHeader = req.headers.get("Authorization") ?? "";
  const bearer = authHeader.replace(/^Bearer\s+/i, "");
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  let userId: string | null = null;
  if (bearer && bearer === SUPABASE_SERVICE_ROLE_KEY) {
    const peek = await req.clone().json().catch(() => ({}));
    userId = peek?._user_id ?? peek?.user_id ?? null;
  } else {
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) return json({ success: false, error: "unauthorized" }, 401);
    userId = user.id;
  }
  if (!userId) return json({ success: false, error: "unauthorized" }, 401);
  const { data: isAdmin } = await admin.rpc("is_planipret_admin", { _user_id: userId });
  if (!isAdmin) return json({ success: false, error: "forbidden_admin_only" }, 403);

  const apiKey = Deno.env.get("ELEVENLABS_API_KEY") ?? "";
  if (!apiKey) return json({ success: false, error: "elevenlabs_api_key_missing" }, 500);

  const body = await req.json().catch(() => ({}));
  const { action, payload } = body ?? {};
  if (!action) return json({ success: false, error: "action_required" }, 400);

  let agentId = await getConfig(admin, "agent_id") || Deno.env.get("ELEVENLABS_DEFAULT_AGENT_ID") || "";

  try {
    switch (action) {
      case "test_connection": {
        const r = await elFetch(apiKey, "/user");
        if (!r.ok) return json({ success: false, error: r.error, status: r.status });
        return json({ success: true, user: r.data });
      }

      case "get_all_voices": {
        const r = await elFetch(apiKey, "/voices");
        if (!r.ok) return json({ success: false, error: r.error });
        const voices = (r.data?.voices ?? []).map((v: any) => ({
          voice_id: v.voice_id, name: v.name, preview_url: v.preview_url,
          category: v.category, labels: v.labels,
        }));
        return json({ success: true, voices });
      }

      case "get_agent": {
        if (!agentId) return json({ success: false, error: "no_agent_configured" });
        const r = await elFetch(apiKey, `/convai/agents/${agentId}`);
        if (!r.ok) return json({ success: false, error: r.error, status: r.status });
        // Resolve tool_ids → tool names so the UI's tool-status panel stays accurate.
        const prompt = r.data?.conversation_config?.agent?.prompt ?? {};
        const inlineTools: any[] = prompt.tools ?? [];
        const toolIds: string[] = prompt.tool_ids ?? [];
        if (toolIds.length && inlineTools.length === 0) {
          const reg = await elFetch(apiKey, "/convai/tools");
          if (reg.ok) {
            const all: any[] = reg.data?.tools ?? [];
            const idSet = new Set(toolIds);
            const synthesized = all
              .filter((t) => idSet.has(t?.id ?? t?.tool_id))
              .map((t) => ({ name: t?.tool_config?.name ?? t?.name, description: t?.tool_config?.description ?? "" }));
            if (synthesized.length) {
              r.data.conversation_config.agent.prompt.tools = synthesized;
            }
          }
        }
        return json({ success: true, agent: r.data, agent_id: agentId });
      }


      case "list_llms": {
        const r = await elFetch(apiKey, "/convai/llm-prices");
        if (!r.ok) return json({ success: false, error: r.error, status: r.status });
        const llms = (r.data?.llm_prices ?? r.data?.llms ?? []).map((x: any) => x.llm ?? x.model ?? x).filter(Boolean);
        return json({ success: true, llms });
      }

      case "create_agent": {
        // Pick a supported Claude model dynamically (the old "claude-3-5-sonnet" is deprecated by ElevenLabs).
        let chosenLlm = payload?.llm as string | undefined;
        if (!chosenLlm) {
          const pricesRes = await elFetch(apiKey, "/convai/llm-prices");
          const llms: string[] = ((pricesRes.data?.llm_prices ?? pricesRes.data?.llms ?? []) as any[])
            .map((x) => x.llm ?? x.model ?? x).filter(Boolean);
          chosenLlm = llms.find((m) => /claude.*sonnet/i.test(m))
            || llms.find((m) => /claude/i.test(m))
            || llms.find((m) => /gemini.*flash/i.test(m))
            || llms[0]
            || "gemini-2.0-flash-001";
        }

        const createBody: any = {
          name: payload?.name || "AVA — Planiprêt AI Portal",
          conversation_config: {
            agent: {
              prompt: {
                prompt: payload?.system_prompt || "Tu es AVA, l'assistante vocale IA de Planiprêt. Tu aides les courtiers hypothécaires à gérer leurs appels, SMS, emails et tâches CRM. Tu parles en français canadien. Tu es professionnelle et efficace.",
                llm: chosenLlm,
                temperature: payload?.temperature ?? 0.7,
                max_tokens: payload?.max_tokens ?? 500,
                tool_ids: [],
              },
              first_message: payload?.first_message || "Bonjour! Je suis AVA, votre assistante IA Planiprêt. Comment puis-je vous aider?",
              language: payload?.language || "fr",
            },
            tts: {
              model_id: "eleven_turbo_v2_5",
              voice_id: payload?.voice_id || "XB0fDUnXU5powFXDhCwa",
              agent_output_audio_format: "pcm_16000",
              optimize_streaming_latency: 4,
              stability: 0.6, similarity_boost: 0.8, style: 0.3, use_speaker_boost: true,
            },
            conversation: {
              max_duration_seconds: 1800,
              client_events: ["audio","interruption","user_transcript","agent_response","agent_response_correction"],
            },
          },
          platform_settings: { widget: { is_disabled: true } },
        };
        let r = await elFetch(apiKey, "/convai/agents/create", { method: "POST", body: JSON.stringify(createBody) });

        // Retry once with a guaranteed-available fallback if the LLM was rejected.
        if (!r.ok && /llm|model/i.test(String(r.error))) {
          await broadcastSetup(admin, userId, { type: "setup_error", step: "create_agent", error: `LLM ${chosenLlm} refusé — retry avec gemini-2.0-flash-001` });
          createBody.conversation_config.agent.prompt.llm = "gemini-2.0-flash-001";
          r = await elFetch(apiKey, "/convai/agents/create", { method: "POST", body: JSON.stringify(createBody) });
        }

        if (!r.ok) {
          const hint = /llm|model/i.test(String(r.error))
            ? `Modèle LLM rejeté par ElevenLabs (${chosenLlm}). La clé Claude (ANTHROPIC_API_KEY) n'est pas utilisée ici — c'est ElevenLabs qui choisit le modèle.`
            : r.error;
          return json({ success: false, error: hint, status: r.status, raw: r.data });
        }
        const newId = r.data?.agent_id;
        if (newId) {
          await setConfig(admin, "agent_id", newId, userId);
          await setConfig(admin, "voice_id", createBody.conversation_config.tts.voice_id, userId);
          await setConfig(admin, "llm", createBody.conversation_config.agent.prompt.llm, userId);
          await setConfig(admin, "setup_completed", "true", userId);
        }
        return json({ success: true, agent_id: newId, llm_used: createBody.conversation_config.agent.prompt.llm });
      }

      case "update_agent": {
        if (!agentId) return json({ success: false, error: "no_agent_configured" });
        const r = await elFetch(apiKey, `/convai/agents/${agentId}`, { method: "PATCH", body: JSON.stringify(payload || {}) });
        if (!r.ok) return json({ success: false, error: r.error, status: r.status });
        return json({ success: true, agent: r.data });
      }

      case "sync_all_tools": {
        if (!agentId) return json({ success: false, error: "no_agent_configured" });

        // 1. Load existing registry tools and index by name.
        const listRes = await elFetch(apiKey, "/convai/tools");
        if (!listRes.ok) {
          await broadcastSetup(admin, userId, { type: "setup_error", step: "list_tools", error: listRes.error });
          return json({ success: false, error: `Impossible de lister les outils ElevenLabs: ${listRes.error}`, status: listRes.status });
        }
        const existing: any[] = listRes.data?.tools ?? [];
        const byName = new Map<string, any>(existing.map((t) => [t?.tool_config?.name ?? t?.name, t]));

        // 2. Upsert each AVA tool in the registry.
        const desired = buildAvaToolConfigs(SUPABASE_URL, SUPABASE_ANON_KEY);
        const ids: string[] = [];
        const errors: string[] = [];
        const errors_detailed: Array<{ tool: string; status: number; message: string; data?: any }> = [];

        for (let i = 0; i < desired.length; i++) {
          const cfg = desired[i];
          const name = cfg.tool_config.name;
          const existingTool = byName.get(name);
          let toolId: string | undefined = existingTool?.id ?? existingTool?.tool_id;
          let upRes;
          if (toolId) {
            upRes = await elFetch(apiKey, `/convai/tools/${toolId}`, { method: "PATCH", body: JSON.stringify(cfg) });
          } else {
            upRes = await elFetch(apiKey, "/convai/tools", { method: "POST", body: JSON.stringify(cfg) });
            toolId = upRes.data?.id ?? upRes.data?.tool_id;
          }
          if (!upRes.ok || !toolId) {
            const msg = typeof upRes.error === "string" ? upRes.error : JSON.stringify(upRes.error ?? "no id");
            console.log(`[sync_all_tools] ${name} FAILED status=${upRes.status} error=${msg} body=${JSON.stringify(upRes.data ?? null)}`);
            errors.push(`${name}: ${msg}`);
            errors_detailed.push({ tool: name, status: upRes.status, message: msg, data: upRes.data });
            await broadcastSetup(admin, userId, { type: "setup_error", step: name, error: msg });
            continue;
          }
          console.log(`[sync_all_tools] ${name} OK id=${toolId}`);
          ids.push(toolId);
          await broadcastSetup(admin, userId, { type: "tool_added", tool_name: name, count: i + 1, total: desired.length });
        }

        const uniqIds = Array.from(new Set(ids));

        if (uniqIds.length === 0) {
          return json({
            success: false,
            error: `Aucun outil créé. Premières erreurs: ${errors.slice(0, 3).join(" | ")}`,
            errors_detailed,
          });
        }

        // 3. Attach tool_ids on the agent.
        const patchRes = await elFetch(apiKey, `/convai/agents/${agentId}`, {
          method: "PATCH",
          body: JSON.stringify({ conversation_config: { agent: { prompt: { tool_ids: uniqIds, tools: [] } } } }),
        });

        // 4. Legacy fallback: some installs still accept inline `tools`.
        if (!patchRes.ok) {
          console.log(`[sync_all_tools] tool_ids attach failed: ${patchRes.error} — trying legacy inline tools`);
          const legacyTools = buildAvaToolsArray(SUPABASE_URL, SUPABASE_ANON_KEY);
          const legacyRes = await elFetch(apiKey, `/convai/agents/${agentId}`, {
            method: "PATCH",
            body: JSON.stringify({ conversation_config: { agent: { prompt: { tools: legacyTools } } } }),
          });
          if (!legacyRes.ok) {
            await broadcastSetup(admin, userId, { type: "setup_error", step: "attach_tools", error: patchRes.error });
            return json({ success: false, error: `Attache outils impossible: ${patchRes.error}`, status: patchRes.status, errors_detailed });
          }
        }

        await setConfig(admin, "tools_count", String(uniqIds.length), userId);
        await setConfig(admin, "tools_synced_at", new Date().toISOString(), userId);
        await broadcastSetup(admin, userId, { type: "setup_complete", agent_id: agentId, tools_count: uniqIds.length });
        return json({
          success: true,
          tools_synced: uniqIds.length,
          total_expected: desired.length,
          errors: errors.length ? errors : undefined,
          errors_detailed: errors_detailed.length ? errors_detailed : undefined,
          agent_id: agentId,
          message: `${uniqIds.length}/${desired.length} outils synchronisés${errors.length ? ` (${errors.length} erreur(s))` : ""}`,
        });
      }


      case "update_voice": {
        if (!agentId) return json({ success: false, error: "no_agent_configured" });
        const ts = payload?.tts_settings || {};
        const r = await elFetch(apiKey, `/convai/agents/${agentId}`, {
          method: "PATCH",
          body: JSON.stringify({
            conversation_config: {
              tts: {
                voice_id: payload.voice_id,
                model_id: "eleven_turbo_v2_5",
                stability: ts.stability ?? 0.6,
                similarity_boost: ts.similarity_boost ?? 0.8,
                style: ts.style ?? 0.3,
                use_speaker_boost: true,
                optimize_streaming_latency: 4,
              },
            },
          }),
        });
        if (!r.ok) return json({ success: false, error: r.error });
        await setConfig(admin, "voice_id", payload.voice_id, userId);
        return json({ success: true });
      }

      case "update_system_prompt": {
        if (!agentId) return json({ success: false, error: "no_agent_configured" });
        const r = await elFetch(apiKey, `/convai/agents/${agentId}`, {
          method: "PATCH",
          body: JSON.stringify({ conversation_config: { agent: { prompt: { prompt: payload.system_prompt } } } }),
        });
        if (!r.ok) return json({ success: false, error: r.error });
        return json({ success: true });
      }

      case "update_llm": {
        if (!agentId) return json({ success: false, error: "no_agent_configured" });
        const r = await elFetch(apiKey, `/convai/agents/${agentId}`, {
          method: "PATCH",
          body: JSON.stringify({ conversation_config: { agent: { prompt: { llm: payload.llm, temperature: payload.temperature, max_tokens: payload.max_tokens } } } }),
        });
        if (!r.ok) return json({ success: false, error: r.error });
        await setConfig(admin, "llm", payload.llm, userId);
        return json({ success: true });
      }

      case "get_agent_stats": {
        if (!agentId) return json({ success: false, error: "no_agent_configured" });
        const r = await elFetch(apiKey, `/convai/conversations?agent_id=${agentId}&page_size=100`);
        if (!r.ok) return json({ success: false, error: r.error });
        const conversations = r.data?.conversations ?? [];
        const total = conversations.length;
        const avgDuration = total ? conversations.reduce((s: number, c: any) => s + (c.call_duration_secs ?? 0), 0) / total : 0;
        const errors = conversations.filter((c: any) => c.status === "failed").length;
        return json({
          success: true,
          stats: {
            total_conversations: total,
            avg_duration_seconds: Math.round(avgDuration),
            error_rate: total ? Math.round((errors / total) * 100) : 0,
          },
        });
      }

      case "test_agent": {
        // ElevenLabs does not expose a simple /test endpoint — return a 501-style hint.
        return json({ success: false, error: "Tester via la session vocale dans l'app mobile (AVA)." });
      }

      case "delete_tool": {
        if (!agentId) return json({ success: false, error: "no_agent_configured" });
        const cur = await elFetch(apiKey, `/convai/agents/${agentId}`);
        if (!cur.ok) return json({ success: false, error: cur.error });
        const existing: any[] = cur.data?.conversation_config?.agent?.prompt?.tools ?? [];
        const filtered = existing.filter((t) => t.name !== payload?.tool_name);
        const r = await elFetch(apiKey, `/convai/agents/${agentId}`, {
          method: "PATCH",
          body: JSON.stringify({ conversation_config: { agent: { prompt: { tools: filtered } } } }),
        });
        if (!r.ok) return json({ success: false, error: r.error });
        return json({ success: true, remaining: filtered.length });
      }

      case "add_single_tool": {
        if (!agentId) return json({ success: false, error: "no_agent_configured" });
        const cur = await elFetch(apiKey, `/convai/agents/${agentId}`);
        if (!cur.ok) return json({ success: false, error: cur.error });
        const existing: any[] = cur.data?.conversation_config?.agent?.prompt?.tools ?? [];
        const next = [...existing, payload.tool];
        const r = await elFetch(apiKey, `/convai/agents/${agentId}`, {
          method: "PATCH",
          body: JSON.stringify({ conversation_config: { agent: { prompt: { tools: next } } } }),
        });
        if (!r.ok) return json({ success: false, error: r.error });
        return json({ success: true, count: next.length });
      }

      case "list_expected_tools": {
        const tools = buildAvaToolsArray(SUPABASE_URL, SUPABASE_ANON_KEY);
        return json({ success: true, tools: tools.map((t) => ({ name: t.name, description: t.description })) });
      }

      case "list_tools": {
        // Returns tools currently registered on the ElevenLabs workspace, so
        // the admin audit page can compare them against the expected registry.
        const listRes = await elFetch(apiKey, "/convai/tools");
        if (!listRes.ok) {
          return json({ success: false, error: listRes.error, status: listRes.status });
        }
        const { data: syncedRow } = await admin
          .from("planipret_elevenlabs_config")
          .select("value").eq("key", "tools_synced_at").maybeSingle();
        return json({
          success: true,
          tools: listRes.data?.tools ?? [],
          synced_at: syncedRow?.value ?? null,
        });
      }

      case "get_config": {
        const { data } = await admin.from("planipret_elevenlabs_config").select("key, value, updated_at");
        return json({ success: true, config: data ?? [] });
      }

      case "list_workspace_webhooks": {
        const wsRes = await elFetch(apiKey, "/workspace/webhooks?include_usages=true");
        const workspaceWebhooks = wsRes.ok ? (wsRes.data?.webhooks ?? []) : [];
        let agentWebhook: any = null;
        let agentTools: any[] = [];
        if (agentId) {
          const agRes = await elFetch(apiKey, `/convai/agents/${agentId}`);
          if (agRes.ok) {
            const ag = agRes.data;
            agentWebhook =
              ag?.platform_settings?.webhook ??
              ag?.conversation_config?.platform_settings?.webhook ??
              null;
            const inline: any[] = ag?.conversation_config?.agent?.prompt?.tools ?? [];
            const toolIds: string[] = ag?.conversation_config?.agent?.prompt?.tool_ids ?? [];
            agentTools = inline.map((t: any) => ({
              name: t?.name,
              type: t?.type ?? "webhook",
              url: t?.api_schema?.url ?? t?.webhook?.url ?? null,
              method: t?.api_schema?.method ?? "POST",
            }));
            if (agentTools.length === 0 && toolIds.length) {
              const reg = await elFetch(apiKey, "/convai/tools");
              if (reg.ok) {
                const all: any[] = reg.data?.tools ?? [];
                const idSet = new Set(toolIds);
                agentTools = all
                  .filter((t) => idSet.has(t?.id ?? t?.tool_id))
                  .map((t) => ({
                    name: t?.tool_config?.name ?? t?.name,
                    type: t?.tool_config?.type ?? "webhook",
                    url: t?.tool_config?.api_schema?.url ?? null,
                    method: t?.tool_config?.api_schema?.method ?? "POST",
                  }));
              }
            }
          }
        }
        return json({
          success: true,
          workspace_webhooks: workspaceWebhooks,
          agent_webhook: agentWebhook,
          agent_tool_webhooks: agentTools,
          agent_id: agentId,
        });
      }

      default:
        return json({ success: false, error: `unknown_action: ${action}` }, 400);
    }
  } catch (e) {
    return json({ success: false, error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
