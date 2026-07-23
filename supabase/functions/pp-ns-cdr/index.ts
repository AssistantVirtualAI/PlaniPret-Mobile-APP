// pp-ns-cdr — Pull NS-API v2 CDR records and sync into planipret_phone_calls.
// AVA Planiprêt only.
// GET    ?start=ISO&end=ISO&limit=200          → fetch + return recent CDRs (cached)
// POST   ?action=sync   body { start?, end? }  → fetch & upsert into planipret_phone_calls

import {
  corsHeaders,
  jsonResponse,
  requirePlanipretBroker,
  nsFetch,
  AVA_ORG_ID,
} from "../_shared/planipret-ns.ts";

function pickDirection(raw: any): "inbound" | "outbound" | "missed" {
  const dir = String(val(raw, ["direction", "call_direction", "call-direction", "type", "call-type"], "")).toLowerCase();
  const disposition = String(val(raw, ["disposition", "status", "call-status"], "")).toLowerCase();
  if (dir.includes("in") || dir === "incoming" || dir === "received") {
    if (raw?.answered === false || ["no-answer", "missed", "unanswered"].includes(disposition)) return "missed";
    return "inbound";
  }
  if (["no-answer", "missed", "unanswered"].includes(disposition)) return "missed";
  return "outbound";
}

function val(raw: any, keys: string[], fb: any = null) {
  for (const k of keys) {
    const v = raw?.[k];
    if (v !== undefined && v !== null && `${v}` !== "") return v;
  }
  return fb;
}

function normalizeEndpoint(v: unknown): string | null {
  const s = String(v ?? "").trim();
  if (!s) return null;
  return s.replace(/^sips?:/i, "").replace(/^tel:/i, "").split("@")[0] || s;
}

function normalizeCdr(it: any, ctx: any) {
  const nsCdrId = val(it, ["call-parent-cdr-id", "cdr-id", "cdr_id", "id", "uuid", "call_id", "call-id"]);
  const nsCallId = val(it, ["call-id", "call_id", "callid", "call-parent-call-id", "orig_callid", "term_callid"]);
  const nsOrigCallId = val(it, ["call-orig-call-id", "orig_callid", "orig-callid", "orig-call-id"]);
  const nsTermCallId = val(it, ["call-term-call-id", "term_callid", "term-callid", "term-call-id"]);
  const fromNumber = normalizeEndpoint(val(it, ["from_number", "from", "caller_id_number", "caller-id-number", "call-orig-from-uri", "orig-from-uri", "orig_from_uri", "call-orig-user", "orig-user", "orig_from_user", "ani", "by_number"]));
  const toNumber = normalizeEndpoint(val(it, ["to_number", "to", "destination", "dialed_number", "dnis", "call-term-to-uri", "call-orig-to-uri", "term_to_user", "term-user", "call-term-user", "orig_to_user", "orig-to-user"]));
  const recordingUrl = val(it, ["file-access-url", "recording_url", "recording-url", "record_url", "recording", "url"]);
  const recordingStatus = val(it, ["call-recording-status", "recording_status"]);
  return {
    ...it,
    ns_call_id: nsCdrId,
    ns_callid: nsCallId,
    ns_orig_callid: nsOrigCallId,
    ns_term_callid: nsTermCallId,
    ns_cdr_id: nsCdrId,
    ns_domain: ctx.nsDomain,
    extension: ctx.extension,
    direction: pickDirection(it),
    status: val(it, ["disposition", "status", "call-status"]),
    from_number: fromNumber,
    from_name: val(it, ["from_name", "caller_id_name", "caller-id-name", "orig_from_name", "orig-name", "by_name"]),
    to_number: toNumber,
    to_name: val(it, ["to_name", "term_to_name", "term-name"]),
    started_at: toIso(val(it, ["start_time", "started_at", "time_start", "time-start", "call-start-datetime", "call-batch-start-datetime"])),
    answered_at: toIso(val(it, ["answer_time", "answered_at", "time_answer", "time-answer", "call-answer-datetime"])),
    ended_at: toIso(val(it, ["end_time", "ended_at", "time_release", "time-release", "call-end-datetime"])),
    duration_seconds: Number(val(it, ["duration", "billsec", "time_talking", "call-talking-duration-seconds", "call-total-duration-seconds"], 0)) || 0,
    recording_url: recordingUrl,
    ns_recording_url: recordingUrl,
  };
}

