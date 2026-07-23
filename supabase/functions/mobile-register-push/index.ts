// mobile-register-push: persist the device push token for the authenticated user.
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

    const body = await req.json().catch(() => ({}));
    const token = String(body.token || "");
    const platformRaw = String(body.platform || "").toLowerCase();
    const platform = ["ios", "android", "web"].includes(platformRaw) ? platformRaw : "web";
    const extension = String(body.extension || "");
    if (!token || !platform) return json({ error: "missing_fields" }, 400);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { error: upErr } = await admin
      .from("mobile_push_tokens")
      .upsert(
        {
          user_id: u.user.id,
          token,
          platform,
          extension: extension || null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,token" },
      );
    if (upErr) console.warn("[mobile-register-push] upsert failed", upErr.message);

    const { data: sp } = await sb.from("pbx_softphone_users")
      .select("organization_id").eq("portal_user_id", u.user.id).maybeSingle();

    await sb.from("audit_logs").insert({
      organization_id: sp?.organization_id || null,
      user_id: u.user.id,
      action: "mobile_push_token_registered",
      resource_type: "mobile_device",
      metadata: { platform, token_preview: token.slice(0, 12), extension },
    });

    return json({ ok: true });
  } catch (e) {
    return json({ error: String((e as Error).message || e) }, 500);
  }
});
