import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Body = {
  name: string;
  slug?: string;
  timezone?: string;
  locale?: string;
  admins?: { email: string }[];
  pbx?: { domain_uuid?: string; sip_domain?: string; extension_range_start?: string; extension_range_end?: string };
  branding?: { primary_color?: string; logo_url?: string; subdomain?: string };
  trigger_first_sync?: boolean;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const auth = req.headers.get("Authorization") ?? "";
    const token = auth.replace(/^Bearer\s+/i, "");
    if (!token) return json({ error: "unauthenticated" }, 401);

    const url = Deno.env.get("SUPABASE_URL")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const userClient = createClient(url, anon, { global: { headers: { Authorization: `Bearer ${token}` } } });
    const { data: userData } = await userClient.auth.getUser();
    const user = userData?.user;
    if (!user) return json({ error: "unauthenticated" }, 401);

    const admin = createClient(url, service);
    const { data: isSA } = await admin.rpc("is_super_admin", { _user_id: user.id });
    const { data: isLA } = await admin.rpc("is_lemtel_admin", { _user_id: user.id });
    if (!isSA && !isLA) return json({ error: "forbidden" }, 403);

    const body = (await req.json()) as Body;
    if (!body.name) return json({ error: "name required" }, 400);

    const baseSlug = (body.slug || body.name).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "org";
    let slug = baseSlug;
    let n = 0;
    while (true) {
      const { data: existing } = await admin.from("organizations").select("id").eq("slug", slug).maybeSingle();
      if (!existing) break;
      n++; slug = `${baseSlug}-${n}`;
    }

    const orgInsert: Record<string, unknown> = {
      name: body.name,
      slug,
      onboarding_completed: true,
      is_active: true,
    };
    if (body.timezone) orgInsert.timezone = body.timezone;
    if (body.locale) orgInsert.locale = body.locale;
    if (body.branding?.primary_color) orgInsert.primary_color = body.branding.primary_color;
    if (body.branding?.logo_url) orgInsert.logo_url = body.branding.logo_url;
    if (body.branding?.subdomain) orgInsert.subdomain = body.branding.subdomain;

    const { data: org, error: orgErr } = await admin.from("organizations").insert(orgInsert).select("id, slug").single();
    if (orgErr) return json({ error: `org create: ${orgErr.message}` }, 500);

    await admin.from("billing_config").insert({ organization_id: org.id, plan_tier: "free", subscription_status: "trialing", trial_ends_at: new Date(Date.now() + 14 * 86400 * 1000).toISOString() });

    const invited: string[] = [];
    for (const a of body.admins ?? []) {
      if (!a.email) continue;
      const { data: existing } = await admin.from("profiles").select("id").ilike("email", a.email).maybeSingle();
      let uid = existing?.id;
      if (!uid) {
        const { data: inv } = await admin.auth.admin.inviteUserByEmail(a.email);
        uid = inv?.user?.id;
      }
      if (uid) {
        await admin.from("organization_members").upsert({ user_id: uid, organization_id: org.id, accepted_at: new Date().toISOString() });
        await admin.from("user_roles").upsert({ user_id: uid, organization_id: org.id, role: "org_admin" });
        invited.push(a.email);
      }
    }

    if (body.pbx?.sip_domain || body.pbx?.domain_uuid) {
      await admin.from("organizations").update({
        fusionpbx_domain_uuid: body.pbx.domain_uuid ?? null,
        sip_domain: body.pbx.sip_domain ?? null,
      }).eq("id", org.id);
    }

    let syncTriggered = false;
    if (body.trigger_first_sync) {
      try {
        await fetch(`${url}/functions/v1/pbx-sync-extensions`, {
          method: "POST",
          headers: { Authorization: `Bearer ${service}`, "Content-Type": "application/json" },
          body: JSON.stringify({ organization_id: org.id }),
        });
        syncTriggered = true;
      } catch (_) { /* ignore */ }
    }

    const { data: isolation } = await admin.rpc("verify_tenant_isolation", { _org_id: org.id });

    return json({ ok: true, organization_id: org.id, slug: org.slug, invited, sync_triggered: syncTriggered, isolation });
  } catch (e) {
    return json({ error: String(e?.message ?? e) }, 500);
  }
});

function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
