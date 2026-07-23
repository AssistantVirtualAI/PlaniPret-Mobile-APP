// One-shot backfill: push existing pbx_softphone_users.sip_password
// into Supabase Auth (portal login) so users have a single password
// across portal, desktop, mobile, and PBX extension.
// Super-admin only.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

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
    const { data: isSuper } = await admin.rpc("is_super_admin", { _user_id: caller.id });
    if (!isSuper) return json({ error: "forbidden", message: "Super admin required" }, 403);

    const body = await req.json().catch(() => ({}));
    const dryRun: boolean = !!body?.dry_run;

    const { data: rows, error } = await admin
      .from("pbx_softphone_users")
      .select("id, organization_id, extension, portal_user_id, sip_password")
      .not("portal_user_id", "is", null)
      .not("sip_password", "is", null);
    if (error) return json({ error: "QUERY_FAILED", message: error.message }, 500);

    let updated = 0, skipped = 0;
    const errors: any[] = [];

    for (const r of rows || []) {
      const pwd = (r as any).sip_password;
      const uid = (r as any).portal_user_id;
      if (!pwd || !uid || pwd.length < 6) { skipped++; continue; }
      if (dryRun) { updated++; continue; }
      try {
        const { error: uErr } = await admin.auth.admin.updateUserById(uid, { password: pwd });
        if (uErr) { errors.push({ id: r.id, ext: r.extension, err: uErr.message }); continue; }

        // Mirror to lemtel_softphone_users if exists
        await admin
          .from("lemtel_softphone_users")
          .update({ sip_password: pwd, updated_at: new Date().toISOString() })
          .eq("organization_id", r.organization_id)
          .eq("extension", r.extension);

        await admin.from("pbx_softphone_portal_audit").insert({
          softphone_user_id: r.id,
          organization_id: r.organization_id,
          extension: r.extension,
          new_portal_user_id: uid,
          action: "password_unified",
          actor_user_id: caller.id,
          actor_email: caller.email,
          source: "backfill",
        });

        updated++;
      } catch (e: any) {
        errors.push({ id: r.id, ext: r.extension, err: e?.message || String(e) });
      }
    }

    return json({ success: true, dry_run: dryRun, total: rows?.length || 0, updated, skipped, errors });
  } catch (e: any) {
    return json({ error: "BACKFILL_FAILED", message: e?.message || String(e) }, 500);
  }
});
