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

function metaString(meta: unknown, key: string): string | null {
  const value = (meta as Record<string, unknown> | null)?.[key];
  return typeof value === "string" && value.trim() ? value : null;
}

/**
 * Rule #4 (Scott / Telecom REST API): never POST a call record for an INBOUND
 * call coming from another broker's VoIP number/extension — the caller side
 * already created the record (rule #2). This avoids duplicate call rows.
 * Client → broker inbound calls are still posted.
 */
async function isInternalBrokerCaller(admin: any, rawFrom: string | null): Promise<boolean> {
  const raw = String(rawFrom ?? "").trim();
  if (!raw) return false;
  const digits = raw.replace(/\D/g, "");
  // Bare extension (3–6 digits) => internal leg.
  if (digits.length > 0 && digits.length <= 6) return true;

  const e164 = normalizePhone(raw);
  const candidates = [e164, digits, digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : null]
    .filter(Boolean) as string[];

  try {
    const { data: dids } = await admin
      .from("planipret_did_assignments")
      .select("extension")
      .or(candidates.map((c) => `phone_number_e164.eq.${c},phone_number_digits.eq.${c}`).join(","))
      .limit(1);
    if ((dids ?? []).length > 0) return true;
  } catch { /* non-fatal */ }

  try {
    const { data: prof } = await admin
      .from("planipret_profiles")
      .select("id")
      .in("phone", candidates)
      .limit(1);
    if ((prof ?? []).length > 0) return true;
  } catch { /* non-fatal */ }

  return false;
}



Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  try {
    const { call_id, force = false } = await req.json().catch(() => ({}));
    if (!call_id) return json({ success: false, error: "call_id_required" }, 400);

    const admin = adminClient();
    const { data: call } = await admin
      .from("planipret_phone_calls")
      .select(
        "id, user_id, direction, from_number, to_number, started_at, ended_at, duration_seconds, recording_url, maestro_synced, maestro_call_id, maestro_client_id, ns_call_id, metadata",
      )
      .eq("id", call_id)
      .maybeSingle();

    if (!call) return json({ success: false, error: "call_not_found" }, 404);
    if (!force && call.maestro_synced && (call as any).maestro_call_id) {
      return json({ success: true, already_synced: true });
    }

    // Rule #4: inbound leg from another broker's VoIP number => the caller
    // already posted the record. Skip to avoid duplicates.
    if (call.direction === "inbound" && !(call as any).maestro_call_id) {
      if (await isInternalBrokerCaller(admin, call.from_number)) {
        console.log(`[maestro-cdr] skip internal inbound leg call=${call_id} from=${call.from_number}`);
        await setPipelineStep(admin, call_id, "cdr", "done", { skipped: "internal_broker_inbound" });
        return json({ success: true, skipped: "internal_broker_inbound" }, 200);
      }
    }


    const cfg = await getMaestroConfig(admin);
    if (!cfg.url || !cfg.key) {
      await updateCallPipeline(admin, call_id, { step: "error", error: "maestro_not_configured" });
      await setPipelineStep(admin, call_id, "cdr", "error", { reason: "not_configured" });
      return json({ success: false, error: "maestro_not_configured" }, 200);
    }

    await updateCallPipeline(admin, call_id, { step: "client_lookup", started: true, error: null });
    await pipelineLog(admin, { call_id, user_id: call.user_id, step: "client_lookup", status: "started" });

    // Telecom writes require the machine API key. Broker OAuth is only for the
    // CRM identity/directory endpoints and causes HTTP 500 on call creation.
    const auth = await telecomAuth(admin, call.user_id, false);

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
              machine: auth.machine,
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

    const { data: profRows } = await admin
      .from("planipret_profiles")
      .select("id, user_id, ns_extension")
      .or(`user_id.eq.${call.user_id ?? "00000000-0000-0000-0000-000000000000"},id.eq.${call.user_id ?? "00000000-0000-0000-0000-000000000000"}`)
      .limit(2);
    const profile = ((profRows ?? []) as any[]).find((r) => r.user_id === call.user_id) ?? (profRows ?? [])[0] ?? null;

    // Payload format confirmed by Scott (Telecom REST API).
    const metadata = ((call as any).metadata ?? {}) as Record<string, unknown>;
    const startedAt = call.started_at ?? metaString(metadata, "call-start-datetime") ?? metaString(metadata, "started_at");
    const answeredAt = metaString(metadata, "call-answer-datetime") ?? metaString(metadata, "answered_at") ?? startedAt;
    const endedAt = call.ended_at ?? metaString(metadata, "call-disconnect-datetime") ?? metaString(metadata, "ended_at") ?? startedAt;

    // Keep creation payload to Maestro's documented minimum. Completion data,
    // summary and notes are sent afterward with PUT /calls/{id}.
    const body: Record<string, unknown> = {
      provider_call_id: call.ns_call_id ?? call.id,
      status: "dialing",
      direction: call.direction,
    };
    if (call.direction === "inbound") {
      body.from_user_number = normalizePhone(call.from_number);
      body.to_user_id = Number(auth.brokerId);
    } else {
      body.to_user_number = normalizePhone(call.to_number);
    }


    const t0 = Date.now();
    if (!auth.brokerId) {
      const diag = (auth as any).diag ?? null;
      console.error(
        `[maestro-cdr] call=${call_id} broker id unresolved — reason=${diag?.reason ?? "unknown"} ` +
          `matched_by=${diag?.matched_by ?? "none"} stored=${diag?.stored_broker_id ?? "-"} ` +
          `sip_probe=${diag?.sip_probe_result ?? "-"} cooldown=${diag?.cooldown_active ?? false}`,
      );
      await setPipelineStep(admin, call_id, "cdr", "error", { reason: "maestro_telecom_user_id_missing", diag });
      await pipelineLog(admin, {
        call_id,
        user_id: call.user_id,
        step: "cdr",
        status: "error",
        error_message: "maestro_telecom_user_id_missing",
        payload: { diag },
      });
      const retry = await scheduleCdrRetry(admin, {
        call_id,
        user_id: call.user_id,
        reason: "maestro_telecom_user_id_missing",
        error: diag?.reason ?? "maestro_telecom_user_id_missing",
        permanent: true,
      });
      return json({
        success: false,
        error: "maestro_telecom_user_id_missing",
        hint: "Reconnect the broker's Telecom identity so the numeric Telecom user ID is linked.",
        permanent: true,
        diag,
        retry,
      }, 200);
    }

    const existingMaestroCallId = (call as any).maestro_call_id ?? null;
    const res = await maestroFetch(cfg, {
      method: force && existingMaestroCallId ? "PUT" : "POST",
      path: force && existingMaestroCallId
        ? `/api/v1/users/${encodeURIComponent(String(auth.brokerId))}/calls/${encodeURIComponent(String(existingMaestroCallId))}`
        : `/api/v1/users/${encodeURIComponent(String(auth.brokerId))}/calls`,
      token: auth.token,
      machine: auth.machine,
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
      const maestroCallId = existingMaestroCallId ?? res.data?.call?.id ?? res.data?.id ?? res.data?.call_id ?? null;
      if (!maestroCallId) {
        const summary = summarizeMaestroFailure(res.status, res.data);
        await setPipelineStep(admin, call_id, "cdr", "error", { reason: "maestro_call_id_missing", response_status: res.status });
        await pipelineLog(admin, {
          call_id,
          user_id: call.user_id,
          step: "cdr_sync",
          status: "error",
          duration_ms: ms,
          error_message: "maestro_call_id_missing",
          payload: { detail: summary.detail, response_status: res.status },
        });
        const retry = await scheduleCdrRetry(admin, {
          call_id,
          user_id: call.user_id,
          reason: "maestro_call_id_missing",
          error: summary.detail,
          status: res.status,
          permanent: false,
        });
        return json({ success: false, error: "maestro_call_id_missing", detail: summary.detail, status: res.status, retry }, 424);
      }
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

      // Mark the call as ended so Maestro starts generating recording + transcription.
      if (maestroCallId) {
        try {
          const endRes = await maestroFetch(cfg, {
            method: "PUT",
            path: `/api/v1/users/${encodeURIComponent(String(auth.brokerId))}/calls/${encodeURIComponent(String(maestroCallId))}`,
            token: auth.token,
            machine: auth.machine,
            body: { status: "ended" },
          }) as any;
          await maestroSyncLog(admin, {
            user_id: call.user_id,
            action: "call.ended",
            endpoint: endRes.endpoint ?? "/api/v1/users/{id}/calls/{callId}",
            request_body: { maestro_call_id: maestroCallId, status: "ended" },
            response_status: endRes.status,
            response_body: endRes.data,
            duration_ms: 0,
            success: !!endRes.ok,
          });
          await pipelineLog(admin, {
            call_id, user_id: call.user_id, step: "call_ended",
            status: endRes.ok ? "success" : "error",
            error_message: endRes.ok ? undefined : `http_${endRes.status}`,
            payload: { maestro_call_id: maestroCallId, status: endRes.status },
          });
        } catch (e) {
          console.warn("[maestro-cdr] mark ended failed", e);
          await pipelineLog(admin, {
            call_id, user_id: call.user_id, step: "call_ended", status: "error",
            error_message: (e as Error)?.message ?? "mark_ended_failed",
          }).catch(() => {});
        }
      }


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
    await pipelineLog(admin, {
      call_id, user_id: call.user_id, step: "cdr_sync", status: "error", duration_ms: ms,
      correlation_id: call.id, entity_type: "call", entity_id: call.ns_call_id ?? call.id,
      endpoint: res.endpoint, http_status: res.status, error_message: failure.error,
      payload: { broker_id: auth.brokerId, client_id: maestroClientId, response: res.data ?? null },
    });
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
