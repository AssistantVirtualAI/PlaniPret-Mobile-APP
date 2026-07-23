// pp-admin-ava-elevenlabs — Aggregates ElevenLabs conversation stats + recordings
// for the Planiprêt AVA voice agent. Uses the shared ELEVENLABS_API_KEY.
// Admin-only (planipret_profiles.role = 'admin').
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ELEVENLABS_API_KEY = Deno.env.get("ELEVENLABS_API_KEY") ?? "";
const EL_BASE = "https://api.elevenlabs.io";

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), {
    status: s,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

async function requireAdmin(req: Request) {
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return { error: json({ error: "unauthorized" }, 401) };
  const anon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userRes } = await anon.auth.getUser(authHeader.slice(7));
  if (!userRes?.user) return { error: json({ error: "unauthorized" }, 401) };
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
  const { data: prof } = await admin
    .from("planipret_profiles")
    .select("role")
    .eq("user_id", userRes.user.id)
    .maybeSingle();
  if (prof?.role !== "admin") return { error: json({ error: "forbidden" }, 403) };
  return { admin, userId: userRes.user.id };
}

async function elFetch(path: string, init?: RequestInit) {
  return fetch(`${EL_BASE}${path}`, {
    ...init,
    headers: {
      "xi-api-key": ELEVENLABS_API_KEY,
      accept: "application/json",
      ...(init?.headers ?? {}),
    },
  });
}

/** List conversations for a single agent (with cursor). */
async function listConversationsForAgent(agentId: string, cursor?: string, pageSize = 100) {
  const qs = new URLSearchParams({ agent_id: agentId, page_size: String(pageSize) });
  if (cursor) qs.set("cursor", cursor);
  const res = await elFetch(`/v1/convai/conversations?${qs.toString()}`);
  if (!res.ok) return { conversations: [], has_more: false, next_cursor: null as string | null };
  const data = await res.json();
  return {
    conversations: data.conversations ?? [],
    has_more: !!data.has_more,
    next_cursor: data.next_cursor ?? null,
  };
}

