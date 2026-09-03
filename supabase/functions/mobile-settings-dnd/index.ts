// mobile-settings-dnd: toggle do-not-disturb for the current softphone user.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { nsFetch } from "../_shared/planipret-ns.ts";

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

    const { enabled } = await req.json().catch(() => ({}));
    const next = !!enabled;
    const { data: sp } = await sb.from("pbx_softphone_users").select("organization_id, extension, dnd_enabled").eq("portal_user_id", u.user.id).maybeSingle();
    const { data: profile } = await sb.from("planipret_profiles")
      .select("id, user_id, extension, ns_extension, ns_domain, dnd_enabled")
      .eq("user_id", u.user.id)
      .maybeSingle();

    const { error } = await sb.from("pbx_softphone_users")
      .update({ dnd_enabled: next, updated_at: new Date().toISOString() })
      .eq("portal_user_id", u.user.id);
    if (error) return json({ error: error.message }, 400);
    if (profile?.id) {
      await sb.from("planipret_profiles")
        .update({ dnd_enabled: next, updated_at: new Date().toISOString() })
        .eq("id", profile.id);
    }

    let nsStatus: number | null = null;
    let nsOk = false;
    const nsExt = profile?.extension ?? profile?.ns_extension ?? sp?.extension;
    const nsDomain = profile?.ns_domain ?? Deno.env.get("NS_DEFAULT_DOMAIN") ?? "planipret.ca";
    if (nsExt) {
      const nsRes = await nsFetch(
        `/domains/${encodeURIComponent(nsDomain)}/users/${encodeURIComponent(String(nsExt))}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            "do-not-disturb": next ? "yes" : "no",
            "do-not-disturb-enabled": next ? "yes" : "no",
            dnd: next ? "yes" : "no",
          }),
        },
        { functionName: "mobile-settings-dnd" },
      );
      nsStatus = nsRes.status;
      nsOk = nsRes.ok;
      await nsRes.text().catch(() => "");
    }
    try {
      await sb.from("audit_logs").insert({ organization_id: sp?.organization_id, user_id: u.user.id, action: "mobile_dnd_updated", resource_type: "pbx_softphone", metadata: { extension: sp?.extension, previous: !!sp?.dnd_enabled, next } });
    } catch { /* non-fatal */ }

    return json({ ok: true, doNotDisturb: next, ns: { ok: nsOk, status: nsStatus } });
  } catch (e) {
    console.error("[mobile-settings-dnd]", e);
    return json({ error: String((e as Error).message || e) }, 500);
  }
});
