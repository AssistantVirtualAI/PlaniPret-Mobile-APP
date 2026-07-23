// ava-tool-logs — Admin view of AVA tool executions across all brokers.
// Supports pagination and search by email, phone, and tool/execution/session id.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const auth = req.headers.get("Authorization") ?? "";
    if (!auth.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    const { data: userData } = await admin.auth.getUser(auth.replace(/^Bearer\s+/i, ""));
    const user = userData?.user;
    if (!user) return json({ error: "Unauthorized" }, 401);

    const { data: isAdmin } = await admin.rpc("is_planipret_admin", { _user_id: user.id });
    if (!isAdmin) return json({ error: "forbidden" }, 403);

    const url = new URL(req.url);
    const page = Math.max(1, Number(url.searchParams.get("page") ?? 1));
    const pageSize = Math.min(200, Math.max(10, Number(url.searchParams.get("page_size") ?? 50)));
    const toolFilter = url.searchParams.get("tool") ?? null;
    const statusFilter = url.searchParams.get("status") ?? null;
    const brokerFilter = url.searchParams.get("user_id") ?? null;
    const since = url.searchParams.get("since");
    const qEmail = (url.searchParams.get("q_email") ?? "").trim().toLowerCase();
    const qPhone = (url.searchParams.get("q_phone") ?? "").trim().replace(/[^\d+]/g, "");
    const qId = (url.searchParams.get("q_id") ?? "").trim();

    // Resolve broker user_ids matching the email search first (so we can filter DB-side).
    let emailUserIds: string[] | null = null;
    if (qEmail) {
      const { data: profs } = await admin
        .from("planipret_profiles")
        .select("user_id, email")
        .ilike("email", `%${qEmail}%`)
        .limit(500);
      emailUserIds = (profs ?? []).map((p: any) => p.user_id);
      if (emailUserIds.length === 0) {
        return json({ success: true, logs: [], total: 0, page, page_size: pageSize, stats: { total: 0, success: 0, error: 0, by_tool: {}, by_category: {} } });
      }
    }

    // Build base query. We fetch a working window (up to 1000 rows) then apply
    // JSON search filters (phone / id) in memory, followed by pagination.
    let q = admin.from("planipret_ava_conversations")
      .select("id, user_id, session_id, tool_name, tool_params, tool_result, created_at", { count: "exact" })
      .eq("role", "tool")
      .order("created_at", { ascending: false });

    if (toolFilter) q = q.eq("tool_name", toolFilter);
    if (brokerFilter) q = q.eq("user_id", brokerFilter);
    if (emailUserIds) q = q.in("user_id", emailUserIds);
    if (since) q = q.gte("created_at", since);

    // If ID search matches uuid-ish format, filter DB-side on id/session_id.
    if (qId) {
      q = q.or(`id.eq.${qId},session_id.eq.${qId}`);
    }

    // Pull a working window large enough to filter+paginate in memory.
    const workingLimit = qPhone || statusFilter ? 1000 : pageSize * page + pageSize;
    q = q.limit(workingLimit);

    const { data: rows, error } = await q;
    if (error) return json({ error: error.message }, 500);

    const userIds = Array.from(new Set((rows ?? []).map((r: any) => r.user_id).filter(Boolean)));
    const { data: profiles } = await admin.from("planipret_profiles")
      .select("user_id, full_name, email").in("user_id", userIds);
    const nameMap = new Map((profiles ?? []).map((p: any) => [p.user_id, p]));

    let logs = (rows ?? []).map((r: any) => {
      const p = nameMap.get(r.user_id);
      const result = r.tool_result ?? {};
      const success = result?.success === true;
      return {
        id: r.id,
        created_at: r.created_at,
        session_id: r.session_id,
        tool_name: r.tool_name,
        user_id: r.user_id,
        broker_name: p?.full_name ?? "—",
        broker_email: p?.email ?? null,
        status: success ? "success" : (result?.error ? "error" : "info"),
        error: result?.error ?? null,
        message: result?.message ?? null,
        params: r.tool_params ?? {},
        result,
      };
    });

    if (statusFilter) logs = logs.filter((l) => l.status === statusFilter);

    if (qPhone) {
      const needle = qPhone.replace(/^\+/, "");
      logs = logs.filter((l) => {
        const hay = JSON.stringify({ p: l.params, r: l.result }).replace(/[^\d+]/g, "");
        return hay.includes(needle);
      });
    }

    const total = logs.length;
    const startIdx = (page - 1) * pageSize;
    const pageLogs = logs.slice(startIdx, startIdx + pageSize);

    const category = (name: string) => {
      if (/call|hangup|transcript|recording|voicemail|sms/i.test(name)) return "telephony";
      if (/email|calendar|meeting/i.test(name)) return "email_calendar";
      if (/client|task|appointment|maestro/i.test(name)) return "crm";
      return "other";
    };
    const stats = { total, success: 0, error: 0, by_tool: {} as Record<string, number>, by_category: {} as Record<string, number> };
    for (const l of logs) {
      if (l.status === "success") stats.success++;
      if (l.status === "error") stats.error++;
      stats.by_tool[l.tool_name] = (stats.by_tool[l.tool_name] ?? 0) + 1;
      const c = category(l.tool_name);
      stats.by_category[c] = (stats.by_category[c] ?? 0) + 1;
    }

    return json({ success: true, logs: pageLogs, total, page, page_size: pageSize, stats });
  } catch (e: any) {
    return json({ error: e?.message ?? "server_error" }, 500);
  }
});
