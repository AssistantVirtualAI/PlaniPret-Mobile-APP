// Links a Planiprêt broker's Microsoft 365 identity to their NS-API extension.
// 1. If body.extension provided -> validate it against NS-API and link.
// 2. Otherwise lookup NS users by ms365_email and auto-link on match.
// Also fetches SIP device credentials for the mobile softphone.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, getEnv, nsFetch } from "../_shared/planipret-ns.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const userClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: claimsData } = await userClient.auth.getClaims(authHeader.replace("Bearer ", ""));
    const userId = claimsData?.claims?.sub as string | undefined;
    if (!userId) return j({ error: "Unauthorized" }, 401);

    const body = await req.json().catch(() => ({} as any));
    const manualExt = body?.extension ? String(body.extension).trim() : null;

    const { data: profile } = await admin.from("planipret_profiles")
      .select("id, user_id, ms365_email, ns_domain")
      .eq("user_id", userId).maybeSingle();
    if (!profile) return j({ error: "profile not found" }, 404);

    const domain = profile.ns_domain || getEnv().NS_DEFAULT_DOMAIN;
    if (!domain) return j({ error: "ns_domain missing" }, 412);

    let nsUser: any = null;

    if (manualExt) {
      const r = await nsFetch(`/domains/${encodeURIComponent(domain)}/users/${encodeURIComponent(manualExt)}`);
      if (!r.ok) return j({ error: `extension ${manualExt} introuvable`, status: r.status }, 404);
      nsUser = await r.json();
    } else if (profile.ms365_email) {
      const r = await nsFetch(`/domains/${encodeURIComponent(domain)}/users`);
      if (!r.ok) return j({ error: "ns users list failed", status: r.status, linked: false }, 200);
      const list = await r.json();
      const arr: any[] = Array.isArray(list) ? list : (list?.users ?? list?.data ?? []);
      const target = profile.ms365_email.toLowerCase();
      nsUser = arr.find((u) => (u?.email || u?.["email-address"] || "").toLowerCase() === target) ?? null;
      if (!nsUser) return j({ linked: false, reason: "no_match", need_manual: true });
    } else {
      return j({ linked: false, reason: "no_ms_email", need_manual: true });
    }

    const ext = nsUser.user ?? nsUser.extension ?? manualExt;
    const sipUsername = nsUser["login-username"] ?? nsUser.username ?? ext;

    // Try to fetch a SIP device for credentials
    let sip: { username?: string; password?: string; proxy?: string } = {};
    try {
      const dr = await nsFetch(`/domains/${encodeURIComponent(domain)}/users/${encodeURIComponent(ext)}/devices`);
      if (dr.ok) {
        const ds = await dr.json();
        const devs: any[] = Array.isArray(ds) ? ds : (ds?.devices ?? ds?.data ?? []);
        const dev = devs[0];
        if (dev) {
          sip.username = dev["authentication-name"] ?? dev.username ?? sipUsername;
          sip.password = dev["authentication-password"] ?? dev.password;
          sip.proxy = dev["sip-proxy"] ?? undefined;
        }
      }
    } catch (_) { /* ignore */ }

    await admin.from("planipret_profiles").update({
      ns_extension: ext,
      extension: ext,
      ns_domain: domain,
      ns_sip_username: sipUsername,
      ns_linked: true,
      ns_linked_at: new Date().toISOString(),
      sip_username: sip.username ?? sipUsername,
      sip_password: sip.password ?? null,
      sip_domain: domain,
      sip_proxy: sip.proxy ?? null,
    }).eq("user_id", userId);

    return j({ linked: true, extension: ext, domain, sip_username: sip.username ?? sipUsername });
  } catch (e) {
    return j({ error: (e as Error).message }, 500);
  }
});

function j(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
