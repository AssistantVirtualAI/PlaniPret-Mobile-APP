import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const SYSTEM_PROMPT = `You are AVA, an AI telecom admin assistant.
Translate the admin's request into ONE structured action proposal.

Return ONLY valid JSON with this shape:
{
  "interpreted_action": "short verb phrase, e.g. 'Create holiday schedule'",
  "changes": {
    "table": "business_hour_schedules" | "holiday_schedules" | "pbx_extensions" | "pbx_ivrs" | "pbx_call_queues" | "phone_numbers" | "info",
    "operation": "insert" | "update" | "delete" | "info",
    "row": { ... fields to insert/update ... },
    "where": { ... filter for update/delete ... },
    "human_summary": "1 sentence explanation of what will change"
  }
}

If the request is read-only (e.g. "show me stats"), use table="info" and put the answer in human_summary.
Never invent organization_id — leave it out; it is injected server-side.
For business_hour_schedules, use fields: name, timezone, schedule_json (object keyed by day_of_week 0-6 with start_time, end_time, is_open).
For holiday_schedules: name, start_date (YYYY-MM-DD), end_date, greeting_text, routing_action ('voicemail'|'forward'|'play_greeting'), routing_target.
If unsure or unsafe, return table="info" explaining what details are missing.`;

async function llmPropose(prompt: string): Promise<any> {
  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey) throw new Error("LOVABLE_API_KEY not configured");
  const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" },
    }),
  });
  if (!r.ok) {
    const t = await r.text();
    if (r.status === 429) throw new Error("ai_rate_limited");
    if (r.status === 402) throw new Error("ai_credits_exhausted");
    throw new Error(`ai_failed: ${t.slice(0, 200)}`);
  }
  const j = await r.json();
  const content = j.choices?.[0]?.message?.content ?? "{}";
  try { return JSON.parse(content); } catch { return { interpreted_action: "info", changes: { table: "info", operation: "info", human_summary: content } }; }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const auth = req.headers.get("Authorization") ?? "";
    const token = auth.replace(/^Bearer\s+/i, "");
    if (!token) return json({ error: "missing_auth" }, 401);

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: `Bearer ${token}` } } });
    const { data: userRes } = await userClient.auth.getUser();
    if (!userRes?.user) return json({ error: "invalid_auth" }, 401);
    const userId = userRes.user.id;

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    const body = await req.json().catch(() => ({}));
    const mode = body?.mode;

    // Resolve org: prefer body.organization_id if user has access; else first role/membership
    let orgId: string | null = body?.organization_id ?? null;
    const { data: isSuperData } = await admin.rpc("is_super_admin", { _user_id: userId });
    const isSuper = !!isSuperData;
    if (!orgId) {
      // Try roles / memberships for any user (including super_admin) before failing
      const { data: roles } = await admin.from("user_roles")
        .select("organization_id").eq("user_id", userId).limit(1);
      orgId = roles?.[0]?.organization_id ?? null;
      if (!orgId) {
        const { data: mem } = await admin.from("organization_members")
          .select("organization_id").eq("user_id", userId).limit(1);
        orgId = mem?.[0]?.organization_id ?? null;
      }
      if (!orgId && isSuper) {
        // super_admin fallback: Lemtel default org
        orgId = "71755d33-ed64-4ad5-a828-61c9d2029eb7";
      }
    } else if (!isSuper) {
      const { data: roles } = await admin.from("user_roles")
        .select("organization_id").eq("user_id", userId).eq("organization_id", orgId).limit(1);
      if (!roles?.length) {
        const { data: mem } = await admin.from("organization_members")
          .select("organization_id").eq("user_id", userId).eq("organization_id", orgId).limit(1);
        if (!mem?.length) orgId = null;
      }
    }
    if (!orgId) return json({ error: "no_org_access" }, 403);

    // Chat mode (default when messages array present without explicit mode)
    const messages = body?.messages;
    if (!mode && Array.isArray(messages) && messages.length) {
      const apiKey = Deno.env.get("LOVABLE_API_KEY");
      if (!apiKey) return json({ error: "ai_not_configured" }, 500);

      // Determine if the user is allowed to auto-execute (super_admin or org_admin)
      let canExecute = isSuper;
      if (!canExecute) {
        const { data: hasOrgAdmin } = await admin.rpc("has_role", { _user_id: userId, _org_id: orgId, _role: "org_admin" });
        canExecute = !!hasOrgAdmin;
      }
      if (!canExecute) {
        const { data: isLemAdmin } = await admin.rpc("is_lemtel_admin", { _user_id: userId });
        canExecute = !!isLemAdmin;
      }

      const [callsRes, extRes, queuesRes, ivrsRes, vmRes, smsRes, usersRes, insightsRes, recRes, ringRes, gwRes] = await Promise.all([
        admin.from("pbx_call_records")
          .select("start_at,direction,caller_number,destination_number,duration_seconds,call_status,missed_call,extension")
          .eq("organization_id", orgId).order("start_at", { ascending: false }).limit(100),
        admin.from("pbx_extensions").select("extension,effective_cid_name,enabled,voicemail_enabled").eq("organization_id", orgId),
        admin.from("pbx_call_queues").select("name,strategy,extension").eq("organization_id", orgId),
        admin.from("pbx_ivrs").select("name,extension").eq("organization_id", orgId),
        admin.from("pbx_voicemails").select("extension,read_at,created_at").eq("organization_id", orgId).order("created_at", { ascending: false }).limit(50),
        admin.from("pbx_sms_threads").select("id,last_message_at,unread_count").eq("organization_id", orgId).order("last_message_at", { ascending: false }).limit(20),
        admin.from("pbx_softphone_users").select("extension,display_name,status,cc_role").eq("organization_id", orgId),
        admin.from("pbx_ai_insights").select("summary,sentiment,intent,topics,action_items,severity,created_at").eq("organization_id", orgId).order("created_at", { ascending: false }).limit(20),
        admin.from("pbx_call_records").select("id", { count: "exact", head: true }).eq("organization_id", orgId).eq("has_recording", true),
        admin.from("pbx_ring_groups").select("name,extension,strategy").eq("organization_id", orgId),
        admin.from("pbx_gateways").select("gateway_name,proxy,enabled").eq("organization_id", orgId),
      ]);
      const calls = callsRes.data ?? [];
      const ctx = calls.map((c: any) =>
        `${c.start_at} ${c.direction} ${c.caller_number ?? "?"}->${c.destination_number ?? "?"} ${c.duration_seconds ?? 0}s ${c.call_status ?? ""}${c.missed_call ? " MISSED" : ""}`
      ).join("\n");
      const sysContext = [
        `Recent 100 calls:\n${ctx || "(none)"}`,
        `Users (${(usersRes.data ?? []).length}): ${JSON.stringify(usersRes.data ?? [])}`,
        `Extensions (${(extRes.data ?? []).length}): ${JSON.stringify(extRes.data ?? [])}`,
        `Call Queues (${(queuesRes.data ?? []).length}): ${JSON.stringify(queuesRes.data ?? [])}`,
        `Ring Groups (${(ringRes.data ?? []).length}): ${JSON.stringify(ringRes.data ?? [])}`,
        `IVRs (${(ivrsRes.data ?? []).length}): ${JSON.stringify(ivrsRes.data ?? [])}`,
        `Gateways (${(gwRes.data ?? []).length}): ${JSON.stringify(gwRes.data ?? [])}`,
        `Voicemails (${(vmRes.data ?? []).length}, unread=${(vmRes.data ?? []).filter((v:any)=>!v.read_at).length})`,
        `SMS threads (${(smsRes.data ?? []).length})`,
        `Recordings total: ${recRes.count ?? 0}`,
        `Recent AI insights (${(insightsRes.data ?? []).length}): ${JSON.stringify(insightsRes.data ?? [])}`,
      ].join("\n\n");
      const flatMessages = messages.map((m: any) => ({
        role: m.role,
        content: typeof m.content === "string"
          ? m.content
          : (Array.isArray(m.parts) ? m.parts.map((p: any) => p?.text ?? "").join("") : ""),
      }));

      const sysPrompt = canExecute
        ? `You are AVA, a telecom assistant for AVA Statistic. The user is an ADMIN and you can EXECUTE changes directly. Respond ONLY with valid JSON of the shape:
{
  "answer": "short reply in user's language",
  "action": null | { "table": "pbx_extensions"|"pbx_call_queues"|"pbx_ivrs"|"pbx_ring_groups"|"business_hour_schedules"|"holiday_schedules"|"pbx_call_forwarding"|"pbx_voicemail_settings", "operation": "insert"|"update"|"delete", "row": {...}, "where": {...} }
}
Rules: NEVER include organization_id (added server-side). For destructive deletes set "action": null and ask for explicit confirmation in "answer". If unclear, set "action": null and ask a clarifying question. For pure questions, set "action": null and put the answer in "answer". DATA:\n\n${sysContext}`
        : `You are AVA, a helpful telecom assistant for AVA Statistic. The user is NOT an admin — never claim to have made changes. Answer concisely in the user's language using the data below.\n\n${sysContext}`;

      const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [{ role: "system", content: sysPrompt }, ...flatMessages],
          ...(canExecute ? { response_format: { type: "json_object" } } : {}),
        }),
      });
      if (!r.ok) {
        const t = await r.text();
        if (r.status === 429) return json({ response: "AI rate limit exceeded. Please retry shortly." });
        if (r.status === 402) return json({ response: "AI credits exhausted. Please add credits to continue." });
        return json({ error: "ai_failed", detail: t.slice(0, 300) }, 500);
      }
      const j = await r.json();
      const raw = j.choices?.[0]?.message?.content ?? "";

      if (!canExecute) return json({ response: raw });

      // Parse JSON & execute action if present
      let parsed: any = {};
      try { parsed = JSON.parse(raw); } catch { return json({ response: raw }); }
      const answer = parsed.answer ?? "";
      const action = parsed.action;
      if (!action || !action.operation || !action.table) return json({ response: answer || "(no response)" });

      const allowed = new Set([
        "business_hour_schedules", "holiday_schedules",
        "pbx_extensions", "pbx_call_queues", "pbx_ivrs", "pbx_ring_groups",
        "pbx_call_forwarding", "pbx_voicemail_settings",
      ]);
      if (!allowed.has(action.table)) {
        return json({ response: `${answer}\n\n⚠ Cannot modify ${action.table}.` });
      }

      let execResult: any = null;
      let execError: string | null = null;
      try {
        if (action.operation === "insert") {
          const row = { ...(action.row || {}), organization_id: orgId };
          const { data, error } = await admin.from(action.table).insert(row).select("*").single();
          if (error) throw error;
          execResult = data;
        } else if (action.operation === "update") {
          const where = { ...(action.where || {}), organization_id: orgId };
          let q = admin.from(action.table).update(action.row || {});
          for (const [k, v] of Object.entries(where)) q = q.eq(k, v as any);
          const { data, error } = await q.select("*");
          if (error) throw error;
          execResult = data;
        } else if (action.operation === "delete") {
          const where = { ...(action.where || {}), organization_id: orgId };
          let q = admin.from(action.table).delete();
          for (const [k, v] of Object.entries(where)) q = q.eq(k, v as any);
          const { data, error } = await q.select("*");
          if (error) throw error;
          execResult = data;
        }
      } catch (e: any) {
        execError = e?.message || String(e);
      }

      await admin.from("audit_logs").insert({
        organization_id: orgId, user_id: userId,
        action: `ai_admin.${action.operation}`,
        resource_type: action.table,
        metadata: { source: "ai_admin_chat_auto", action, result: execResult, error: execError },
      });

      const successMsg = execError
        ? `${answer}\n\n❌ Execution failed: ${execError}`
        : `${answer}\n\n✅ Done — ${action.operation} on ${action.table} executed.`;
      return json({ response: successMsg, executed: !execError, action, result: execResult });
    }




    if (mode === "propose") {
      const prompt = (body?.prompt as string ?? "").trim();
      if (!prompt) return json({ error: "missing_prompt" }, 400);
      const proposal = await llmPropose(prompt);

      const { data: row, error } = await admin.from("telecom_admin_ai_actions").insert({
        organization_id: orgId,
        admin_user_id: userId,
        prompt,
        interpreted_action: proposal.interpreted_action ?? null,
        proposed_changes_json: proposal.changes ?? {},
        confirmation_status: proposal.changes?.operation === "info" ? "confirmed" : "pending",
        execution_status: proposal.changes?.operation === "info" ? "success" : "pending",
        execution_result_json: proposal.changes?.operation === "info" ? { info: proposal.changes?.human_summary } : null,
        source: "desktop_app",
      }).select("*").single();
      if (error) return json({ error: "insert_failed", detail: error.message }, 500);
      return json({ action: row });
    }

    if (mode === "execute") {
      const actionId = body?.action_id;
      if (!actionId) return json({ error: "missing_action_id" }, 400);

      const { data: action, error: fetchErr } = await admin.from("telecom_admin_ai_actions")
        .select("*").eq("id", actionId).eq("admin_user_id", userId).maybeSingle();
      if (fetchErr || !action) return json({ error: "action_not_found" }, 404);
      if (action.confirmation_status !== "pending") return json({ error: "already_processed" }, 400);

      const ch = action.proposed_changes_json ?? {};
      let result: any = null;
      let execStatus: "success" | "failed" = "success";

      try {
        const allowed = new Set([
          "business_hour_schedules",
          "holiday_schedules",
          "pbx_extensions",
          "pbx_call_queues",
          "pbx_ivrs",
          "pbx_ring_groups",
          "pbx_call_forwarding",
          "pbx_voicemail_settings",
        ]);
        if (ch.operation === "insert" && allowed.has(ch.table)) {
          const row = { ...ch.row, organization_id: orgId };
          const { data, error } = await admin.from(ch.table).insert(row).select("*").single();
          if (error) throw error;
          result = data;
        } else if (ch.operation === "update" && allowed.has(ch.table)) {
          const where = { ...ch.where, organization_id: orgId };
          let q = admin.from(ch.table).update(ch.row);
          for (const [k, v] of Object.entries(where)) q = q.eq(k, v as any);
          const { data, error } = await q.select("*");
          if (error) throw error;
          result = data;
        } else if (ch.operation === "delete" && allowed.has(ch.table)) {
          const where = { ...ch.where, organization_id: orgId };
          let q = admin.from(ch.table).delete();
          for (const [k, v] of Object.entries(where)) q = q.eq(k, v as any);
          const { data, error } = await q.select("*");
          if (error) throw error;
          result = data;
        } else {
          result = { skipped: "operation_or_table_not_whitelisted", changes: ch };
        }
      } catch (e) {
        execStatus = "failed";
        result = { error: e instanceof Error ? e.message : String(e) };
      }

      const { data: updated } = await admin.from("telecom_admin_ai_actions").update({
        confirmation_status: "confirmed",
        execution_status: execStatus,
        execution_result_json: result,
        executed_at: new Date().toISOString(),
      }).eq("id", actionId).select("*").single();

      await admin.from("audit_logs").insert({
        organization_id: orgId,
        user_id: userId,
        action: `ai_admin.${ch.operation ?? "unknown"}`,
        resource_type: ch.table ?? "unknown",
        metadata: { source: "ai_admin_chat", proposed: ch, result },
      });

      return json({ action: updated });
    }

    return json({ error: "unknown_mode" }, 400);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return json({ error: "internal", detail: msg }, 500);
  }
});
