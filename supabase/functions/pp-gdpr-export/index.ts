// GDPR / Loi 25 data export for a Planiprêt broker.
import { authBroker, corsHeaders, jsonResponse, logAudit, supaAdmin } from "../_shared/ns-broker.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const a = await authBroker(req);
  if ("error" in a) return a.error;
  const { profile, userId } = a;

  const body = await req.json().catch(() => ({}));
  const targetBrokerId: string = body.broker_id ?? profile.id;

  if (targetBrokerId !== profile.id && profile.role !== "admin") {
    return jsonResponse({ success: false, error: "forbidden" }, 403);
  }

  const admin = supaAdmin();
  const { data: target } = await admin
    .from("planipret_profiles")
    .select("id, user_id, email, full_name, extension, role, created_at")
    .eq("id", targetBrokerId)
    .maybeSingle();
  if (!target) return jsonResponse({ success: false, error: "not found" }, 404);

  const tu = target.user_id;
  const [calls, messages, voicemails, insights, consents, auditEntries] = await Promise.all([
    admin.from("planipret_phone_calls").select("*").eq("user_id", tu),
    admin.from("planipret_phone_messages").select("*").eq("user_id", tu),
    admin.from("planipret_voicemails").select("*").eq("user_id", tu),
    admin.from("planipret_ai_insights").select("*").eq("user_id", tu),
    admin.from("planipret_call_consents").select("*").eq("user_id", tu),
    admin.from("planipret_audit_log").select("*").eq("user_id", tu).order("created_at", { ascending: false }).limit(5000),
  ]);

  const payload = {
    export_metadata: {
      generated_at: new Date().toISOString(),
      requested_by: userId,
      subject_broker_id: target.id,
      compliance: ["PIPEDA", "Loi 25 (Québec)"],
    },
    profile: target,
    calls: calls.data ?? [],
    messages: messages.data ?? [],
    voicemails: voicemails.data ?? [],
    ai_insights: insights.data ?? [],
    call_consents: consents.data ?? [],
    audit_log: auditEntries.data ?? [],
  };

  await logAudit(admin, req, {
    user_id: tu,
    admin_id: profile.role === "admin" ? profile.id : null,
    action: "EXPORT_CSV",
    resource_type: "gdpr_export",
    resource_id: target.id,
    metadata: {
      counts: {
        calls: payload.calls.length,
        messages: payload.messages.length,
        voicemails: payload.voicemails.length,
        ai_insights: payload.ai_insights.length,
        audit_log: payload.audit_log.length,
      },
    },
  });

  return new Response(JSON.stringify(payload, null, 2), {
    status: 200,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="planipret-data-export-${target.id}.json"`,
    },
  });
});
