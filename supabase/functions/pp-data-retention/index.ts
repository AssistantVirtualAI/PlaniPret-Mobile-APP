// Data retention enforcement for Planiprêt. Loi 25 / PIPEDA.
import { authBroker, corsHeaders, jsonResponse, logAudit, supaAdmin } from "../_shared/ns-broker.ts";

function daysAgo(days: number) {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // Two modes: cron (service-role bearer OR x-cron-trigger header) or admin (manual run)
  const auth = req.headers.get("Authorization") ?? "";
  const cronHeader = req.headers.get("x-cron-trigger");
  const isCron = auth === `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}` || cronHeader === "true";
  let adminId: string | null = null;

  if (!isCron) {
    const a = await authBroker(req);
    if ("error" in a) return a.error;
    if (a.profile.role !== "admin") return jsonResponse({ success: false, error: "Admin requis" }, 403);
    adminId = a.profile.id;
  }

  const admin = supaAdmin();
  const { data: policyRow } = await admin
    .from("planipret_retention_policy")
    .select("*")
    .limit(1)
    .maybeSingle();
  const policy = policyRow ?? {
    calls_retention_days: 365, messages_retention_days: 365,
    voicemails_retention_days: 180, transcripts_retention_days: 730,
    ai_insights_retention_days: 730, audit_logs_retention_days: 730,
    recordings_retention_days: 90,
  };

  const deletions: Record<string, number> = {};
  const targets: Array<[string, string, number]> = [
    ["planipret_phone_calls", "created_at", policy.calls_retention_days],
    ["planipret_phone_messages", "created_at", policy.messages_retention_days],
    ["planipret_voicemails", "created_at", policy.voicemails_retention_days],
    ["planipret_ai_insights", "created_at", policy.ai_insights_retention_days],
    ["planipret_audit_log", "created_at", policy.audit_logs_retention_days],
  ];
  for (const [table, col, days] of targets) {
    if (!days || days <= 0) continue;
    const cutoff = daysAgo(days);
    const { count, error } = await admin
      .from(table)
      .delete({ count: "exact" })
      .lt(col, cutoff);
    deletions[table] = error ? -1 : (count ?? 0);
  }

  if (policyRow?.id) {
    await admin.from("planipret_retention_policy")
      .update({ last_run_at: new Date().toISOString() })
      .eq("id", policyRow.id);
  }

  await logAudit(admin, req, {
    admin_id: adminId,
    action: "DATA_RETENTION_RUN",
    resource_type: "retention",
    metadata: { deletions, triggered_by: isCron ? "cron" : "admin" },
  });

  return jsonResponse({ success: true, deletions, ran_at: new Date().toISOString() });
});