/** Fetch up to `maxPages` for an agent. */
async function collectConversations(agentId: string, maxPages = 3, pageSize = 100) {
  let cursor: string | undefined;
  const out: any[] = [];
  for (let i = 0; i < maxPages; i++) {
    const { conversations, has_more, next_cursor } = await listConversationsForAgent(agentId, cursor, pageSize);
    out.push(...conversations);
    if (!has_more || !next_cursor) break;
    cursor = next_cursor;
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;
  const { admin } = auth;

  if (!ELEVENLABS_API_KEY) return json({ error: "elevenlabs_api_key_missing" }, 500);

  try {
    const url = new URL(req.url);
    const action = url.searchParams.get("action") ?? "overview";

    // ---------- AUDIO (proxy stream) ----------
    if (action === "audio") {
      const convId = url.searchParams.get("conversation_id");
      if (!convId) return json({ error: "missing conversation_id" }, 400);
      const res = await elFetch(`/v1/convai/conversations/${convId}/audio?format=mp3`);
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        return json({ error: "audio_unavailable", status: res.status, details: txt.slice(0, 200) }, 200);
      }
      const buf = await res.arrayBuffer();
      return new Response(buf, {
        headers: {
          ...corsHeaders,
          "Content-Type": "audio/mpeg",
          "Cache-Control": "private, max-age=60",
        },
      });
    }

    // ---------- CONVERSATION DETAILS (with transcript) ----------
    if (action === "details") {
      const convId = url.searchParams.get("conversation_id");
      if (!convId) return json({ error: "missing conversation_id" }, 400);
      const res = await elFetch(`/v1/convai/conversations/${convId}`);
      if (!res.ok) return json({ error: "not_found" }, res.status);
      return json(await res.json());
    }

    // Load broker → agent mapping (both actions below need it)
    const { data: profiles } = await admin
      .from("planipret_profiles")
      .select("user_id, full_name, extension, elevenlabs_agent_id, voice_agent_enabled")
      .not("elevenlabs_agent_id", "is", null);

    const brokers = (profiles ?? []).filter((p: any) => p.elevenlabs_agent_id);
    const agentIdToBroker = new Map<string, any>();
    for (const b of brokers) agentIdToBroker.set(b.elevenlabs_agent_id, b);

    // ---------- LIST (all conversations, paginated for UI) ----------
    if (action === "list") {
      const limit = Math.min(Number(url.searchParams.get("limit") ?? 50), 200);
      const filterAgent = url.searchParams.get("agent_id");
      const agentIds = filterAgent
        ? [filterAgent]
        : brokers.map((b: any) => b.elevenlabs_agent_id);

      const all: any[] = [];
      await Promise.all(
        agentIds.map(async (aid) => {
          const convs = await collectConversations(aid, 2, 100);
          for (const c of convs) {
            const broker = agentIdToBroker.get(aid);
            all.push({
              conversation_id: c.conversation_id,
              agent_id: aid,
              broker_name: broker?.full_name ?? null,
              broker_user_id: broker?.user_id ?? null,
              extension: broker?.extension ?? null,
              start_time: c.start_time_unix_secs
                ? new Date(c.start_time_unix_secs * 1000).toISOString()
                : c.start_time ?? c.created_at ?? null,
              duration_secs: c.call_duration_secs ?? c.duration ?? 0,
              status: c.status ?? "unknown",
              call_successful: c.call_successful ?? null,
              message_count: c.message_count ?? null,
            });
          }
        }),
      );

      all.sort((a, b) => {
        const ta = a.start_time ? new Date(a.start_time).getTime() : 0;
        const tb = b.start_time ? new Date(b.start_time).getTime() : 0;
        return tb - ta;
      });

      return json({
        conversations: all.slice(0, limit),
        total: all.length,
      });
    }

    // ---------- OVERVIEW (aggregate stats + per-agent) ----------
    // action === "overview"
    const timeframe = url.searchParams.get("timeframe") ?? "7d";
    const days = timeframe === "24h" ? 1 : timeframe === "30d" ? 30 : timeframe === "90d" ? 90 : 7;
    const cutoff = Date.now() - days * 24 * 3600e3;

    // Also probe account subscription
    const [subRes] = await Promise.all([
      elFetch("/v1/user/subscription"),
    ]);
    const subscription = subRes.ok ? await subRes.json() : null;

    // Fetch conversations for every mapped broker agent in parallel
    const perAgent = await Promise.all(
      brokers.map(async (b: any) => {
        const convs = await collectConversations(b.elevenlabs_agent_id, 2, 100);
        const inWindow = convs.filter((c: any) => {
          const t = c.start_time_unix_secs
            ? c.start_time_unix_secs * 1000
            : c.start_time ? new Date(c.start_time).getTime() : 0;
          return t >= cutoff;
        });
        const totalDuration = inWindow.reduce(
          (s: number, c: any) => s + (c.call_duration_secs ?? c.duration ?? 0),
          0,
        );
        const successful = inWindow.filter(
          (c: any) => c.call_successful === "success" || c.status === "done" || c.status === "completed",
        ).length;
        const lastCallTs = convs.length
          ? Math.max(
              ...convs.map((c: any) =>
                c.start_time_unix_secs
                  ? c.start_time_unix_secs * 1000
                  : c.start_time ? new Date(c.start_time).getTime() : 0,
              ),
            )
          : 0;
        return {
          agent_id: b.elevenlabs_agent_id,
          broker_name: b.full_name,
          broker_user_id: b.user_id,
          extension: b.extension,
          voice_agent_enabled: b.voice_agent_enabled,
          total_calls: inWindow.length,
          total_duration_secs: totalDuration,
          avg_duration_secs: inWindow.length ? Math.round(totalDuration / inWindow.length) : 0,
          successful_calls: successful,
          success_rate: inWindow.length ? Math.round((successful / inWindow.length) * 100) : 0,
          last_call_at: lastCallTs ? new Date(lastCallTs).toISOString() : null,
        };
      }),
    );

    const totals = perAgent.reduce(
      (acc, a) => {
        acc.total_calls += a.total_calls;
        acc.total_duration_secs += a.total_duration_secs;
        acc.successful_calls += a.successful_calls;
        return acc;
      },
      { total_calls: 0, total_duration_secs: 0, successful_calls: 0 },
    );

    return json({
      timeframe,
      subscription: subscription
        ? {
            tier: subscription.tier,
            character_count: subscription.character_count,
            character_limit: subscription.character_limit,
            status: subscription.status,
          }
        : null,
      totals: {
        ...totals,
        avg_duration_secs: totals.total_calls
          ? Math.round(totals.total_duration_secs / totals.total_calls)
          : 0,
        success_rate: totals.total_calls
          ? Math.round((totals.successful_calls / totals.total_calls) * 100)
          : 0,
        active_agents: perAgent.filter((a) => a.total_calls > 0).length,
        total_agents: perAgent.length,
      },
      per_agent: perAgent.sort((a, b) => b.total_calls - a.total_calls),
    });
  } catch (e) {
    console.error("pp-admin-ava-elevenlabs", e);
    return json({ error: (e as Error).message }, 500);
  }
});
