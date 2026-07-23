// Mints a short-lived magic link for the desktop softphone's embedded Portal tab.
// Tenant isolation: the magic link signs in as the SAME user who called us,
// so the embedded portal inherits that user's RLS scope (no cross-tenant leakage).
import { corsHeaders, jsonResponse, requireUser, getServiceClient } from "../_shared/auth.ts";

const FN = "desktop-portal-token";
const log = (rid: string, lvl: "info" | "warn" | "error", msg: string, extra?: any) =>
  console.log(JSON.stringify({ fn: FN, rid, lvl, msg, ...(extra || {}), t: Date.now() }));

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse(405, { error: "Method not allowed" });

  const rid = crypto.randomUUID().slice(0, 8);
  const t0 = Date.now();

  try {
    const auth = await requireUser(req);
    if ("error" in auth) {
      log(rid, "warn", "unauthenticated", { ms: Date.now() - t0 });
      return auth.error;
    }
    if (!auth.user.email) {
      log(rid, "warn", "no_email", { uid: auth.user.id });
      return jsonResponse(400, { error: "User has no email" });
    }

    const admin = getServiceClient();
    const { data, error } = await (admin.auth as any).admin.generateLink({
      type: "magiclink",
      email: auth.user.email,
    });
    if (error) {
      log(rid, "error", "generate_link_failed", { err: error.message, uid: auth.user.id });
      return jsonResponse(500, { error: error.message });
    }

    const props = (data as any)?.properties || {};
    const portalUrl = Deno.env.get("PORTAL_URL") || "https://avastatistic.ca";
    const target = `${portalUrl.replace(/\/$/, "")}/org/lemtel/my/dashboard?desktop=1`;

    // Audit
    await admin.from("telecom_audit_logs").insert({
      user_id: auth.user.id,
      action: "desktop_portal_token_issued",
      metadata: { rid, ms: Date.now() - t0 },
    }).then(() => {}, () => {}); // best-effort

    log(rid, "info", "ok", { uid: auth.user.id, ms: Date.now() - t0 });
    return jsonResponse(200, {
      url: target,
      action_link: props.action_link,
      expires_in: 600,
      rid,
    });
  } catch (e: any) {
    log(rid, "error", "unhandled", { err: e?.message, ms: Date.now() - t0 });
    return jsonResponse(500, { error: e?.message || "Internal error" });
  }
});
