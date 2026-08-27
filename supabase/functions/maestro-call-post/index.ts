// POST /functions/v1/maestro-call-post
// Single de-duplicated publisher used by the mobile app while a call is live.
// Body: { provider_call_id, number, direction, status?, started_at? }
//
// The mobile app used to POST directly to Maestro with its local SIP call id
// while the server CDR pipeline posted the same call with the NetSapiens id,
// producing duplicate rows in the Maestro Communications page. Both publishers
// now claim the same dedupe key here, so only the first one creates a record.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";
import {
  adminClient,
  corsHeaders,
  getMaestroConfig,
  json,
  maestroFetch,
  normalizePhone,
  telecomAuth,
} from "../_shared/maestro.ts";
import { callDedupeKey, claimCallPost, releaseClaim, saveClaimResult } from "../_shared/maestro-call-dedupe.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    if (!token) return json({ success: false, error: "unauthorized" }, 401);

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: userData } = await userClient.auth.getUser();
    const userId = userData?.user?.id ?? null;
    if (!userId) return json({ success: false, error: "unauthorized" }, 401);

    const payload = await req.json().catch(() => ({} as any));
    const providerCallId = String(payload?.provider_call_id ?? "").trim();
    const rawNumber = String(payload?.number ?? "").trim();
    const direction = payload?.direction === "outbound" ? "outbound" : "inbound";
    if (!providerCallId) return json({ success: false, error: "provider_call_id_required" }, 400);

    const admin = adminClient();
    const cfg = await getMaestroConfig(admin);
    const auth = await telecomAuth(admin, userId, false);
    if (!cfg.url || !cfg.key) return json({ success: false, error: "maestro_not_configured" }, 200);
    if (!auth.brokerId) return json({ success: false, error: "maestro_telecom_user_id_missing" }, 200);

    const dedupeKey = callDedupeKey({
      direction,
      remoteNumber: rawNumber,
      startedAt: payload?.started_at ?? Date.now(),
      fallback: providerCallId,
    });

    const claim = await claimCallPost(admin, {
      userId,
      dedupeKey,
      providerCallId,
      source: "mobile",
    });
    if (!claim.owner) {
      return json({ success: true, deduped: true, maestro_call_id: claim.maestroCallId });
    }

    const body: Record<string, unknown> = {
      provider_call_id: providerCallId,
      status: payload?.status ?? (direction === "outbound" ? "dialing" : "created"),
      direction,
    };
    if (direction === "inbound") {
      body.from_user_number = normalizePhone(rawNumber);
      body.to_user_id = Number(auth.brokerId);
    } else {
      body.to_user_number = normalizePhone(rawNumber);
    }

    const res = await maestroFetch(cfg, {
      method: "POST",
      path: `/api/v1/users/${encodeURIComponent(String(auth.brokerId))}/calls`,
      token: auth.token,
      machine: auth.machine,
      body,
      idempotencyKey: dedupeKey,
    }) as any;

    if (!res.ok && res.status !== 409) {
      await releaseClaim(admin, { userId, dedupeKey });
      console.error(`[maestro-call-post] failed status=${res.status}`, JSON.stringify(res.data ?? {}));
      return json({ success: false, status: res.status, error: "maestro_post_failed", details: res.data }, 200);
    }

    const maestroCallId = res.data?.call?.id ?? res.data?.id ?? res.data?.call_id ?? null;
    await saveClaimResult(admin, { userId, dedupeKey, maestroCallId: maestroCallId ? String(maestroCallId) : null });
    return json({ success: true, maestro_call_id: maestroCallId, deduped: false });
  } catch (e: any) {
    console.error("[maestro-call-post] fatal", e?.stack ?? e);
    return json({ success: false, error: e?.message ?? "server_error" }, 500);
  }
});
