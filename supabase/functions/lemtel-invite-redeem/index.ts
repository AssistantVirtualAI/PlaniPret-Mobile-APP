// Public endpoint: redeem a Lemtel softphone invite token to fetch credentials.
// GET ?token=...&reveal=0|1
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Cache-Control": "no-store",
  "X-Robots-Tag": "noindex, nofollow",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const SIP_DOMAIN_DEFAULT = "lemtel.lemtel.tel";
const WSS_URL = "wss://pbxnode.lemtel.tel:7443";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const url = new URL(req.url);
    const token = url.searchParams.get("token") || "";
    const reveal = url.searchParams.get("reveal") === "1";
    if (!token || token.length < 16) return json({ error: "INVALID_TOKEN" }, 400);

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data: invite, error: invErr } = await admin
      .from("lemtel_softphone_invites")
      .select("id, softphone_user_id, organization_id, email, expires_at, view_count, revoked_at, consumed_at")
      .eq("token", token)
      .maybeSingle();
    if (invErr || !invite) return json({ error: "NOT_FOUND" }, 404);
    if (invite.revoked_at) return json({ error: "REVOKED" }, 410);
    if (new Date(invite.expires_at).getTime() < Date.now()) {
      return json({ error: "EXPIRED", expires_at: invite.expires_at }, 410);
    }

    const { data: spu, error: spuErr } = await admin
      .from("pbx_softphone_users")
      .select("id, extension, display_name, sip_domain, sip_password")
      .eq("id", invite.softphone_user_id)
      .maybeSingle();
    if (spuErr || !spu) return json({ error: "USER_NOT_FOUND" }, 404);

    const domain = spu.sip_domain || SIP_DOMAIN_DEFAULT;
    const masked = spu.sip_password ? "•".repeat(Math.min(spu.sip_password.length, 16)) : "";

    // Update view counters
    await admin.from("lemtel_softphone_invites").update({
      view_count: (invite.view_count || 0) + 1,
      last_viewed_at: new Date().toISOString(),
      ...(reveal ? { consumed_at: new Date().toISOString() } : {}),
    }).eq("id", invite.id);

    const payload: any = {
      ok: true,
      display_name: spu.display_name,
      extension: spu.extension,
      domain,
      wss_url: WSS_URL,
      email: invite.email,
      expires_at: invite.expires_at,
      masked_password: masked,
    };
    if (reveal) {
      payload.password = spu.sip_password;
      payload.qr_ava = JSON.stringify({
        v: 1, type: "ava-softphone",
        domain, ext: spu.extension, password: spu.sip_password, wss: WSS_URL,
        displayName: spu.display_name, email: invite.email,
      });
      payload.qr_sip = `sip:${spu.extension}:${spu.sip_password}@${domain}`;
    }
    return json(payload);
  } catch (e: any) {
    return json({ error: "INTERNAL", detail: e?.message || String(e) }, 500);
  }
});
