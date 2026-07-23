// mobile-me: returns the current user's softphone identity + permissions.
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
    if (__mobileAllowed === false) return json({ error: "MOBILE_ACCESS_DISABLED", message: "Mobile access not granted by Lemtel administrators." }, 403);

    // Use admin client for the softphone lookup — the user owns this row
    // and we hit intermittent RLS misses with the user-scoped client.
    const [{ data: profile }, { data: sp }] = await Promise.all([
      sb.from("profiles").select("full_name, email, avatar_url").eq("id", u.user.id).maybeSingle(),
      admin.from("pbx_softphone_users")
        .select("organization_id, client_id, extension_id, extension, sip_domain, display_name, forward_enabled, forward_to, dnd_enabled, status, status_updated_at, updated_at, wss_url, app_access_enabled, mobile_access_enabled")
        .eq("portal_user_id", u.user.id)
        .maybeSingle(),
    ]);


    if (!sp) {
      // Graceful fallback: portal user without a provisioned softphone extension.
      // Return a minimal identity so the mobile shell can render and surface a setup hint
      // instead of blanking out with a 404.
      console.warn("[mobile-me] no pbx_softphone_users row for user", u.user.id);
      const { data: anyMember } = await admin
        .from("org_members").select("org_id, role").eq("user_id", u.user.id).limit(1).maybeSingle();
      const orgId = anyMember?.org_id || null;
      const { data: org2 } = orgId
        ? await admin.from("organizations").select("name, sip_domain, fusionpbx_domain_uuid").eq("id", orgId).maybeSingle()
        : { data: null as any };
      const portalUrl = Deno.env.get("AVA_PORTAL_URL") || "https://avastatistic.ca";
      return json({
        user: { id: u.user.id, name: profile?.full_name || u.user.email || "User", email: profile?.email || u.user.email || "", avatarUrl: profile?.avatar_url || undefined },
        organization: { id: orgId, name: org2?.name || "Workspace", sipDomain: org2?.sip_domain || "", fusionpbxDomainUuid: org2?.fusionpbx_domain_uuid || undefined, portalUrl },
        domain: { organizationId: orgId, sipDomain: org2?.sip_domain || "", fusionpbxDomainUuid: org2?.fusionpbx_domain_uuid || undefined, portalUrl },
        extension: { number: "", displayName: "", sipDomain: org2?.sip_domain || "" },
        access: { app: true, mobile: true },
        role: anyMember?.role === "master_admin" || anyMember?.role === "ava_admin" ? "super_admin" : "agent",
        dataScope: "extension_user",
        permissions: { admin: false, canManageNumbers: false, canManageAgents: false, canManageUsers: false, canManageRouting: false, canViewDomainReports: false },
        status: { sipState: "offline", doNotDisturb: false, forwarding: null, updatedAt: new Date().toISOString() },
        noSoftphone: true,
        setupHint: "Aucune extension softphone n'est rattachée à ce compte. Demandez à votre administrateur de provisionner une extension dans FusionPBX.",
      });
    }
    if (sp.app_access_enabled === false || sp.mobile_access_enabled === false) {
      return json({ error: "MOBILE_ACCESS_DISABLED", message: "Your administrator has disabled access to the mobile app." }, 403);
    }

    const { data: org } = await admin.from("organizations").select("name, sip_domain, fusionpbx_domain_uuid").eq("id", sp.organization_id).maybeSingle();
    const { data: client } = sp.client_id
      ? await admin.from("clients").select("id, name").eq("id", sp.client_id).maybeSingle()
      : { data: null };

    const { data: roleRow } = await admin
      .from("user_roles").select("role")
      .eq("user_id", u.user.id).eq("organization_id", sp.organization_id).maybeSingle();
    const { data: orgMember } = await admin
      .from("org_members").select("role, can_manage_extensions, can_listen_calls")
      .eq("user_id", u.user.id).eq("org_id", sp.organization_id).maybeSingle();
    const { data: superAdmin } = await admin.rpc("is_super_admin", { _user_id: u.user.id }).maybeSingle().catch(() => ({ data: false } as any));
    const { data: lemtelAdmin } = await admin.rpc("is_lemtel_admin", { _user_id: u.user.id }).maybeSingle().catch(() => ({ data: false } as any));
    const orgMemberRole = orgMember?.role || "";
    const role = superAdmin || lemtelAdmin || orgMemberRole === "master_admin" || orgMemberRole === "ava_admin"
      ? "super_admin"
      : orgMemberRole === "customer_admin" || orgMemberRole === "reseller_admin"
        ? "org_admin"
        : (roleRow?.role || (orgMemberRole === "agent" ? "agent" : "agent"));
    const orgMemberCanAdmin = !!orgMember && (["master_admin", "ava_admin", "reseller_admin", "customer_admin"].includes(orgMemberRole) || orgMember.can_manage_extensions || orgMember.can_listen_calls);
    const isDomainAdmin = role === "org_admin" || role === "super_admin" || role === "manager" || orgMemberCanAdmin;
    const canManageRouting = role === "org_admin" || role === "super_admin" || role === "manager" || !!orgMember?.can_manage_extensions;
    const sipDomain = sp.sip_domain || org?.sip_domain || "";
    const portalUrl = Deno.env.get("AVA_PORTAL_URL") || "https://avastatistic.ca";

    return json({
      user: { id: u.user.id, name: profile?.full_name || u.user.email || "User", email: profile?.email || u.user.email || "", avatarUrl: profile?.avatar_url || undefined },
      organization: { id: sp.organization_id, name: org?.name || "Workspace", sipDomain, fusionpbxDomainUuid: org?.fusionpbx_domain_uuid || undefined, portalUrl, wssUrl: sp.wss_url || undefined },
      client: client ? { id: client.id, name: client.name } : undefined,
      domain: { organizationId: sp.organization_id, sipDomain, fusionpbxDomainUuid: org?.fusionpbx_domain_uuid || undefined, portalUrl, wssUrl: sp.wss_url || undefined },
      extension: { number: sp.extension, displayName: sp.display_name || "", sipDomain, id: sp.extension_id || undefined },
      access: { app: sp.app_access_enabled !== false, mobile: sp.mobile_access_enabled !== false },
      role,
      dataScope: isDomainAdmin ? "domain_admin" : "extension_user",
      permissions: { admin: isDomainAdmin, canManageNumbers: isDomainAdmin, canManageAgents: isDomainAdmin, canManageUsers: role === "org_admin" || role === "super_admin", canManageRouting, canViewDomainReports: isDomainAdmin },
      status: {
        sipState: sp.status === "registered" ? "registered" : sp.status === "connecting" ? "connecting" : "offline",
        doNotDisturb: !!sp.dnd_enabled,
        forwarding: sp.forward_enabled ? sp.forward_to : null,
        updatedAt: sp.status_updated_at || sp.updated_at || undefined,
      },
    });
  } catch (e) {
    console.error("[mobile-me]", e);
    return json({ error: String((e as Error).message || e) }, 500);
  }
});
