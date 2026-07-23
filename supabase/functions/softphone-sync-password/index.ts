// Aligns one SIP password across PBX, portal auth, web, desktop, and mobile apps.
// Default direction is local -> PBX because apps read pbx_softphone_users.sip_password.
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
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const auth = req.headers.get("Authorization") || "";
    if (!auth) return json({ error: "unauthorized" }, 401);

    const sb = createClient(SUPABASE_URL, SERVICE, { global: { headers: { Authorization: auth } } });
    const admin = createClient(SUPABASE_URL, SERVICE);

    const { data: { user } } = await sb.auth.getUser();
    if (!user) return json({ error: "unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));
    const extensionArg: string | undefined = body?.extension;
    const forceLocalToPbx = body?.force_local_to_pbx !== false;

    let spu: any;
    if (extensionArg) {
      const { data } = await admin
        .from("pbx_softphone_users")
        .select("id, extension, organization_id, extension_id, portal_user_id, sip_password")
        .eq("extension", extensionArg).maybeSingle();
      spu = data;
    } else {
      const { data } = await admin
        .from("pbx_softphone_users")
        .select("id, extension, organization_id, extension_id, portal_user_id, sip_password")
        .eq("portal_user_id", user.id).maybeSingle();
      spu = data;
    }
    if (!spu) return json({ error: "NOT_FOUND" }, 404);

    if (spu.portal_user_id !== user.id) {
      const { data: isAdmin } = await admin.rpc("is_lemtel_admin", { _user_id: user.id });
      if (!isAdmin) {
        const { data: isSuper } = await admin.rpc("is_super_admin", { _user_id: user.id });
        if (!isSuper) return json({ error: "forbidden" }, 403);
      }
    }

    const { data: extRow } = await admin
      .from("pbx_extensions")
      .select("id, pbx_uuid, password, raw_data")
      .eq("organization_id", spu.organization_id)
      .eq("extension", spu.extension)
      .maybeSingle();

    // The PBX extension password is the canonical SIP secret. The softphone-user
    // copy can become stale, which causes 403 registration rejects.
    const localPwd = (extRow as any)?.password || (extRow?.raw_data as any)?.password || (extRow?.raw_data as any)?.sip_password || spu.sip_password || "";
    if (forceLocalToPbx && !localPwd) {
      return json({ error: "NO_LOCAL_PASSWORD", message: "No stored SIP password exists to force into the PBX." }, 424);
    }

    // Pull live extension from FusionPBX.
    const { data: fp, error: fpErr } = await admin.functions.invoke("fusionpbx-proxy", {
      body: { action: "get-extension", extension: spu.extension, organization_id: spu.organization_id },
    });
    if (fpErr) return json({ error: "PBX_GET_FAILED", details: fpErr.message }, 502);

    const fpExtension = (fp as any)?.extension || (fp as any)?.extensions?.[0] || (fp as any)?.data?.extensions?.[0] || (Array.isArray(fp) ? (fp as any)[0] : null);
    const pwd: string =
      fpExtension?.password ||
      fpExtension?.sip_password ||
      (fp as any)?.password ||
      (fp as any)?.data?.password ||
      "";

    const desiredPwd = forceLocalToPbx ? localPwd : pwd;
    if (!desiredPwd) return json({ error: "PBX_HAS_NO_PASSWORD", message: "FusionPBX did not return a password for this extension. Reset it from the portal." }, 424);

    const extensionUuid = extRow?.pbx_uuid || fpExtension?.extension_uuid || undefined;
    let pbxChanged = false;
    if (forceLocalToPbx && desiredPwd !== pwd) {
      const { data: writeData, error: writeErr } = await admin.functions.invoke("fusionpbx-proxy", {
        body: {
          action: "update-extension",
          organization_id: spu.organization_id,
          params: { extension_uuid: extensionUuid, extension: spu.extension, password: desiredPwd },
        },
      });
      if (writeErr || (writeData as any)?.ok === false) {
        return json({ error: "PBX_UPDATE_FAILED", details: writeErr?.message || (writeData as any)?.message || (writeData as any)?.error }, 502);
      }
      pbxChanged = true;
    }

    const localChanged = desiredPwd !== spu.sip_password;
    const shouldForceApps = forceLocalToPbx && desiredPwd.length >= 8;
    if (localChanged || pbxChanged || shouldForceApps) {
      await admin.from("pbx_softphone_users")
        .update({ sip_password: desiredPwd, updated_at: new Date().toISOString() })
        .eq("id", spu.id);

      await admin.from("lemtel_softphone_users")
        .update({ sip_password: desiredPwd, updated_at: new Date().toISOString() })
        .eq("organization_id", spu.organization_id)
        .eq("extension", spu.extension);

      // NOTE: intentionally NOT calling auth.admin.updateUserById here.
      // Updating the Supabase auth password invalidates every active session,
      // which causes softphone-credentials to fail with "no authenticated user"
      // and leaves SIP stuck in Idle. The portal-login password is managed
      // separately via set-unified-password / softphone-reset-password.

      // mirror onto pbx_extensions.password AND raw_data.password so credential
      // resolution (which prefers extension_password) sees the aligned value.
      if (extRow?.id || spu.extension_id) {
        const raw = (extRow?.raw_data as any) || {};
        raw.password = desiredPwd;
        await admin.from("pbx_extensions")
          .update({ password: desiredPwd, raw_data: raw })
          .eq("id", extRow?.id || spu.extension_id);
      }

      await admin.from("audit_logs").insert({
        organization_id: spu.organization_id,
        user_id: user.id,
        action: forceLocalToPbx ? "softphone_password_forced_to_pbx" : "softphone_password_synced",
        resource_type: "pbx_softphone",
        metadata: { extension: spu.extension, pbx_changed: pbxChanged, local_changed: localChanged },
      });
    }

    return json({ ok: true, extension: spu.extension, changed: localChanged || pbxChanged || shouldForceApps, pbx_changed: pbxChanged, local_changed: localChanged, apps_forced: shouldForceApps });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
