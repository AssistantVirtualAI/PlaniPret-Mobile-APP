// Set a single unified password for a target user across:
//  - Supabase Auth (portal login)
//  - pbx_softphone_users.sip_password (+ lemtel_softphone_users mirror)
//  - FusionPBX extension (best-effort)
// Authorized for: super_admin, lemtel_admin, org_admin of the user's org,
// or the user themselves (self-serve).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

function generatePassword(len = 14) {
  const chars = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%^&*";
  const arr = new Uint32Array(len);
  crypto.getRandomValues(arr);
  return Array.from(arr, (n) => chars[n % chars.length]).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader) return json({ error: "unauthorized" }, 401);
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: caller } } = await userClient.auth.getUser();
    if (!caller) return json({ error: "unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));
    const target_user_id: string | undefined = body?.target_user_id;
    const target_softphone_id: string | undefined = body?.softphone_id;
    const use_current_sip: boolean = !!body?.use_current_sip_password;
    let password: string = body?.password || "";
    const source: string = body?.source || "admin_reset";

    // Resolve softphone user row (sip_password needed if use_current_sip)
    let row: any = null;
    const cols = "id, organization_id, extension, portal_user_id, sip_password";
    if (target_softphone_id) {
      const { data } = await admin
        .from("pbx_softphone_users").select(cols).eq("id", target_softphone_id).maybeSingle();
      row = data;
    } else if (target_user_id) {
      const { data } = await admin
        .from("pbx_softphone_users").select(cols).eq("portal_user_id", target_user_id).maybeSingle();
      row = data;
    }
    if (!row) return json({ error: "USER_NOT_FOUND" }, 404);

    if (use_current_sip) {
      if (!row.sip_password || row.sip_password.length < 6) {
        return json({ error: "NO_SIP_PASSWORD", message: "No SIP password stored for this extension" }, 400);
      }
      password = row.sip_password;
    } else if (!password) {
      password = generatePassword();
    }
    if (password.length < 8) return json({ error: "WEAK_PASSWORD", message: "Min 8 chars" }, 400);

    // Authorization
    const isSelf = row.portal_user_id === caller.id;
    let allowed = isSelf;
    if (!allowed) {
      const [{ data: isSuper }, { data: isLemtel }, { data: isOrgAdmin }] = await Promise.all([
        admin.rpc("is_super_admin", { _user_id: caller.id }),
        admin.rpc("is_lemtel_admin", { _user_id: caller.id }),
        admin.rpc("has_role", { _user_id: caller.id, _org_id: row.organization_id, _role: "org_admin" }),
      ]);
      allowed = !!isSuper || !!isLemtel || !!isOrgAdmin;
    }
    if (!allowed) return json({ error: "forbidden" }, 403);

    const errors: any[] = [];

    // 1) Supabase Auth
    if (row.portal_user_id) {
      const { error: uErr } = await admin.auth.admin.updateUserById(row.portal_user_id, { password });
      if (uErr) errors.push({ step: "auth", err: uErr.message });
    }

    // 2) pbx_softphone_users + lemtel_softphone_users mirror
    const { error: sErr } = await admin
      .from("pbx_softphone_users")
      .update({ sip_password: password, updated_at: new Date().toISOString() })
      .eq("id", row.id);
    if (sErr) errors.push({ step: "softphone", err: sErr.message });

    await admin
      .from("lemtel_softphone_users")
      .update({ sip_password: password, updated_at: new Date().toISOString() })
      .eq("organization_id", row.organization_id)
      .eq("extension", row.extension);

    // 3) FusionPBX
    try {
      const { data: extRow } = await admin
        .from("pbx_extensions")
        .select("pbx_uuid")
        .eq("organization_id", row.organization_id)
        .eq("extension", row.extension)
        .maybeSingle();
      const { data: pbxRes, error: pbxErr } = await admin.functions.invoke("fusionpbx-proxy", {
        body: {
          action: "update-extension",
          organization_id: row.organization_id,
          params: { extension_uuid: extRow?.pbx_uuid || undefined, extension: String(row.extension), password },
        },
      });
      if (pbxErr || (pbxRes as any)?.ok === false) {
        errors.push({ step: "fusionpbx", err: pbxErr?.message || (pbxRes as any)?.message || (pbxRes as any)?.error || "PBX update failed" });
      }
    } catch (e: any) {
      errors.push({ step: "fusionpbx", err: e?.message || String(e) });
    }

    // Audit
    await admin.from("pbx_softphone_portal_audit").insert({
      softphone_user_id: row.id,
      organization_id: row.organization_id,
      extension: row.extension,
      new_portal_user_id: row.portal_user_id,
      action: "password_unified",
      actor_user_id: caller.id,
      actor_email: caller.email,
      source,
    });

    return json({ success: errors.length === 0, password_set: true, errors });
  } catch (e: any) {
    return json({ error: "SET_FAILED", message: e?.message || String(e) }, 500);
  }
});
