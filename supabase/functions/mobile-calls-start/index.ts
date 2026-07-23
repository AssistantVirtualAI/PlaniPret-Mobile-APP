// mobile-calls-start: place an outbound call.
// Returns webrtc mode if user has SIP credentials; otherwise click-to-call via FusionPBX originate.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

const e164 = (n: string) => {
  const d = n.replace(/[^\d+]/g, "");
  if (d.startsWith("+")) return d;
  if (d.length === 10) return "+1" + d;
  if (d.length === 11 && d.startsWith("1")) return "+" + d;
  return d;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "unauthorized" }, 401);

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: u } = await sb.auth.getUser();
    if (!u?.user) return json({ error: "unauthorized" }, 401);
    const { data: __mobileAllowed } = await sb.rpc("my_platform_access_allowed", { _platform: "mobile" });
    if (__mobileAllowed === false) return json({ error: "MOBILE_ACCESS_DISABLED", message: "Mobile access not granted by Lemtel administrators." }, 403);

    const { to, mode: requestedMode } = await req.json().catch(() => ({}));
    if (!to || typeof to !== "string") return json({ error: "missing_to" }, 400);

    const target = e164(to);

    const { data: sp } = await admin.from("pbx_softphone_users")
      .select("organization_id, extension, sip_domain, domain_uuid, dnd_enabled")
      .eq("portal_user_id", u.user.id).maybeSingle();
    if (!sp) return json({ error: "NO_SOFTPHONE_ACCOUNT" }, 404);
    if (!sp.extension || !sp.sip_domain) return json({ error: "NO_DIAL_EXTENSION", message: "No extension/domain is assigned to this mobile account." }, 403);

    // Log call attempt
    const { data: rec } = await admin.from("pbx_call_records").insert({
      organization_id: sp.organization_id,
      domain_uuid: sp.domain_uuid,
      extension: sp.extension,
      direction: "outbound",
      caller_number: sp.extension,
      destination_number: target,
      destination: target,
      call_status: "initiated",
      start_at: new Date().toISOString(),
    }).select("id").single();

    // If client requested click-to-call (or it's the only available path),
    // route through fusionpbx-proxy which handles the PBX originate command
    // using the privileged service credentials.
    if (requestedMode === "click_to_call") {
      const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
      const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const proxyRes = await fetch(`${SUPABASE_URL}/functions/v1/fusionpbx-proxy`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${SERVICE_KEY}`,
          "apikey": SERVICE_KEY,
        },
        body: JSON.stringify({
          action: "originate-click-to-call",
          from_extension: sp.extension,
          destination: target,
          domain_name: sp.sip_domain,
          domain_uuid: sp.domain_uuid,
          organization_id: sp.organization_id,
        }),
      });
      const proxyBody = await proxyRes.json().catch(() => ({}));
      if (!proxyRes.ok || proxyBody?.ok === false || proxyBody?.error) {
        const reason = proxyBody?.error || proxyBody?.message || `proxy_status_${proxyRes.status}`;
        return json({ error: "CLICK_TO_CALL_FAILED", message: String(reason) }, 502);
      }
      return json({ callId: rec?.id || `call-${Date.now()}`, mode: "click_to_call", to: target, from: sp.extension });
    }

    // Default: client-side WebRTC INVITE via JsSIP.
    return json({ callId: rec?.id || `call-${Date.now()}`, mode: "webrtc", to: target, from: sp.extension });

  } catch (e) {
    console.error("[mobile-calls-start]", e);
    return json({ error: String((e as Error).message || e) }, 500);
  }
});
