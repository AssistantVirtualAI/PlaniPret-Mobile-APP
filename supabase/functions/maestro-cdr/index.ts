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
  maestroFetchScoped,
  maestroSyncLog,
  normalizePhone,
  pipelineLog,
  setPipelineStep,
  summarizeMaestroFailure,
  telecomAuth,
  updateCallPipeline,
} from "../_shared/maestro.ts";
import { markCdrRetrySucceeded, scheduleCdrRetry } from "../_shared/maestro-cdr-retry.ts";


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

    const auth = await telecomAuth(admin, call.user_id);

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
        const lookup = auth.brokerId
          ? await maestroFetch(cfg, {
              method: "POST",
              path: `/api/v1/users/${encodeURIComponent(String(auth.brokerId))}/lookup-by-phone`,
              token: auth.token,
              body: { phone: contactPhone },
            })
          : { ok: false, status: 0, data: null, path: "lookup_skipped_no_broker_id" } as any;
        await pipelineLog(admin, {
          call_id,
          user_id: call.user_id,
          step: "client_lookup",
          status: lookup.ok ? "success" : "skipped",
          duration_ms: Date.now() - t0,
          payload: { source: "maestro", status: lookup.status },
        });
        if (lookup.ok && lookup.data) {
          const c = lookup.data?.user ?? lookup.data?.client ?? lookup.data;
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
      provider_call_id: call.ns_call_id ?? call.id,
      to_user_number: call.direction === "inbound" ? call.from_number : call.to_number,
      from_user_number: call.direction === "inbound" ? call.to_number : call.from_number,
      status: "ended",
      direction: call.direction,
      started_at: call.started_at,
      ended_at: call.ended_at,
      duration_sec: call.duration_seconds ?? 0,
      broker_ext: profile?.ns_extension ?? null,
    };

    const t0 = Date.now();
    if (!auth.brokerId) {
      const diag = (auth as any).diag ?? null;
      console.error(
        `[maestro-cdr] call=${call_id} broker id unresolved — reason=${diag?.reason ?? "unknown"} ` +
          `matched_by=${diag?.matched_by ?? "none"} stored=${diag?.stored_broker_id ?? "-"} ` +
          `sip_probe=${diag?.sip_probe_result ?? "-"} cooldown=${diag?.cooldown_active ?? false}`,
      );
      await setPipelineStep(admin, call_id, "cdr", "error", { reason: "maestro_broker_id_missing", diag });
      await pipelineLog(admin, {
        call_id,
        user_id: call.user_id,
        step: "cdr",
        status: "error",
        error_message: "maestro_broker_id_missing",
        payload: { diag },
      });
      const retry = await scheduleCdrRetry(admin, {
        call_id,
        user_id: call.user_id,
        reason: "maestro_broker_id_missing",
        error: diag?.reason ?? "maestro_broker_id_missing",
        permanent: true,
      });
      return json({
        success: false,
        error: "maestro_broker_id_missing",
        hint: "Set maestro_broker_id (numeric Telecom user id, e.g. 67) via Admin → Telecom Mapping.",
        permanent: true,
        diag,
        retry,
      }, 200);
    }

    const res = await maestroFetch(cfg, {
      method: "POST",
      path: `/api/v1/users/${encodeURIComponent(String(auth.brokerId))}/calls`,
      token: auth.token,
      body,
      idempotencyKey: call.id,
    }) as any;
    const ms = Date.now() - t0;

    await maestroSyncLog(admin, {
      user_id: call.user_id,
      action: "call.cdr",
      endpoint: res.endpoint ?? "/api/v1/users/{id}/calls",
      request_body: { call_id, ns_call_id: call.ns_call_id ?? null, has_contact_phone: !!contactPhone, has_broker_id: !!auth.brokerId, broker_id: auth.brokerId, broker_diag: (auth as any).diag ?? null },
      response_status: res.status,
      response_body: res.data,
      duration_ms: ms,
      success: res.ok || res.status === 409,
    });

    if (res.ok || res.status === 409) {
      const maestroCallId = res.data?.call?.id ?? res.data?.id ?? res.data?.call_id ?? null;
      await admin
        .from("planipret_phone_calls")
        .update({
          maestro_synced: true,
          maestro_call_id: maestroCallId,
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
        payload: { maestro_call_id: maestroCallId, conflict: res.status === 409 },
      });
      await maestroAudit(admin, "cdr_pushed", { call_id, status: res.status, client_id: maestroClientId });
      await broadcastPipeline(admin, call.user_id, "pipeline_step", {
        call_id,
        step: "cdr_sent",
        label: "CDR synchronisé avec Maestro ✅",
        client_found: !!maestroClientId,
        client_name: clientName,
      });

      // Close any open retry entry and re-trigger the dependent recording upload.
      await markCdrRetrySucceeded(admin, call_id, maestroCallId ? String(maestroCallId) : null);

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

      return json({ success: true, maestro_call_id: maestroCallId, client_id: maestroClientId, retry: { status: "succeeded" } });
    }

    const failure = summarizeMaestroFailure(res.status, res.data);
    await updateCallPipeline(admin, call_id, { step: "error", error: `${failure.error}_${res.status}` });
    await setPipelineStep(admin, call_id, "cdr", "error", { status: res.status });
    await pipelineLog(admin, { call_id, user_id: call.user_id, step: "cdr_sync", status: "error", duration_ms: ms, error_message: failure.error });
    await maestroAudit(admin, "cdr_failed", { call_id, status: res.status, error: failure.error, detail: failure.detail });
    await broadcastPipeline(admin, call.user_id, "pipeline_error", { call_id, step: "cdr_sync", error: `${failure.error} (${res.status})` });
    const retry = await scheduleCdrRetry(admin, {
      call_id,
      user_id: call.user_id,
      reason: failure.error,
      error: failure.detail ?? failure.error,
      status: res.status,
      permanent: failure.permanent,
    });
    return json({ success: false, status: res.status, error: failure.error, detail: failure.detail, permanent: failure.permanent, details: res.data, retry }, 200);

  } catch (e: any) {
    console.error("maestro-cdr error", e);
    return json({ success: false, error: e?.message ?? "server_error" }, 500);
  }
});
