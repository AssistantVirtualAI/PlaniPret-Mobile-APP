// Multi-tenant extension management: reset SIP password, link email account,
// send welcome email. Works for ANY organization/domain (super_admin or
// org admin/owner) — not restricted to Lemtel.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

function genPwd(len = 20) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

async function requireOrgAdmin(admin: any, uid: string, orgId: string): Promise<boolean> {
  const { data: isSuper } = await admin.rpc("is_super_admin", { _user_id: uid });
  if (isSuper) return true;
  // Fall back to has_role admin/owner for that org
  for (const role of ["owner", "admin"]) {
    const { data: has } = await admin.rpc("has_role", { _user_id: uid, _org_id: orgId, _role: role });
    if (has) return true;
  }
  return false;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    const APP_ORIGIN = Deno.env.get("APP_ORIGIN") || "https://avastatistic.ca";

    const auth = req.headers.get("Authorization") || "";
    if (!auth) return json({ error: "unauthorized" }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE);
    const userClient = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: auth } } });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: "unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));
    const action: string = body?.action;
    const orgId: string = body?.organization_id;
    const extension: string = String(body?.extension || "");
    if (!action || !orgId || !extension) return json({ error: "MISSING_PARAMS" }, 400);

    if (!(await requireOrgAdmin(admin, user.id, orgId))) return json({ error: "forbidden" }, 403);

    // Load extension row
    const { data: extRow } = await admin
      .from("pbx_extensions")
      .select("id, pbx_uuid, extension, effective_cid_name, description, organization_id")
      .eq("organization_id", orgId).eq("extension", extension).maybeSingle();
    if (!extRow) return json({ error: "EXTENSION_NOT_FOUND" }, 404);

    if (action === "reset-sip-password") {
      const newPwd = body?.password || genPwd(20);
      // Push to FusionPBX via pbx-write (audit + mirror)
      const wr = await admin.functions.invoke("pbx-write", {
        body: {
          organizationId: orgId, action: "update-extension",
          params: { extension_uuid: extRow.pbx_uuid, extension, password: newPwd },
          objectType: "pbx_extensions", objectPbxUuid: extRow.pbx_uuid,
        },
      });
      if (wr.error || (wr.data as any)?.ok === false) {
        const { error: pErr } = await admin.functions.invoke("fusionpbx-proxy", {
          body: { action: "update-extension", organization_id: orgId,
            params: { extension_uuid: extRow.pbx_uuid, extension, password: newPwd } },
        });
        if (pErr) return json({ error: "PBX_UPDATE_FAILED", detail: pErr.message }, 502);
      }
      await admin.from("pbx_softphone_users").update({ sip_password: newPwd, updated_at: new Date().toISOString() })
        .eq("organization_id", orgId).eq("extension", extension);
      // Optional: also rotate portal login password if linked
      const { data: spu } = await admin.from("pbx_softphone_users")
        .select("portal_user_id").eq("organization_id", orgId).eq("extension", extension).maybeSingle();
      if (spu?.portal_user_id && body?.sync_portal_password) {
        await admin.auth.admin.updateUserById(spu.portal_user_id, { password: newPwd });
      }
      await admin.from("audit_logs").insert({
        organization_id: orgId, user_id: user.id, action: "extension_password_reset",
        resource_type: "pbx_extensions", metadata: { extension },
      });
      return json({ ok: true, extension, sip_password: newPwd });
    }

    if (action === "link-email") {
      const email = String(body?.email || "").trim().toLowerCase();
      if (!email) return json({ error: "MISSING_EMAIL" }, 400);
      const createIfMissing = body?.create_if_missing !== false;
      const initialPassword: string | undefined = body?.initial_password || undefined;

      // Find or create auth user
      let authUserId: string | null = null;
      const { data: existing } = await admin.from("profiles").select("id").eq("email", email).maybeSingle();
      if (existing?.id) {
        authUserId = existing.id;
      } else if (createIfMissing) {
        const pwd = initialPassword || genPwd(16);
        const { data: created, error: cErr } = await admin.auth.admin.createUser({
          email, password: pwd, email_confirm: true,
          user_metadata: { display_name: extRow.effective_cid_name || extRow.description || email, extension },
        });
        if (cErr) return json({ error: "CREATE_USER_FAILED", detail: cErr.message }, 500);
        authUserId = created.user?.id || null;
        // Ensure membership in the org (best-effort)
        if (authUserId) {
          await admin.from("organization_members").insert({
            organization_id: orgId, user_id: authUserId, role: "member",
          }).select().maybeSingle().then(() => {}).catch(() => {});
        }
      }
      if (!authUserId) return json({ error: "USER_NOT_FOUND" }, 404);

      // Map softphone user → email via RPC (creates or updates row).
      // The RPC uses auth.uid() internally, so call it with the user's JWT context.
      const { error: rpcErr } = await (userClient as any).rpc("admin_link_softphone_by_extension_email", {
        _org_id: orgId, _extension: extension, _email: email,
      });
      if (rpcErr) {
        // Fallback: upsert the mapping directly with service role
        const { error: upErr } = await admin.from("pbx_softphone_users").upsert({
          organization_id: orgId, extension, portal_user_id: authUserId, updated_at: new Date().toISOString(),
        }, { onConflict: "organization_id,extension" });
        if (upErr) return json({ error: "LINK_FAILED", detail: rpcErr.message + " | " + upErr.message }, 500);
      }

      await admin.from("audit_logs").insert({
        organization_id: orgId, user_id: user.id, action: "extension_email_linked",
        resource_type: "pbx_extensions", metadata: { extension, email },
      });
      return json({ ok: true, extension, email, portal_user_id: authUserId,
        initial_password: initialPassword ? "provided" : (createIfMissing && !existing ? "generated" : null) });
    }

    if (action === "send-welcome") {
      const emailIn = String(body?.email || "").trim().toLowerCase();
      // Resolve email from softphone user or profile
      const { data: spu } = await admin.from("pbx_softphone_users")
        .select("id, portal_user_id, display_name").eq("organization_id", orgId).eq("extension", extension).maybeSingle();
      let email = emailIn;
      if (!email && spu?.portal_user_id) {
        const { data: prof } = await admin.from("profiles").select("email").eq("id", spu.portal_user_id).maybeSingle();
        email = prof?.email || "";
      }
      if (!email) return json({ error: "NO_EMAIL", hint: "Link an email first or pass one." }, 400);

      // Generate a recovery link so the user chooses a new password
      const { data: linkData, error: linkErr } = await (admin as any).auth.admin.generateLink({
        type: "recovery", email,
        options: { redirectTo: `${APP_ORIGIN}/auth/reset` },
      });
      if (linkErr) return json({ error: "LINK_FAILED", detail: linkErr.message }, 500);
      const actionLink: string = (linkData as any)?.properties?.action_link || (linkData as any)?.action_link || "";
      const displayName = spu?.display_name || extRow.effective_cid_name || extRow.description || email;

      let emailSent = false, emailError: string | null = null;
      if (RESEND_API_KEY) {
        try {
          const res = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              from: "AVA <noreply@avastatistic.ca>",
              to: [email],
              subject: `Welcome — choose your password (ext. ${extension})`,
              html: `<div style="font-family:-apple-system,Inter,Segoe UI,Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#0f172a">
                <h2 style="margin:0 0 12px">Welcome, ${displayName}!</h2>
                <p>Your account for extension <strong>${extension}</strong> is ready. Click the button below to choose your own password:</p>
                <p style="text-align:center;margin:28px 0">
                  <a href="${actionLink}" style="background:#0023e6;color:#fff;text-decoration:none;padding:14px 28px;border-radius:10px;font-weight:600;display:inline-block">Choose my password →</a>
                </p>
                <p style="color:#64748b;font-size:13px">This link expires in 24 hours. If you didn't expect this email, you can ignore it.</p>
                <p style="color:#94a3b8;font-size:12px;margin-top:24px">Sign in with: <strong>${email}</strong></p>
              </div>`,
            }),
          });
          emailSent = res.ok;
          if (!res.ok) emailError = (await res.text()).slice(0, 500);
        } catch (e: any) { emailError = (e?.message || String(e)).slice(0, 500); }
      } else {
        emailError = "RESEND_API_KEY missing — link generated but no email sent";
      }

      await admin.from("audit_logs").insert({
        organization_id: orgId, user_id: user.id, action: "extension_welcome_sent",
        resource_type: "pbx_extensions", metadata: { extension, email, email_sent: emailSent },
      });
      return json({ ok: true, email, email_sent: emailSent, email_error: emailError, action_link: emailSent ? undefined : actionLink });
    }

    if (action === "set-portal-password") {
      const newPwd = String(body?.password || "");
      if (newPwd.length < 8) return json({ error: "WEAK_PASSWORD", detail: "Minimum 8 characters" }, 400);
      const alsoSip = body?.sync_sip !== false;

      const { data: spu } = await admin.from("pbx_softphone_users")
        .select("portal_user_id").eq("organization_id", orgId).eq("extension", extension).maybeSingle();
      let portalUserId: string | null = spu?.portal_user_id || null;
      const emailIn = String(body?.email || "").trim().toLowerCase();
      if (!portalUserId && emailIn) {
        const { data: prof } = await admin.from("profiles").select("id").eq("email", emailIn).maybeSingle();
        portalUserId = prof?.id || null;
      }
      if (!portalUserId) return json({ error: "NO_PORTAL_USER", hint: "Link an email to this extension first." }, 404);

      const { error: upErr } = await admin.auth.admin.updateUserById(portalUserId, { password: newPwd });
      if (upErr) return json({ error: "PWD_UPDATE_FAILED", detail: upErr.message }, 500);

      if (alsoSip) {
        const wr = await admin.functions.invoke("pbx-write", {
          body: {
            organizationId: orgId, action: "update-extension",
            params: { extension_uuid: extRow.pbx_uuid, extension, password: newPwd },
            objectType: "pbx_extensions", objectPbxUuid: extRow.pbx_uuid,
          },
        });
        if (wr.error || (wr.data as any)?.ok === false) {
          await admin.functions.invoke("fusionpbx-proxy", {
            body: { action: "update-extension", organization_id: orgId,
              params: { extension_uuid: extRow.pbx_uuid, extension, password: newPwd } },
          }).catch(() => {});
        }
        await admin.from("pbx_softphone_users").update({ sip_password: newPwd, updated_at: new Date().toISOString() })
          .eq("organization_id", orgId).eq("extension", extension);
      }

      await admin.from("audit_logs").insert({
        organization_id: orgId, user_id: user.id, action: "extension_portal_password_set",
        resource_type: "pbx_extensions", metadata: { extension, sync_sip: alsoSip },
      });
      return json({ ok: true, extension, portal_user_id: portalUserId, sip_synced: alsoSip });
    }

    return json({ error: "UNKNOWN_ACTION" }, 400);
  } catch (e: any) {
    return json({ error: "INTERNAL", detail: e?.message || String(e) }, 500);
  }
});
