// mobile-settings-forwarding: toggle / set call forwarding for the current softphone user.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

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
    const { data: u } = await sb.auth.getUser();
    if (!u?.user) return json({ error: "unauthorized" }, 401);
    const { data: __mobileAllowed } = await sb.rpc("my_platform_access_allowed", { _platform: "mobile" });
    if (__mobileAllowed === false) return json({ error: "MOBILE_ACCESS_DISABLED", message: "Mobile access not granted by Lemtel administrators." }, 403);

    const { target } = await req.json().catch(() => ({}));
    const normalized = typeof target === "string" ? target.trim() : "";
    const enabled = normalized.length > 0;
    if (enabled && !/^\+?[0-9][0-9 .()\-]{5,24}$/.test(normalized)) {
      return json({ error: "invalid_forwarding_target" }, 400);
    }

    const { data: sp } = await sb.from("pbx_softphone_users").select("organization_id, extension, forward_to").eq("portal_user_id", u.user.id).maybeSingle();
    const { error } = await sb.from("pbx_softphone_users")
      .update({ forward_enabled: enabled, forward_to: enabled ? normalized : null, updated_at: new Date().toISOString() })
      .eq("portal_user_id", u.user.id);
    if (error) return json({ error: error.message }, 400);
    try {
      await sb.from("audit_logs").insert({ organization_id: sp?.organization_id, user_id: u.user.id, action: "mobile_forwarding_updated", resource_type: "pbx_softphone", metadata: { extension: sp?.extension, previous: sp?.forward_to || null, next: enabled ? normalized : null } });
    } catch { /* non-fatal */ }

    return json({ ok: true, forwarding: enabled ? normalized : null });
  } catch (e) {
    console.error("[mobile-settings-forwarding]", e);
    return json({ error: String((e as Error).message || e) }, 500);
  }
});
