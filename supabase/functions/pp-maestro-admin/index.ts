// pp-maestro-admin — admin-only Maestro Telecom oversight.
//
// POST body { action, ...params }
//
// Actions:
//   status     → { configured, base_url, ping_ok, ping_status, ping_ms, stats24h }
//   sync-log   → { entries: [...], total } (params: limit=50, since_hours=24, only_failures=false)
//   stats      → aggregate success rate/actions over N hours (params: hours=24)

import { corsHeaders, jsonResponse } from "../_shared/planipret-ns.ts";
import { requirePlanipretAdmin } from "../_shared/ns-broker.ts";
import {
  getMaestroTelecomConfig,
  isMaestroTelecomConfigured,
  pingMaestroTelecom,
  mirrorCallAnalysisToMaestro,
} from "../_shared/maestro-telecom.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "method_not_allowed" }, 405);

  const guard = await requirePlanipretAdmin(req);
  if ("error" in guard) return guard.error;

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const body = await req.json().catch(() => ({} as any));
  const action = String(body?.action ?? "status");

  try {
    if (action === "status") {
      const cfg = await getMaestroTelecomConfig(admin);
      const configured = isMaestroTelecomConfigured(cfg);
      const meMaestroId = (guard as any).profile?.maestro_broker_id ?? null;
      const ping = configured
        ? await pingMaestroTelecom(admin, meMaestroId)
        : { configured: false, base_url: cfg.url || "", ok: false, status: 0, error: "not_configured" };

      const since = new Date(Date.now() - 24 * 3600_000).toISOString();
      const { data: recent } = await admin
        .from("planipret_maestro_sync_log")
        .select("success, action, response_status, created_at")
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(500);
      const rows = recent ?? [];
      const total = rows.length;
      const failed = rows.filter((r: any) => !r.success).length;
      const lastCall = rows.find((r: any) => String(r.action ?? "").startsWith("call.") && !String(r.action ?? "").startsWith("call.analysis"));
      const lastSms = rows.find((r: any) => String(r.action ?? "").startsWith("sms."));
      const lastAnalysis = rows.find((r: any) => String(r.action ?? "").startsWith("call.analysis"));

      return jsonResponse({
        ok: true,
        configured,
        base_url: cfg.url,
        ping,
        stats24h: {
          total,
          failed,
          success_rate: total ? Math.round(((total - failed) / total) * 100) : null,
        },
        last_call_mirror: lastCall ?? null,
        last_sms_mirror: lastSms ?? null,
        last_analysis_mirror: lastAnalysis ?? null,
      });
    }

    if (action === "resync-analysis") {
      const limit = Math.min(500, Math.max(1, Number(body.limit ?? 100)));
      const sinceHours = Math.max(1, Number(body.since_hours ?? 72));
      const since = new Date(Date.now() - sinceHours * 3600_000).toISOString();
      let q = admin
        .from("planipret_phone_calls")
        .select("id, user_id, organization_id, maestro_call_id, maestro_client_id, transcript_language, ai_summary, ai_summary_short, ai_analysis_json, ai_topics, ai_coaching, next_actions, coaching_score, lead_score, lead_temperature, lead_score_reason, analyzed_at, metadata")
        .not("ai_analysis_json", "is", null)
        .not("maestro_call_id", "is", null)
        .order("analyzed_at", { ascending: false })
        .limit(limit);
      if (body.call_id) q = q.eq("id", String(body.call_id));
      else q = q.gte("analyzed_at", since);
      const { data: calls, error } = await q;
      if (error) return jsonResponse({ error: error.message }, 500);
      let scheduled = 0;
      for (const c of calls ?? []) {
        const analysis = (c as any).ai_analysis_json ?? {};
        const meta = ((c as any).metadata ?? {}) as Record<string, any>;
        mirrorCallAnalysisToMaestro(admin, (c as any).user_id, c as any, analysis, {
          ai_summary: (c as any).ai_summary ?? analysis?.summary?.detailed ?? null,
          ai_summary_short: (c as any).ai_summary_short ?? analysis?.summary?.short ?? null,
          coaching_message: meta.ai_coaching ?? analysis?.coaching?.coaching_message ?? null,
          next_actions: (c as any).next_actions ?? analysis?.summary?.next_steps ?? [],
          topics: (c as any).ai_topics ?? analysis?.lead_analysis?.buying_signals ?? [],
          sentiment: (c as any).lead_temperature === "hot" ? "positive" : (c as any).lead_temperature === "cold" ? "negative" : "neutral",
          lead_score: (c as any).lead_score ?? null,
          lead_temperature: (c as any).lead_temperature ?? null,
          lead_reason: (c as any).lead_score_reason ?? null,
          model: analysis?.model ?? null,
        });
        scheduled += 1;
      }
      return jsonResponse({ ok: true, scheduled, since_hours: sinceHours });
    }

    if (action === "mirror-all") {
      // Push EVERY call with an AI summary or analysis (from the beginning of time)
      // to Maestro. Batched to avoid timeouts.
      const batchSize = Math.min(500, Math.max(50, Number(body.batch_size ?? 200)));
      const maxBatches = Math.min(50, Math.max(1, Number(body.max_batches ?? 20)));
      let scheduled = 0;
      let skippedNoBroker = 0;
      let skippedNoMaestroId = 0;
      let cursor: string | null = body.cursor ? String(body.cursor) : null;
      let lastAt: string | null = null;

      for (let i = 0; i < maxBatches; i++) {
        let q = admin
          .from("planipret_phone_calls")
          .select("id, user_id, organization_id, maestro_call_id, maestro_client_id, transcript_language, ai_summary, ai_summary_short, ai_analysis_json, ai_topics, ai_coaching, next_actions, coaching_score, lead_score, lead_temperature, lead_score_reason, analyzed_at, created_at, metadata")
          .or("ai_analysis_json.not.is.null,ai_summary.not.is.null")
          .order("created_at", { ascending: false })
          .limit(batchSize);
        if (cursor) q = q.lt("created_at", cursor);
        const { data: calls, error } = await q;
        if (error) return jsonResponse({ error: error.message }, 500);
        if (!calls || calls.length === 0) break;

        for (const c of calls) {
          const analysis = (c as any).ai_analysis_json ?? {};
          const meta = ((c as any).metadata ?? {}) as Record<string, any>;
          if (!(c as any).maestro_call_id) skippedNoMaestroId += 1;
          mirrorCallAnalysisToMaestro(admin, (c as any).user_id, c as any, analysis, {
            ai_summary: (c as any).ai_summary ?? analysis?.summary?.detailed ?? null,
            ai_summary_short: (c as any).ai_summary_short ?? analysis?.summary?.short ?? null,
            coaching_message: meta.ai_coaching ?? analysis?.coaching?.coaching_message ?? null,
            next_actions: (c as any).next_actions ?? analysis?.summary?.next_steps ?? [],
            topics: (c as any).ai_topics ?? analysis?.lead_analysis?.buying_signals ?? [],
            sentiment: (c as any).lead_temperature === "hot" ? "positive" : (c as any).lead_temperature === "cold" ? "negative" : "neutral",
            lead_score: (c as any).lead_score ?? null,
            lead_temperature: (c as any).lead_temperature ?? null,
            lead_reason: (c as any).lead_score_reason ?? null,
            model: analysis?.model ?? null,
          });
          scheduled += 1;
          lastAt = (c as any).created_at ?? lastAt;
        }
        cursor = lastAt;
        if (calls.length < batchSize) break;
      }
      return jsonResponse({ ok: true, scheduled, skipped_no_maestro_call_id: skippedNoMaestroId, skipped_no_broker: skippedNoBroker, next_cursor: cursor });
    }

    if (action === "mirror-status") {
      // Eligibility: any call with ai_summary OR ai_analysis_json
      const { count: eligible } = await admin
        .from("planipret_phone_calls")
        .select("id", { count: "exact", head: true })
        .or("ai_analysis_json.not.is.null,ai_summary.not.is.null");
      const { count: withMaestroId } = await admin
        .from("planipret_phone_calls")
        .select("id", { count: "exact", head: true })
        .or("ai_analysis_json.not.is.null,ai_summary.not.is.null")
        .not("maestro_call_id", "is", null);

      // Distinct pp_call_id successfully mirrored (pull recent 5000 rows and dedupe in memory)
      const { data: sinceRows } = await admin
        .from("planipret_maestro_sync_log")
        .select("success, request_body, created_at")
        .eq("action", "call.analysis.summary")
        .order("created_at", { ascending: false })
        .limit(5000);
      const okSet = new Set<string>();
      const failSet = new Set<string>();
      let firstAt: string | null = null;
      let lastAt: string | null = null;
      for (const r of sinceRows ?? []) {
        const id = (r as any).request_body?.pp_call_id ?? (r as any).request_body?.payload?.pp_call_id ?? null;
        if (!id) continue;
        if ((r as any).success) okSet.add(String(id)); else failSet.add(String(id));
        const at = (r as any).created_at;
        if (at) { lastAt ??= at; firstAt = at; }
      }
      const mirroredOk = okSet.size;
      const mirroredFailed = [...failSet].filter((id) => !okSet.has(id)).length;

      // Skipped: rows logged as call.analysis.skipped.* (recent window)
      const { count: skippedTotal } = await admin
        .from("planipret_maestro_sync_log")
        .select("id", { count: "exact", head: true })
        .like("action", "call.analysis.skipped.%");
      // Errors: failed summary attempts (recent window)
      const { count: errorsTotal } = await admin
        .from("planipret_maestro_sync_log")
        .select("id", { count: "exact", head: true })
        .eq("action", "call.analysis.summary")
        .eq("success", false);

      return jsonResponse({
        ok: true,
        eligible: eligible ?? 0,
        with_maestro_call_id: withMaestroId ?? 0,
        mirrored_ok: mirroredOk,
        mirrored_failed: mirroredFailed,
        skipped_total: skippedTotal ?? 0,
        errors_total: errorsTotal ?? 0,
        pending: Math.max(0, (eligible ?? 0) - mirroredOk),
        window_first_log: firstAt,
        window_last_log: lastAt,
        note: "mirrored counts derived from last 5000 sync_log rows",
      });
    }

    if (action === "sync-log") {
      const limit = Math.min(500, Math.max(1, Number(body.limit ?? 100)));
      const since = new Date(Date.now() - Math.max(1, Number(body.since_hours ?? 72)) * 3600_000).toISOString();
      let q = admin
        .from("planipret_maestro_sync_log")
        .select("id, created_at, user_id, action, maestro_endpoint, response_status, duration_ms, success, request_body, response_body")
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(limit);
      if (body.only_failures) q = q.eq("success", false);
      if (body.action_like) q = q.like("action", String(body.action_like));
      if (body.action_eq) q = q.eq("action", String(body.action_eq));
      const { data, error } = await q;
      if (error) return jsonResponse({ error: error.message }, 500);
      return jsonResponse({ ok: true, entries: data ?? [], count: data?.length ?? 0 });
    }

    if (action === "stats") {
      const hours = Math.min(720, Math.max(1, Number(body.hours ?? 24)));
      const since = new Date(Date.now() - hours * 3600_000).toISOString();
      const { data } = await admin
        .from("planipret_maestro_sync_log")
        .select("action, success, response_status, duration_ms, created_at")
        .gte("created_at", since)
        .limit(5000);
      const rows = data ?? [];
      const byAction: Record<string, { total: number; failed: number; avg_ms: number }> = {};
      for (const r of rows) {
        const k = String((r as any).action ?? "unknown");
        const b = byAction[k] ?? { total: 0, failed: 0, avg_ms: 0 };
        b.total += 1;
        if (!(r as any).success) b.failed += 1;
        b.avg_ms += Number((r as any).duration_ms ?? 0);
        byAction[k] = b;
      }
      for (const k of Object.keys(byAction)) {
        byAction[k].avg_ms = byAction[k].total ? Math.round(byAction[k].avg_ms / byAction[k].total) : 0;
      }
      return jsonResponse({ ok: true, hours, by_action: byAction, total: rows.length });
    }

    return jsonResponse({ error: `unsupported action: ${action}` }, 400);
  } catch (e) {
    console.error("[pp-maestro-admin]", e);
    return jsonResponse({ error: (e as Error).message }, 500);
  }
});
