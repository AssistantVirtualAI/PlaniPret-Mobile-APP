// mobile-recordings: list of calls that have recordings.
// - Admins (domain admins) see all recordings for the organization/domain.
// - Regular users see only recordings tied to their own extension.
// - Optional ?extension=NNN filter (admin-only).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "unauthorized" }, 401);
    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data: u } = await sb.auth.getUser();
    if (!u?.user) return json({ error: "unauthorized" }, 401);

    const { data: __mobileAllowed } = await sb.rpc("my_platform_access_allowed", { _platform: "mobile" });
    if (__mobileAllowed === false) return json({ error: "MOBILE_ACCESS_DISABLED", message: "Mobile access not granted." }, 403);

    const { data: sp } = await admin.from("pbx_softphone_users")
      .select("organization_id, extension, domain_uuid")
      .eq("portal_user_id", u.user.id).maybeSingle();
    if (!sp?.organization_id) return json({ items: [], noSoftphone: true });

    const url = new URL(req.url);
    const days = Math.min(Math.max(Number(url.searchParams.get("days")) || 7, 1), 30);
    const sinceDate = new Date();
    sinceDate.setDate(sinceDate.getDate() - days);
    sinceDate.setHours(0, 0, 0, 0);
    const since = sinceDate.toISOString();
    const ext = sp.extension;
    if (!ext) return json([]);

    // Mobile app is ALWAYS scoped to the current broker's extension — never
    // leak recordings from other brokers regardless of admin status.
    let q = admin.from("pbx_call_records")
      .select("id, pbx_uuid, caller_name, caller_number, destination_number, extension, start_at, duration_seconds, transcribed, ai_summary, recording_path, recording_name, recording_url, domain_uuid, domain_name, organization_id")
      .eq("organization_id", sp.organization_id)
      .eq("has_recording", true)
      .gte("start_at", since)
      .or(`extension.eq.${ext},caller_number.eq.${ext},source_number.eq.${ext},destination_number.eq.${ext}`);

    if (sp.domain_uuid) q = q.or(`domain_uuid.eq.${sp.domain_uuid},domain_uuid.is.null`);


    const { data: rows, error } = await q.order("start_at", { ascending: false }).limit(200);
    if (error) throw error;

    const out = (rows ?? []).map((r: any) => ({
      id: r.id,
      from: r.caller_number || "",
      to: r.destination_number || "",
      extension: r.extension || undefined,
      customer: r.caller_name || undefined,
      startedAt: r.start_at,
      durationSec: Number(r.duration_seconds || 0),
      hasTranscript: !!r.transcribed,
      summary: r.ai_summary || undefined,
      pbx_uuid: r.pbx_uuid || undefined,
      xml_cdr_uuid: r.pbx_uuid || r.id,
      record_path: r.recording_path || undefined,
      record_name: r.recording_name || undefined,
      recording_url: r.recording_url || undefined,
      domain_uuid: r.domain_uuid || undefined,
      domain_name: r.domain_name || undefined,
      organization_id: r.organization_id || undefined,
    }));
    return json(out);
  } catch (e: any) {
    console.error("[mobile-recordings]", e);
    return json({ error: e?.message || "error" }, 500);
  }
});
