// Generates a fresh SIP password, updates the extension on FusionPBX,
// mirrors it to pbx_softphone_users / pbx_extensions, and returns it.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

function genPwd(len = 24) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

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

    // Look up softphone row (self by default; admins may pass an extension)
    let spu: any;
    if (extensionArg) {
      const { data: row } = await admin
        .from("pbx_softphone_users")
        .select("id, extension, organization_id, extension_id, portal_user_id")
        .eq("extension", extensionArg)
        .maybeSingle();
      spu = row;
    } else {
      const { data: row } = await admin
        .from("pbx_softphone_users")
        .select("id, extension, organization_id, extension_id, portal_user_id")
        .eq("portal_user_id", user.id)
        .maybeSingle();
      spu = row;
    }
    if (!spu) return json({ error: "NOT_FOUND" }, 404);

    // RBAC: self or admin
    if (spu.portal_user_id !== user.id) {
      const { data: isAdmin } = await admin.rpc("is_lemtel_admin", { _user_id: user.id });
      if (!isAdmin) {
        const { data: isSuper } = await admin.rpc("is_super_admin", { _user_id: user.id });
        if (!isSuper) return json({ error: "forbidden" }, 403);
      }
    }

    const newPwd = genPwd(24);
    const { data: extRow } = await admin
      .from("pbx_extensions")
      .select("pbx_uuid")
      .eq("organization_id", spu.organization_id)
      .eq("extension", spu.extension)
      .maybeSingle();
    const extensionUuid = extRow?.pbx_uuid ?? undefined;

    // Push update through pbx-write (so audit + mirror happen)
    const writeRes = await admin.functions.invoke("pbx-write", {
      body: {
        organizationId: spu.organization_id,
        action: "update-extension",
        params: { extension_uuid: extensionUuid, extension: spu.extension, password: newPwd },
        objectType: "pbx_extensions",
        objectPbxUuid: extensionUuid,
      },
    });

    if (writeRes.error || (writeRes.data as any)?.ok === false) {
      // Fallback: direct proxy call
      const { error: pErr } = await admin.functions.invoke("fusionpbx-proxy", {
        body: { action: "update-extension", organization_id: spu.organization_id, params: { extension_uuid: extensionUuid, extension: spu.extension, password: newPwd } },
      });
      if (pErr) return json({ error: "PBX_UPDATE_FAILED", details: pErr.message }, 502);
    }

    await admin.from("pbx_softphone_users")
      .update({ sip_password: newPwd, updated_at: new Date().toISOString() })
      .eq("id", spu.id);

    await admin.from("lemtel_softphone_users")
      .update({ sip_password: newPwd, updated_at: new Date().toISOString() })
      .eq("organization_id", spu.organization_id)
      .eq("extension", spu.extension);

    if (spu.portal_user_id) {
      await admin.auth.admin.updateUserById(spu.portal_user_id, { password: newPwd });
    }

    await admin.from("audit_logs").insert({
      organization_id: spu.organization_id,
      user_id: user.id,
      action: "softphone_password_reset",
      resource_type: "pbx_softphone",
      metadata: { extension: spu.extension },
    });

    return json({ ok: true, extension: spu.extension });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
