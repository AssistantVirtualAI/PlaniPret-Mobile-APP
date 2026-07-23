// POST /functions/v1/maestro-cdr
// Body: { call_id: uuid }
// Step 1 of pipeline: client lookup → push CDR to Maestro → trigger transcript.
import {
  adminClient,
  broadcastPipeline,
  cacheMaestroClient,
  corsHeaders,
  getBrokerAuth,
  getMaestroConfig,
  json,
  maestroAudit,
  maestroFetch,
  normalizePhone,
  pipelineLog,
  setPipelineStep,
  updateCallPipeline,
} from "../_shared/maestro.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  try {
    const { call_id } = await req.json().catch(() => ({}));
    if (!call_id) return json({ success: false, error: "call_id_required" }, 400);

    const admin = adminClient();
    const { data: call } = await admin
      .from("planipret_phone_calls")
      .select(
        "id, user_id, direction, from_number, to_number, started_at, ended_at, duration_seconds, recording_url, maestro_synced, maestro_client_id, ns_call_id",
      )
      .eq("id", call_id)
      .maybeSingle();

    if (!call) return json({ success: false, error: "call_not_found" }, 404);
    if (call.maestro_synced) {
      return json({ success: true, already_synced: true });
    }

    const cfg = await getMaestroConfig(admin);
    if (!cfg.url || !cfg.key) {
      await updateCallPipeline(admin, call_id, { step: "error", error: "maestro_not_configured" });
      await setPipelineStep(admin, call_id, "cdr", "error", { reason: "not_configured" });
      return json({ success: false, error: "maestro_not_configured" }, 200);
    }

    await updateCallPipeline(admin, call_id, { step: "client_lookup", started: true, error: null });
    await pipelineLog(admin, { call_id, user_id: call.user_id, step: "client_lookup", status: "started" });

    const auth = await getBrokerAuth(admin, call.user_id);

    // ── STEP 1: client lookup (cache-first) ─────────────────────
    let maestroClientId = call.maestro_client_id ?? null;
    let clientName: string | null = null;
    let clientCompany: string | null = null;
    let mortgageStage: string | null = null;

    const contactPhone = call.direction === "inbound"
      ? normalizePhone(call.from_number)
      : normalizePhone(call.to_number);

    if (contactPhone && call.user_id) {
      const { data: cached } = await admin
        .from("planipret_maestro_clients")
        .select("*")
        .eq("user_id", call.user_id)
        .eq("phone_e164", contactPhone)
        .maybeSingle();
      const fresh = cached && new Date(cached.cached_at).getTime() > Date.now() - 3600_000;
      if (fresh) {
        maestroClientId = cached.maestro_client_id;
        clientName = cached.full_name;
        clientCompany = cached.company;
        mortgageStage = cached.mortgage_stage;
        await pipelineLog(admin, { call_id, user_id: call.user_id, step: "client_lookup", status: "success", payload: { source: "cache", client_id: maestroClientId } });
      } else {
        const t0 = Date.now();
        const lookup = await maestroFetch(cfg, {
          method: "GET",
          path: `/api/v1/clients/lookup?phone=${encodeURIComponent(contactPhone)}`,
          token: auth.token,
        });
        await pipelineLog(admin, {
          call_id,
          user_id: call.user_id,
          step: "client_lookup",
          status: lookup.ok ? "success" : "skipped",
          duration_ms: Date.now() - t0,
          payload: { source: "maestro", status: lookup.status },
        });
        if (lookup.ok && lookup.data) {
          const c = lookup.data?.client ?? lookup.data;
          maestroClientId = c?.id ?? c?.client_id ?? null;
          clientName = c?.full_name ?? c?.name ?? ([c?.first_name, c?.last_name].filter(Boolean).join(" ") || null);
          clientCompany = c?.company ?? null;
          mortgageStage = c?.mortgage_stage ?? null;
          if (maestroClientId) {
            await cacheMaestroClient(admin, {
              user_id: call.user_id,
              maestro_client_id: maestroClientId,
              phone_e164: contactPhone,
              full_name: clientName,
              company: clientCompany,
              email: c?.email ?? null,
              mortgage_stage: mortgageStage,
              preferred_lang: c?.preferred_lang ?? "fr",
              tags: c?.tags ?? [],
            });
          }
        }
      }
    }

    await admin
      .from("planipret_phone_calls")
      .update({
        maestro_client_id: maestroClientId,
        maestro_client_name: clientName,
        maestro_client_company: clientCompany,
        maestro_mortgage_stage: mortgageStage,
      })
      .eq("id", call_id);

    // ── STEP 2: push CDR ────────────────────────────────────────
    await updateCallPipeline(admin, call_id, { step: "cdr_sync" });
    await setPipelineStep(admin, call_id, "cdr", "running");
    await pipelineLog(admin, { call_id, user_id: call.user_id, step: "cdr_sync", status: "started" });

    const { data: profile } = await admin
      .from("planipret_profiles")
      .select("ns_extension")
      .eq("user_id", call.user_id ?? "")
      .maybeSingle();

    const body = {
      call_id: call.ns_call_id ?? call.id,
      direction: call.direction,
      caller_number: call.from_number,
      callee_number: call.to_number,
      started_at: call.started_at,
      ended_at: call.ended_at,
      duration_sec: call.duration_seconds ?? 0,
      recording_url: call.recording_url,
      broker_ext: profile?.ns_extension ?? null,
      maestro_client_id: maestroClientId,
    };

    const t0 = Date.now();
    const res = await maestroFetch(cfg, {
      method: "POST",
      path: "/api/v1/calls/cdr",
      token: auth.token,
      body,
      idempotencyKey: call.id,
    });
    const ms = Date.now() - t0;

    if (res.ok || res.status === 409) {
      await admin
        .from("planipret_phone_calls")
        .update({
          maestro_synced: true,
          maestro_call_id: res.data?.id ?? res.data?.call_id ?? null,
        })
        .eq("id", call.id);
      await updateCallPipeline(admin, call_id, { step: "cdr_sent" });
      await setPipelineStep(admin, call_id, "cdr", "done", { conflict: res.status === 409 });
      await pipelineLog(admin, {
        call_id,
        user_id: call.user_id,
        step: "cdr_sync",
        status: "success",
        duration_ms: ms,
        payload: { maestro_call_id: res.data?.id ?? null, conflict: res.status === 409 },
      });
      await maestroAudit(admin, "cdr_pushed", { call_id, status: res.status, client_id: maestroClientId });
      await broadcastPipeline(admin, call.user_id, "pipeline_step", {
        call_id,
        step: "cdr_sent",
        label: "CDR synchronisé avec Maestro ✅",
        client_found: !!maestroClientId,
        client_name: clientName,
      });

      // Trigger transcript (fire and forget)
      try {
        const supaUrl = Deno.env.get("SUPABASE_URL")!;
        const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
        fetch(`${supaUrl}/functions/v1/maestro-transcript`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${anon}` },
          body: JSON.stringify({ call_id }),
        }).catch(() => {});
      } catch {}

      return json({ success: true, maestro_call_id: res.data?.id ?? null, client_id: maestroClientId });
    }

    await updateCallPipeline(admin, call_id, { step: "error", error: `cdr_${res.status}` });
    await setPipelineStep(admin, call_id, "cdr", "error", { status: res.status });
    await pipelineLog(admin, { call_id, user_id: call.user_id, step: "cdr_sync", status: "error", duration_ms: ms, error_message: `status_${res.status}` });
    await maestroAudit(admin, "cdr_failed", { call_id, status: res.status, data: res.data });
    await broadcastPipeline(admin, call.user_id, "pipeline_error", { call_id, step: "cdr_sync", error: `HTTP ${res.status}` });
    return json({ success: false, status: res.status, details: res.data }, 200);
  } catch (e: any) {
    console.error("maestro-cdr error", e);
    return json({ success: false, error: e?.message ?? "server_error" }, 500);
  }
});