function toIso(v: unknown): string | null {
  if (!v) return null;
  const d = new Date(v as string);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

function isProfileFkError(error: { message?: string; code?: string; details?: string } | null) {
  if (!error) return false;
  const text = `${error.code ?? ""} ${error.message ?? ""} ${error.details ?? ""}`;
  return error.code === "23503" || /fk_phone_calls_profile|foreign key/i.test(text);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const guard = await requirePlanipretBroker(req);
  if (guard instanceof Response) {
    // If the only problem is a profile not yet linked to an NS extension,
    // return an empty list instead of an error so the UI doesn't blank out.
    if (guard.status === 412) {
      return new Response(
        JSON.stringify({ ok: true, count: 0, items: [], needs_link: true }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    return guard;
  }
  const { ctx, supabase } = guard;

  const url = new URL(req.url);
  let body: any = {};
  if (req.method === "POST") {
    try { body = await req.json(); } catch { body = {}; }
  }
  const action = body.action ?? url.searchParams.get("action") ?? "list";

  const end = body.end ?? url.searchParams.get("end") ?? new Date().toISOString();
  const start = body.start ?? url.searchParams.get("start") ??
    new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  // Smaller pages by default to reduce NS-API pressure. Hard cap 200.
  const rawLimit = Number(body.limit ?? url.searchParams.get("limit") ?? 50);
  const limit = Math.max(1, Math.min(isNaN(rawLimit) ? 50 : rawLimit, 200));
  const offset = Math.max(0, Number(body.offset ?? url.searchParams.get("offset") ?? 0) || 0);

  const nsPath =
    `/domains/${encodeURIComponent(ctx.nsDomain)}/users/${encodeURIComponent(ctx.extension)}/cdrs` +
    `?start-time=${encodeURIComponent(start)}&end-time=${encodeURIComponent(end)}` +
    `&limit=${limit}&offset=${offset}`;

  // Fallback to cached DB rows if NS-API is unreachable / slow / breaker open.
  const dbFallback = async (reason: string, extra: Record<string, unknown> = {}) => {
    const { data } = await supabase
      .from("planipret_phone_calls")
      .select("*")
      .eq("extension", ctx.extension)
      .gte("started_at", start)
      .lte("started_at", end)
      .order("started_at", { ascending: false })
      .range(offset, offset + limit - 1);
    const items = data ?? [];
    return jsonResponse({
      ok: true,
      count: items.length,
      items,
      degraded: true,
      reason,
      limit,
      offset,
      next_offset: items.length === limit ? offset + limit : null,
      ...extra,
    });
  };

  try {
    let res: Response | null = null;
    let lastErr: unknown = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        res = await nsFetch(nsPath, { method: "GET" }, { functionName: "pp-ns-cdr" });
        break;
      } catch (e) {
        lastErr = e;
        await new Promise((r) => setTimeout(r, 300 * (attempt + 1)));
      }
    }
    if (!res) {
      if (action === "list") return await dbFallback(`NS-API unreachable: ${(lastErr as Error)?.message ?? "unknown"}`);
      return jsonResponse({ error: `NS-API unreachable: ${(lastErr as Error)?.message ?? "unknown"}` }, 502);
    }
    // nsFetch returned a degraded 503 (network error or breaker open) — use cache
    if (res.status === 503 && action === "list") {
      const info = await res.clone().json().catch(() => ({} as any));
      return await dbFallback(info?.error ?? "NS-API degraded", {
        breaker_open: !!info?.breaker_open,
        reopens_at: info?.reopens_at ?? null,
      });
    }
    if (!res.ok) {
      const txt = await res.text();
      if (action === "list" && res.status >= 500) return await dbFallback(`NS-API ${res.status}`);
      return jsonResponse({ error: "NS-API CDR fetch failed", status: res.status, body: txt }, 502);
    }

    const raw = await res.json();
    const items: any[] = (Array.isArray(raw) ? raw : raw?.cdrs ?? raw?.data ?? []).map((it: any) => normalizeCdr(it, ctx));

    if (action === "list") {
      return jsonResponse({
        ok: true,
        count: items.length,
        items,
        limit,
        offset,
        next_offset: items.length === limit ? offset + limit : null,
      });
    }


    if (action === "sync") {
      const { data: runRow } = await supabase
        .from("planipret_edge_function_runs")
        .insert({
          function_name: "pp-ns-cdr",
          status: "running",
          triggered_by: ctx.userId,
          summary: { extension: ctx.extension, domain: ctx.nsDomain, start, end, fetched: items.length },
        })
        .select("id")
        .maybeSingle();
      const runId = runRow?.id as string | undefined;

      // Only attach calls to planipret_profiles.id when that exact profile exists.
      // If the profile link is stale, leave user_id undefined so Postgres keeps the
      // existing value during upsert instead of trying to write a broken FK.
      let safeUserId: string | null = null;
      const { data: profileCheck } = await supabase
        .from("planipret_profiles")
        .select("id")
        .eq("id", ctx.profileId)
        .maybeSingle();
      if (profileCheck?.id) safeUserId = ctx.profileId;

      const rows = items.map((it) => ({
        ...(safeUserId ? { user_id: safeUserId } : {}),
        organization_id: AVA_ORG_ID,
        ns_call_id: it.ns_call_id ?? it.ns_cdr_id ?? null,
        ns_callid: it.ns_callid ?? null,
        ns_cdr_id: it.ns_cdr_id ?? null,
        ns_orig_callid: it.ns_orig_callid ?? null,
        ns_term_callid: it.ns_term_callid ?? null,
        ns_domain: ctx.nsDomain,
        extension: ctx.extension,
        direction: it.direction,
        status: it.status,
        from_number: it.from_number,
        from_name: it.from_name,
        to_number: it.to_number,
        to_name: it.to_name,
        started_at: it.started_at,
        answered_at: it.answered_at,
        ended_at: it.ended_at,
        duration_seconds: it.duration_seconds,
        recording_url: it.recording_url,
        ns_recording_url: it.ns_recording_url,
        metadata: it,
      }));

      const withId = rows.filter((r) => r.ns_call_id);
      const withoutId = rows.filter((r) => !r.ns_call_id);

      const withoutUserId = (payload: any[]) => payload.map(({ user_id: _userId, ...r }) => r);
      const CHUNK = 50;
      const chunk = <T,>(arr: T[]) => {
        const out: T[][] = [];
        for (let i = 0; i < arr.length; i += CHUNK) out.push(arr.slice(i, i + CHUNK));
        return out;
      };
      const upsertChunk = async (payload: any[], omitUserId: boolean) => {
        const finalPayload = omitUserId ? withoutUserId(payload) : payload;
        return await supabase
          .from("planipret_phone_calls")
          .upsert(finalPayload, { onConflict: "ns_call_id", count: "exact", ignoreDuplicates: false });
      };
      const insertChunk = async (payload: any[], omitUserId: boolean) => {
        const finalPayload = omitUserId ? withoutUserId(payload) : payload;
        return await supabase.from("planipret_phone_calls").insert(finalPayload).select("id", { count: "exact" });
      };

      let upserted = 0;
      try {
        for (const batch of chunk(withId)) {
          let { error, count } = await upsertChunk(batch, false);
          if (isProfileFkError(error)) ({ error, count } = await upsertChunk(batch, true));
          if (error) throw new Error(error.message);
          upserted += count ?? batch.length;
        }
        for (const batch of chunk(withoutId)) {
          let { error } = await insertChunk(batch, false);
          if (isProfileFkError(error)) ({ error } = await insertChunk(batch, true));
          if (error) throw new Error(error.message);
        }
      } catch (e) {
        const msg = (e as Error).message;
        if (runId) await supabase.from("planipret_edge_function_runs").update({ status: "error", finished_at: new Date().toISOString(), error: msg }).eq("id", runId);
        return jsonResponse({ error: msg }, 500);
      }


      const summary = { extension: ctx.extension, domain: ctx.nsDomain, start, end, fetched: items.length, upserted, inserted_no_id: withoutId.length };
      if (runId) await supabase.from("planipret_edge_function_runs").update({ status: "success", finished_at: new Date().toISOString(), summary }).eq("id", runId);

      return jsonResponse({ ok: true, ...summary });
    }

    return jsonResponse({ error: "unsupported action/method" }, 400);
  } catch (e) {
    if (action === "list") return await dbFallback((e as Error).message);
    return jsonResponse({ error: (e as Error).message }, 502);
  }
});
