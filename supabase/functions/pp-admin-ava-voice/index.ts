// pp-admin-ava-voice — Admin dashboard for the ElevenLabs voice agent.
// Returns: ElevenLabs account health, per-broker agent status, live sessions,
// recent errors. All access requires an admin role in planipret_profiles.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ELEVENLABS_API_KEY = Deno.env.get("ELEVENLABS_API_KEY") ?? "";

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

async function elevenlabsAccount() {
  if (!ELEVENLABS_API_KEY) return { ok: false, error: "no_api_key" };
  try {
    const [subRes, agentsRes] = await Promise.all([
      fetch("https://api.elevenlabs.io/v1/user/subscription", {
        headers: { "xi-api-key": ELEVENLABS_API_KEY },
      }),
      fetch("https://api.elevenlabs.io/v1/convai/agents?page_size=100", {
        headers: { "xi-api-key": ELEVENLABS_API_KEY },
      }),
    ]);
    const sub = subRes.ok ? await subRes.json() : null;
    const agents = agentsRes.ok ? await agentsRes.json() : null;
    return {
      ok: subRes.ok,
      status: subRes.status,
      subscription: sub ? {
        tier: sub.tier,
        character_count: sub.character_count,
        character_limit: sub.character_limit,
        next_character_count_reset_unix: sub.next_character_count_reset_unix,
        status: sub.status,
      } : null,
      agents_count: agents?.agents?.length ?? 0,
      agents_list: (agents?.agents ?? []).map((a: any) => ({
        agent_id: a.agent_id, name: a.name, tags: a.tags,
      })).slice(0, 50),
    };
  } catch (e) {
    return { ok: false, error: String((e as Error).message ?? e) };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;
  const { admin } = auth;

  try {
    const url = new URL(req.url);
    const action = url.searchParams.get("action") ?? "dashboard";

    if (action === "sessions") {
      const limit = Math.min(Number(url.searchParams.get("limit") ?? 50), 200);
      const { data, error } = await admin
        .from("planipret_ava_sessions")
        .select("id, user_id, session_id, connection_type, agent_id, started_at, ended_at, duration_ms, disconnect_reason, error_code, error_message")
        .order("started_at", { ascending: false })
        .limit(limit);
      if (error) return json({ error: error.message }, 500);
      // Enrich with broker names
      const userIds = [...new Set((data ?? []).map((s: any) => s.user_id))];
      const { data: profs } = await admin
        .from("planipret_profiles")
        .select("user_id, full_name, extension")
        .in("user_id", userIds.length ? userIds : ["00000000-0000-0000-0000-000000000000"]);
      const byUser = new Map((profs ?? []).map((p: any) => [p.user_id, p]));
      return json({
        sessions: (data ?? []).map((s: any) => ({
          ...s,
          broker: byUser.get(s.user_id) ?? null,
        })),
      });
    }

    // Default: dashboard
    const since24h = new Date(Date.now() - 24 * 3600e3).toISOString();
    const since7d = new Date(Date.now() - 7 * 24 * 3600e3).toISOString();

    const [account, brokersRes, liveRes, err24Res, sess7dRes] = await Promise.all([
      elevenlabsAccount(),
      admin.from("planipret_profiles")
        .select("user_id, full_name, extension, elevenlabs_agent_id, voice_agent_enabled, ava_last_session_at, ava_sessions_count")
        .order("full_name", { ascending: true }),
      admin.from("planipret_ava_sessions")
        .select("id, user_id, session_id, connection_type, started_at", { count: "exact" })
        .is("ended_at", null)
        .gte("started_at", new Date(Date.now() - 15 * 60e3).toISOString()),
      admin.from("planipret_ava_sessions")
        .select("user_id, error_code, error_message, disconnect_reason, started_at")
        .gte("started_at", since24h)
        .not("error_code", "is", null)
        .order("started_at", { ascending: false })
        .limit(50),
      admin.from("planipret_ava_sessions")
        .select("user_id, duration_ms, error_code")
        .gte("started_at", since7d),
    ]);

    // Per-broker aggregates
    const brokers = (brokersRes.data ?? []).filter((b: any) => b.user_id);
    const sess7d = sess7dRes.data ?? [];
    const err24 = err24Res.data ?? [];
    const agg = new Map<string, { sessions_7d: number; errors_24h: number; last_error: string | null }>();
    for (const b of brokers) agg.set(b.user_id, { sessions_7d: 0, errors_24h: 0, last_error: null });
    for (const s of sess7d) {
      const a = agg.get(s.user_id); if (a) a.sessions_7d++;
    }
    for (const e of err24) {
      const a = agg.get(e.user_id);
      if (a) { a.errors_24h++; if (!a.last_error) a.last_error = e.error_code ?? e.disconnect_reason ?? "unknown"; }
    }

    // Top error reasons (last 24h)
    const errorCounts = new Map<string, number>();
    for (const e of err24) {
      const k = e.error_code ?? e.disconnect_reason ?? "unknown";
      errorCounts.set(k, (errorCounts.get(k) ?? 0) + 1);
    }
    const top_errors = Array.from(errorCounts.entries())
      .sort((a, b) => b[1] - a[1]).slice(0, 5)
      .map(([reason, count]) => ({ reason, count }));

    return json({
      account,
      live_sessions: liveRes.count ?? liveRes.data?.length ?? 0,
      live_sessions_detail: liveRes.data ?? [],
      total_brokers: brokers.length,
      brokers_with_agent: brokers.filter((b: any) => b.elevenlabs_agent_id).length,
      brokers_enabled: brokers.filter((b: any) => b.voice_agent_enabled).length,
      sessions_24h_total: sess7d.filter((s: any) => new Date(s.started_at ?? 0).getTime() > Date.now() - 24 * 3600e3).length + err24.length,
      errors_24h: err24.length,
      top_errors,
      brokers: brokers.map((b: any) => ({
        ...b,
        ...(agg.get(b.user_id) ?? { sessions_7d: 0, errors_24h: 0, last_error: null }),
      })),
    });
  } catch (e) {
    console.error("pp-admin-ava-voice", e);
    return json({ error: (e as Error).message }, 500);
  }
});
