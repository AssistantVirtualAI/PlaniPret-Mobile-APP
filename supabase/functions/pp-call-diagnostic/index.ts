// pp-call-diagnostic — Validates and logs the mapping between a call and its
// CDR/recording/transcription so we can see WHY a specific call doesn't surface
// its recording or CDR row.
//
// POST { call_db_id?: string, ns_callid?: string, recent?: boolean, limit?: number }
//   → returns { calls: [{ id, mapping, cdr, recording, transcription, issues[] }] }
//
// Auth: any authenticated Planipret broker/admin (own extension only).

import { corsHeaders, jsonResponse, requirePlanipretBroker, nsFetch } from "../_shared/planipret-ns.ts";

function idsFromCall(row: any): string[] {
  const out: string[] = [];
  for (const k of ["ns_call_id", "ns_callid", "ns_orig_callid", "ns_term_callid"]) {
    const v = row?.[k];
    if (v && !out.includes(v)) out.push(String(v));
  }
  const meta = row?.metadata ?? {};
  for (const k of ["call-orig-call-id", "call-term-call-id", "call-parent-call-id", "call-parent-cdr-id"]) {
    const v = meta?.[k];
    if (v && !out.includes(v)) out.push(String(v));
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const guard = await requirePlanipretBroker(req);
  if (guard instanceof Response) return guard;
  const { ctx, supabase } = guard;

  let body: any = {};
  try { body = await req.json(); } catch { /* empty */ }
  const url = new URL(req.url);
  const callDbId = body.call_db_id ?? url.searchParams.get("call_db_id");
  const recent = body.recent === true || url.searchParams.get("recent") === "true";
  const limit = Math.min(Number(body.limit ?? url.searchParams.get("limit") ?? 5), 25);

  let rows: any[] = [];
  if (callDbId) {
    const { data } = await supabase
      .from("planipret_phone_calls")
      .select("*")
      .eq("id", callDbId)
      .eq("user_id", ctx.profileId)
      .limit(1);
    rows = data ?? [];
  } else if (recent || !callDbId) {
    const { data } = await supabase
      .from("planipret_phone_calls")
      .select("*")
      .eq("user_id", ctx.profileId)
      .order("started_at", { ascending: false })
      .limit(limit);
    rows = data ?? [];
  }

  const results: any[] = [];
  for (const row of rows) {
    const ids = idsFromCall(row);
    const issues: string[] = [];
    if (!ids.length) issues.push("NO_NS_IDS — la ligne n'a aucun call-id NetSapiens, la synchro CDR est incomplète.");
    if (!row.extension) issues.push("NO_EXTENSION — extension NS manquante.");
    if (!row.started_at) issues.push("NO_STARTED_AT — horodatage manquant, matching CDR impossible.");

    // Probe CDR endpoint
    const cdrChecks: any[] = [];
    for (const id of ids.slice(0, 3)) {
      try {
        const r = await nsFetch(`/domains/${encodeURIComponent(ctx.nsDomain)}/cdrs/${encodeURIComponent(id)}`, { method: "GET" });
        cdrChecks.push({ id, status: r.status, ok: r.ok });
      } catch (e) {
        cdrChecks.push({ id, error: (e as Error).message });
      }
    }

    // Probe recording endpoint
    const recChecks: any[] = [];
    for (const id of ids.slice(0, 3)) {
      try {
        const r = await nsFetch(`/domains/${encodeURIComponent(ctx.nsDomain)}/users/${encodeURIComponent(row.extension ?? ctx.extension)}/recordings/${encodeURIComponent(id)}`, { method: "GET" });
        recChecks.push({ id, status: r.status, ok: r.ok, ct: r.headers.get("content-type") });
      } catch (e) {
        recChecks.push({ id, error: (e as Error).message });
      }
    }
    if (recChecks.every((c) => !c.ok)) issues.push("RECORDING_NOT_FOUND — NS-API n'a retourné aucun enregistrement pour les IDs testés.");
    if (!row.recording_url && !row.ns_recording_url) issues.push("NO_RECORDING_URL — aucune URL d'enregistrement en base.");
    if (!row.transcript) issues.push("NO_TRANSCRIPT — transcription non générée.");
    if (!row.ai_summary) issues.push("NO_AI_ANALYSIS — analyse IA (Claude) non exécutée.");

    results.push({
      call_db_id: row.id,
      ns_ids: ids,
      extension: row.extension,
      direction: row.direction,
      from_number: row.from_number,
      to_number: row.to_number,
      started_at: row.started_at,
      duration_seconds: row.duration_seconds,
      has_recording: !!row.has_recording,
      recording_url_present: !!row.recording_url,
      transcript_present: !!row.transcript,
      analyzed_at: row.analyzed_at,
      cdr_checks: cdrChecks,
      recording_checks: recChecks,
      issues,
    });
  }

  // Log every diagnostic run for debugging
  try {
    await supabase.from("planipret_edge_function_runs").insert({
      function_name: "pp-call-diagnostic",
      status: "success",
      triggered_by: ctx.userId,
      summary: { count: results.length, ids: rows.map((r) => r.id) },
    });
  } catch (_) { /* best-effort */ }

  return jsonResponse({ ok: true, count: results.length, calls: results, extension: ctx.extension, domain: ctx.nsDomain });
});
