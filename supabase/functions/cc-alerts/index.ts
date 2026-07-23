// Call Center supervisor alerts. Runs every minute via pg_cron.
// Reads queue stats + agent activity, sends notifications when thresholds breached.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const LEMTEL_ORG = "71755d33-ed64-4ad5-a828-61c9d2029eb7";

const RULES = {
  queueDepth: 5,
  queueWaitSeconds: 300,
  slaPercent: 80,
  agentOnCallMinutes: 30,
  agentPausedMinutes: 45,
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const alerts: any[] = [];

  const { data: stats } = await admin.from("cc_queue_stats").select("*").eq("organization_id", LEMTEL_ORG);
  for (const s of stats || []) {
    if (s.calls_waiting > RULES.queueDepth)
      alerts.push({ severity: "warn", title: `Queue ${s.queue_name}`, msg: `${s.calls_waiting} calls waiting` });
    if (s.longest_wait_seconds > RULES.queueWaitSeconds)
      alerts.push({ severity: "urgent", title: `Queue ${s.queue_name}`, msg: `Longest wait ${Math.round(s.longest_wait_seconds / 60)}m` });
    if (s.service_level_percent > 0 && s.service_level_percent < RULES.slaPercent)
      alerts.push({ severity: "warn", title: `Queue ${s.queue_name}`, msg: `SLA ${s.service_level_percent}%` });
    if (s.agents_offline > 0 && s.agents_available === 0 && s.agents_on_call === 0)
      alerts.push({ severity: "critical", title: `Queue ${s.queue_name}`, msg: `All agents offline` });
  }

  const { data: agents } = await admin
    .from("pbx_softphone_users")
    .select("extension, display_name, cc_status, cc_pause_reason, cc_logged_in_at")
    .eq("organization_id", LEMTEL_ORG)
    .neq("cc_role", "none");
  const now = Date.now();
  for (const a of agents || []) {
    if (!a.cc_logged_in_at) continue;
    const mins = (now - new Date(a.cc_logged_in_at).getTime()) / 60_000;
    if (a.cc_status === "on_call" && mins > RULES.agentOnCallMinutes)
      alerts.push({ severity: "warn", title: a.display_name || a.extension, msg: `On call ${Math.round(mins)}m` });
    if (a.cc_status === "paused" && mins > RULES.agentPausedMinutes)
      alerts.push({ severity: "warn", title: a.display_name || a.extension, msg: `Paused ${Math.round(mins)}m (${a.cc_pause_reason})` });
  }

  // Notify supervisors via Resend
  if (alerts.length) {
    const { data: sups } = await admin
      .from("pbx_softphone_users")
      .select("extension, portal_user_id")
      .eq("organization_id", LEMTEL_ORG)
      .in("cc_role", ["supervisor", "admin"]);
    const ids = (sups || []).map((s) => s.portal_user_id).filter(Boolean);
    let emails: string[] = [];
    if (ids.length) {
      const { data } = await admin.from("profiles").select("email").in("id", ids);
      emails = (data || []).map((p: any) => p.email).filter(Boolean);
    }

    const critical = alerts.filter((a) => a.severity === "critical" || a.severity === "urgent");
    if (critical.length && emails.length) {
      try {
        const apiKey = Deno.env.get("RESEND_API_KEY");
        const lovableKey = Deno.env.get("LOVABLE_API_KEY");
        if (apiKey && lovableKey) {
          await fetch("https://connector-gateway.lovable.dev/resend/emails", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${lovableKey}`,
              "X-Connection-Api-Key": apiKey,
            },
            body: JSON.stringify({
              from: "AVA Statistic <onboarding@resend.dev>",
              to: emails,
              subject: `🚨 Call Center alert: ${critical.length} issue(s)`,
              html: `<h2>Call Center Alerts</h2><ul>${critical.map((a) => `<li><b>${a.title}</b> — ${a.msg}</li>`).join("")}</ul>`,
            }),
          });
        }
      } catch (e) { console.error("resend", e); }
    }
  }

  return json({ ok: true, alerts });
});
