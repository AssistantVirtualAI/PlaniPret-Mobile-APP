// Delivers one internal notification for a Feedback report. The recipient is
// exclusively server-configured; callers can never choose an e-mail address.
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const esc = (value: unknown) =>
  String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]!));
const SEVERITY: Record<string, string> = { low: "Mineur", normal: "Normal", high: "Élevé", blocker: "Bloquant" };
const BUCKET = "pp-feedback-screenshots";
const SIGNED_URL_SECONDS = 60 * 60;
const MAX_SCREENSHOTS = 6;

function isReportId(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f-]{36}$/i.test(value);
}

function belongsToReporter(path: unknown, reporterId: string): path is string {
  return typeof path === "string"
    && path.startsWith(`${reporterId}/`)
    && !path.includes("..")
    && /^[0-9a-f-]{36}\/[A-Za-z0-9._/-]+$/i.test(path);
}

async function markFailed(admin: any, reportId: string, code: string) {
  await admin.from("pp_feedback_reports").update({
    notification_status: "failed",
    notification_last_error: code.slice(0, 120),
    notification_next_retry_at: new Date(Date.now() + 5 * 60_000).toISOString(),
  }).eq("id", reportId).eq("notification_status", "sending");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const authorization = req.headers.get("Authorization") ?? "";
  const internal = authorization === `Bearer ${serviceRole}`;
  const userClient = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authorization } } });
  const { data: identity } = internal ? { data: null as any } : await userClient.auth.getUser();
  if (!internal && !identity?.user) return json({ error: "not_authenticated" }, 401);

  const body = await req.json().catch(() => ({}));
  if (!isReportId(body?.report_id)) return json({ error: "invalid_report_id" }, 400);
  const reportId = body.report_id;
  const admin = createClient(url, serviceRole);
  const { data: report } = await admin.from("pp_feedback_reports").select("*").eq("id", reportId).maybeSingle();
  if (!report || (!internal && report.reporter_id !== identity.user.id)) return json({ error: "not_found" }, 404);

  const { data: member } = await admin.rpc("is_planipret_member", { _user_id: report.reporter_id });
  if (member !== true) return json({ error: "not_authorized" }, 403);

  const { data: claimed, error: claimError } = await admin.rpc("claim_pp_feedback_notification", { _report_id: reportId }).maybeSingle();
  if (claimError) return json({ error: "notification_claim_failed" }, 500);
  if (!claimed) {
    const { data: current } = await admin.from("pp_feedback_reports").select("notification_status").eq("id", reportId).maybeSingle();
    const status = current?.notification_status === "sent" ? "sent" : "pending";
    return json({ ok: status === "sent", report_recorded: true, notification_status: status });
  }

  const apiKey = Deno.env.get("RESEND_API_KEY");
  const recipients = (Deno.env.get("PP_FEEDBACK_EMAIL") || Deno.env.get("ADMIN_NOTIFICATION_EMAIL") || "")
    .split(",").map((value) => value.trim()).filter(Boolean);
  if (!apiKey || recipients.length === 0) {
    await markFailed(admin, reportId, "email_not_configured");
    return json({ ok: false, report_recorded: true, notification_status: "failed", error: "email_not_configured" }, 503);
  }

  const { data: authUser } = await admin.auth.admin.getUserById(report.reporter_id);
  const replyTo = authUser?.user?.email ?? undefined;
  const screenshotPaths = (Array.isArray(report.screenshots) ? report.screenshots : [])
    .filter((path: unknown) => belongsToReporter(path, report.reporter_id))
    .slice(0, MAX_SCREENSHOTS);
  const screenshots: string[] = [];
  for (const path of screenshotPaths) {
    const { data, error } = await admin.storage.from(BUCKET).createSignedUrl(path, SIGNED_URL_SECONDS);
    if (error || !data?.signedUrl) {
      await markFailed(admin, reportId, "screenshot_sign_failed");
      return json({ ok: false, report_recorded: true, notification_status: "failed", error: "screenshot_sign_failed" }, 502);
    }
    screenshots.push(data.signedUrl);
  }

  const source = report.source === "mobile" ? "App mobile" : report.source === "ava_chat" ? "AVA chat" : report.source === "ava_voice" ? "AVA vocal" : "Portail courtier";
  const html = `<!doctype html><html><body style="font-family:Arial,sans-serif;background:#ffffff;color:#1A2540;max-width:620px;margin:auto;padding:24px">
<h2 style="color:#1A4A8A;margin:0 0 8px">Nouveau feedback — ${esc(report.title)}</h2>
<p style="color:#6B7280;font-size:13px;margin:0 0 16px">${esc(report.reporter_name || replyTo || "Courtier")} · ${esc(replyTo || "")} · ${source} · Gravité : <b>${esc(SEVERITY[report.severity] ?? report.severity)}</b>${report.page ? ` · Page : ${esc(report.page)}` : ""}</p>
<div style="white-space:pre-wrap;background:#F1F7FE;border-radius:10px;padding:14px;font-size:14px">${esc(report.description || "(aucune description)")}</div>
${screenshots.length ? `<h3 style="color:#1A4A8A;margin-top:20px">Captures (${screenshots.length})</h3>${screenshots.map((signedUrl, index) => `<p><a href="${esc(signedUrl)}">Ouvrir la capture ${index + 1}</a></p>`).join("")}<p style="font-size:11px;color:#9CA3AF">Liens valides 1 heure.</p>` : ""}
<p style="margin-top:24px"><a href="https://courtierai.planipret.com/planipret/broker/feedback" style="background:#1A4A8A;color:#ffffff;padding:10px 16px;border-radius:8px;text-decoration:none">Ouvrir le feedback</a></p>
</body></html>`;

  const payload = { from: "Planiprêt Feedback <noreply@ava-telecom.ca>", to: recipients, ...(replyTo ? { reply_to: replyTo } : {}), subject: `[Feedback ${source}] ${report.title}`, html };
  let response: Response;
  try {
    response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "Idempotency-Key": `pp-feedback-${reportId}` },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "Idempotency-Key": `pp-feedback-${reportId}` },
        body: JSON.stringify({ ...payload, from: "Planiprêt Feedback <onboarding@resend.dev>" }),
      });
    }
  } catch {
    await markFailed(admin, reportId, "email_network_error");
    return json({ ok: false, report_recorded: true, notification_status: "failed", error: "send_failed" }, 502);
  }

  if (!response.ok) {
    await markFailed(admin, reportId, `email_http_${response.status}`);
    return json({ ok: false, report_recorded: true, notification_status: "failed", error: "send_failed" }, 502);
  }

  await admin.from("pp_feedback_reports").update({
    notification_status: "sent",
    notification_sent_at: new Date().toISOString(),
    notification_last_error: null,
    notification_next_retry_at: null,
  }).eq("id", reportId).eq("notification_status", "sending");
  return json({ ok: true, report_recorded: true, notification_status: "sent" });
});
