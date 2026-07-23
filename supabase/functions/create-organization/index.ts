import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const body = await req.json();
    const authHeader = req.headers.get("Authorization") || "";
    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return new Response(JSON.stringify({ error: "unauthenticated" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    // permission check: master admin OR has can_manage_resellers
    const { data: isMaster } = await admin.rpc("is_master_admin", { _user_id: user.id });
    let allowed = !!isMaster;
    if (!allowed) {
      const { data: m } = await admin.from("org_members").select("can_manage_resellers").eq("user_id", user.id).eq("can_manage_resellers", true).limit(1);
      allowed = (m || []).length > 0;
    }
    if (!allowed) return new Response(JSON.stringify({ error: "forbidden" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    // 1. Provision FusionPBX domain (optional, best-effort)
    let fusionpbx_domain_uuid = body.fusionpbx_domain_uuid || null;
    let fusionpbx_domain_name = body.fusionpbx_mode === "lemtel" ? `${body.slug}.lemtel.tel` : null;
    if (body.fusionpbx_mode === "lemtel") {
      try {
        const fpbxRes = await admin.functions.invoke("fusionpbx-proxy", {
          body: { action: "createDomain", domain_name: fusionpbx_domain_name },
        });
        if (fpbxRes.data?.domain_uuid) fusionpbx_domain_uuid = fpbxRes.data.domain_uuid;
      } catch (e) {
        console.warn("FusionPBX domain provisioning skipped:", e);
      }
    }

    // 2. Determine parent + level
    const parentId = body.parent_org_id || "71755d33-ed64-4ad5-a828-61c9d2029eb7";
    const { data: parent } = await admin.from("organizations").select("org_level,root_org_id,id,org_type").eq("id", parentId).maybeSingle();
    const orgLevel = (parent?.org_level ?? 1) + 1;
    const rootId = parent?.root_org_id || parent?.id || parentId;

    // 2b. If the creator is a reseller_admin, set reseller_id to their org
    let resellerId: string | null = body.reseller_id || null;
    if (!resellerId && !isMaster) {
      const { data: resMembership } = await admin
        .from("org_members")
        .select("org_id")
        .eq("user_id", user.id)
        .eq("role", "reseller_admin")
        .limit(1)
        .maybeSingle();
      if (resMembership?.org_id) resellerId = resMembership.org_id;
    }
    if (!resellerId && parent?.org_type === "reseller") resellerId = parent.id;

    // 3. Insert organization
    const { data: org, error: orgErr } = await admin
      .from("organizations")
      .insert({
        name: body.name,
        slug: body.slug,
        org_type: body.org_type,
        org_level: orgLevel,
        parent_org_id: parentId,
        reseller_id: resellerId,
        root_org_id: rootId,
        billing_email: body.billing_email,
        billing_plan: body.billing_plan,
        max_extensions: body.max_extensions,
        max_dids: body.max_dids,
        max_storage_gb: body.max_storage_gb,
        max_resellers: body.can_create_resellers ? body.max_resellers : 0,
        brand_app_name: body.brand_app_name || body.name,
        brand_name: body.brand_app_name || body.name,
        brand_primary_color: body.brand_primary_color,
        brand_accent_color: body.brand_accent_color,
        brand_portal_domain: body.brand_portal_domain || null,
        brand_support_email: body.brand_support_email,
        brand_support_phone: body.brand_support_phone,
        brand_website: body.brand_website,
        fusionpbx_domain_uuid,
        fusionpbx_domain_name,
        fusionpbx_server_url: body.fusionpbx_server_url || null,
        status: "active",
        created_by: user.id,
      })
      .select()
      .single();
    if (orgErr) throw orgErr;

    // 4. Create admin user
    let adminUserId: string | null = null;
    let tempPassword: string | null = null;
    if (body.admin_email) {
      tempPassword = "Lemtel-" + crypto.randomUUID().slice(0, 12);
      const { data: created, error: userErr } = await admin.auth.admin.createUser({
        email: body.admin_email,
        password: tempPassword,
        email_confirm: true,
        user_metadata: {
          full_name: `${body.admin_first_name || ""} ${body.admin_last_name || ""}`.trim(),
        },
      });
      if (userErr) console.warn("admin user creation:", userErr.message);
      adminUserId = created?.user?.id || null;

      if (adminUserId) {
        const role = body.org_type === "reseller" ? "reseller_admin" : "customer_admin";
        await admin.from("org_members").insert({
          org_id: org.id,
          user_id: adminUserId,
          role,
          can_manage_users: true,
          can_manage_extensions: true,
          can_manage_billing: true,
          can_manage_resellers: body.org_type === "reseller",
          can_view_recordings: true,
          can_manage_ivr: true,
          can_manage_queues: true,
          can_listen_calls: true,
          can_export_data: true,
          can_white_label: body.org_type === "reseller",
          access_all_children: body.org_type === "reseller",
          invited_by: user.id,
        });
        await admin.from("organization_members").insert({
          user_id: adminUserId,
          organization_id: org.id,
          accepted_at: new Date().toISOString(),
        });
      }
    }

    // 5. Audit
    await admin.from("audit_logs").insert({
      organization_id: org.id,
      user_id: user.id,
      action: "create_organization",
      resource_type: "organizations",
      resource_id: org.id,
      org_id: org.id,
      metadata: { org_type: body.org_type, parent_org_id: parentId, admin_email: body.admin_email },
    });

    // 6. Welcome email (best-effort)
    if (body.send_welcome && body.admin_email && tempPassword) {
      try {
        await admin.functions.invoke("send-org-email", {
          body: {
            org_id: org.id,
            to: body.admin_email,
            template: "welcome",
            variables: {
              user_name: `${body.admin_first_name || ""}`.trim() || "there",
              brand_name: org.brand_name,
              portal_url: org.brand_portal_domain
                ? `https://${org.brand_portal_domain}`
                : `https://avastatistic.ca/org/${org.slug}/admin/dashboard`,
              temp_password: tempPassword,
              support_email: org.brand_support_email || "support@avastatistic.ca",
            },
          },
        });
      } catch (e) { console.warn("welcome email:", e); }
    }

    return new Response(JSON.stringify({ ok: true, organization: org, admin_user_id: adminUserId }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("create-organization error", e);
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
