import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const userClient = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: authHeader } } });
    const token = authHeader.replace("Bearer ", "");
    const { data: claims, error: authError } = await userClient.auth.getClaims(token);
    if (authError || !claims?.claims?.sub) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const userId = claims.claims.sub as string;

    const { organizationId, days = 7 } = await req.json();
    if (!organizationId) return new Response(JSON.stringify({ error: "organizationId required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { data: member } = await admin
      .from("organization_members")
      .select("id")
      .eq("user_id", userId)
      .eq("organization_id", organizationId)
      .maybeSingle();
    if (!member) {
      const { data: isSa } = await admin.rpc("is_super_admin", { _user_id: userId });
      if (!isSa) return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const from = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    const { data: calls = [] } = await admin
      .from("pbx_call_records")
      .select("id, direction, duration_seconds, missed_call, start_at")
      .eq("organization_id", organizationId)
      .gte("start_at", from)
      .limit(2000);
    const { data: insights = [] } = await admin
      .from("pbx_ai_insights")
      .select("summary, sentiment, intent, topics, action_items, risks, sales_opportunities")
      .eq("organization_id", organizationId)
      .gte("created_at", from)
      .limit(500);

    const totalCalls = calls?.length ?? 0;
    const inbound = calls?.filter((c: any) => c.direction === "inbound").length ?? 0;
    const outbound = calls?.filter((c: any) => c.direction === "outbound").length ?? 0;
    const missed = calls?.filter((c: any) => c.missed_call).length ?? 0;
    const avgDur = totalCalls ? Math.round((calls?.reduce((s: number, c: any) => s + (c.duration_seconds || 0), 0) ?? 0) / totalCalls) : 0;

    const topicMap = new Map<string, number>();
    insights?.forEach((i: any) => (i.topics ?? []).forEach((t: string) => topicMap.set(t, (topicMap.get(t) || 0) + 1)));
    const topTopics = Array.from(topicMap.entries()).sort((a, b) => b[1] - a[1]).slice(0, 10);

    const sentiments = {
      positive: insights?.filter((i: any) => i.sentiment === "positive").length ?? 0,
      neutral: insights?.filter((i: any) => i.sentiment === "neutral").length ?? 0,
      negative: insights?.filter((i: any) => i.sentiment === "negative").length ?? 0,
    };

    const aggregate = {
      days, totalCalls, inbound, outbound, missed, avgDurSec: avgDur,
      topTopics, sentiments,
      sampleSummaries: insights?.slice(0, 15).map((i: any) => i.summary).filter(Boolean) ?? [],
    };

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: "You are a senior call-center operations analyst. Produce a crisp narrative + bullet recommendations in the same language as the summaries." },
          { role: "user", content: `Analyze the last ${days} days for this PBX workspace and produce: an executive narrative (3-4 sentences), 3-5 key observations, 3-5 prioritized recommendations.\n\nDATA:\n${JSON.stringify(aggregate)}` },
        ],
      }),
    });

    if (aiRes.status === 429) return new Response(JSON.stringify({ error: "Rate limited" }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    if (aiRes.status === 402) return new Response(JSON.stringify({ error: "AI credits exhausted" }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    if (!aiRes.ok) {
      const t = await aiRes.text();
      console.error("AI error", aiRes.status, t);
      return new Response(JSON.stringify({ error: "AI gateway error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const aiJson = await aiRes.json();
    const narrative = aiJson.choices?.[0]?.message?.content ?? "";

    return new Response(JSON.stringify({ aggregate, narrative }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
