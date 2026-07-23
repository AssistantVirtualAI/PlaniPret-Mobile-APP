// Cron-invoked PBX live sync. Public (verify_jwt = false), idempotent.
// pg_cron hits this every 2 minutes; it forwards a service-role call to
// fusionpbx-proxy `sync-all` so all PBX resources stay fresh.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const LEMTEL_ORG = "71755d33-ed64-4ad5-a828-61c9d2029eb7";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // AuthZ: require shared cron secret OR service-role bearer.
  const cronSecret = Deno.env.get("CRON_PBX_SECRET") ?? Deno.env.get("CRON_SECRET");
  const providedSecret = req.headers.get("x-cron-secret");
  const authHeader = req.headers.get("authorization") ?? "";
  const isServiceRole = authHeader === `Bearer ${SERVICE_ROLE}`;
  const isValidCron = !!cronSecret && providedSecret === cronSecret;
  if (!isServiceRole && !isValidCron) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Lock org to Lemtel — ignore client-supplied organization_id to prevent abuse.
  const orgId: string = LEMTEL_ORG;

  const t0 = Date.now();
  try {
    const callProxy = async (payload: Record<string, unknown>) => fetch(`${SUPABASE_URL}/functions/v1/fusionpbx-proxy`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SERVICE_ROLE}`,
        apikey: SERVICE_ROLE,
      },
      body: JSON.stringify({ organization_id: orgId, ...payload }),
    });

    // Lemtel extension 300 CDRs are clustered around offsets 12000-14500 in the
    // FusionPBX xml_cdr API (which orders by UUID, not date). New rows append
    // at the high end (14500+). We run three parallel sync passes per tick:
    //   1. Rolling cursor — broad catch-up across the full dataset.
    //   2. Priority window — covers the known ext-300 cluster (12000-14500).
    //   3. Recent tail — captures freshly-written CDRs (14500-17000).
    const [cdrRes, cdrPriorityRes, cdrTailRes, vmRes] = await Promise.all([
      callProxy({ action: "sync-cdrs", page_size: 500, max_pages: 4 }),
      callProxy({ action: "sync-cdrs", page_size: 500, max_pages: 5, start_offset: 12000 }),
      callProxy({ action: "sync-cdrs", page_size: 500, max_pages: 5, start_offset: 14500 }),
      callProxy({ action: "sync-voicemail-messages", params: { page_size: 250, max_pages: 1 } }),
    ]);
    const parse = async (r: Response) => {
      const text = await r.text();
      try { return { ok: r.ok, status: r.status, data: JSON.parse(text) }; }
      catch { return { ok: r.ok, status: r.status, data: text.slice(0, 500) }; }
    };
    const data = {
      cdrs: await parse(cdrRes),
      cdrs_priority: await parse(cdrPriorityRes),
      cdrs_tail: await parse(cdrTailRes),
      voicemails: await parse(vmRes),
    };
    // Manual/mobile refresh should never blank the app just because one PBX
    // resource failed. Return 200 when any sync lane succeeded; detailed per-lane
    // status remains in the payload for the sync log.
    const ok = data.cdrs.ok || data.cdrs_priority.ok || data.cdrs_tail.ok || data.voicemails.ok;
    return new Response(JSON.stringify({ ok, duration_ms: Date.now() - t0, data }), {
      status: ok ? 200 : 207,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String((e as Error).message) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
