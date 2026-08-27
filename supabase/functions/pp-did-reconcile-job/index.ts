// pp-did-reconcile-job — job automatisé (cron ou manuel).
// Exécute pp-did-reconcile (lecture seule), persiste le rapport dans
// planipret_did_reconcile_reports et envoie une alerte courriel résumée
// quand des écarts NS ↔ Maestro sont détectés.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const ALERT_TO = (Deno.env.get("PP_DID_ALERT_EMAIL") ?? "mhassoun@assistantvirtualai.com")
  .split(",").map((s) => s.trim()).filter(Boolean);

const esc = (v: unknown) =>
  String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(SUPABASE_URL, SERVICE_KEY);

  try {
    const body = await req.json().catch(() => ({} as any));
    const domain = String(body?.domain ?? "planipret.ca");
    const notify = body?.notify !== false;
    let triggeredBy = "cron";

    // --- Autorisation : service-role (cron) ou admin Planiprêt -------------
    const authHeader = req.headers.get("Authorization") ?? "";
    const jobSecret = Deno.env.get("PP_JOB_SECRET");
    const isCron =
      (!!jobSecret && (req.headers.get("x-job-secret") === jobSecret || body?.job_secret === jobSecret)) ||
      req.headers.get("x-cron-trigger") === "true";
    const isServiceRole = !!SERVICE_KEY && authHeader.includes(SERVICE_KEY);
    if (!isServiceRole && !isCron) {
      const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: u } = await userClient.auth.getUser();
      if (!u?.user) return json({ error: "unauthorized" }, 401);
      const { data: ok } = await admin.rpc("is_planipret_admin", { _user_id: u.user.id });
      if (!ok) return json({ error: "forbidden" }, 403);
      triggeredBy = u.user.email ?? "admin";
    }

    // --- 1. Exécution de la réconciliation (lecture seule) -----------------
    const res = await fetch(`${SUPABASE_URL}/functions/v1/pp-did-reconcile`, {
      method: "POST",
      headers: { Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ domain, only_mismatch: false }),
    });
    const report = await res.json().catch(() => ({}));
    if (!res.ok || report?.error) {
      return json({ error: "reconcile_failed", status: res.status, details: report?.error ?? null }, 502);
    }

    const rows: any[] = Array.isArray(report.rows) ? report.rows : [];
    const problems = rows.filter((r) => r.status !== "match");

    // --- 2. Persistance du rapport -----------------------------------------
    const { data: saved } = await admin
      .from("planipret_did_reconcile_reports")
      .insert({
        domain,
        broker_count: report.broker_count ?? rows.length,
        mismatch_count: problems.length,
        summary: report.summary ?? {},
        rows: problems,
        orphan_ns_dids: report.orphan_ns_dids ?? [],
        triggered_by: triggeredBy,
      })
      .select("id")
      .maybeSingle();

    // --- 3. Alerte courriel -------------------------------------------------
    let alertSent = false;
    let alertError: string | null = null;
    const resendKey = Deno.env.get("RESEND_API_KEY");

    if (notify && problems.length > 0 && resendKey && ALERT_TO.length) {
      const tr = problems
        .map((r) => `<tr>
          <td style="padding:6px 10px;border-bottom:1px solid #eee">${esc(r.name ?? r.email)}</td>
          <td style="padding:6px 10px;border-bottom:1px solid #eee">${esc(r.extension)} / ${esc((r.ns_dids ?? []).join(", "))}</td>
          <td style="padding:6px 10px;border-bottom:1px solid #eee">${esc(r.maestro_extension)} / ${esc(r.maestro_sms_did)}</td>
          <td style="padding:6px 10px;border-bottom:1px solid #eee"><strong>${esc(r.status)}</strong></td>
        </tr>`)
        .join("");
      const html = `<!doctype html><html><body style="font-family:Inter,Arial,sans-serif;background:#f5f7fb;padding:24px">
        <div style="max-width:760px;margin:auto;background:#fff;border:1px solid #e6e8ee;border-radius:12px;overflow:hidden">
          <div style="background:#0023e6;color:#fff;padding:20px"><h2 style="margin:0">DID reconciliation — ${esc(problems.length)} écart(s)</h2>
          <div style="opacity:.85;font-size:13px">Domaine ${esc(domain)} · ${esc(report.broker_count ?? 0)} courtiers vérifiés</div></div>
          <div style="padding:20px;color:#1a1f36">
            <table style="width:100%;border-collapse:collapse;font-size:13px">
              <thead><tr style="text-align:left;background:#f7f8fb">
                <th style="padding:8px 10px">Courtier</th><th style="padding:8px 10px">NS ext / DID</th>
                <th style="padding:8px 10px">Maestro ext / DID</th><th style="padding:8px 10px">État</th>
              </tr></thead><tbody>${tr}</tbody>
            </table>
            ${(report.orphan_ns_dids ?? []).length ? `<p style="font-size:13px;color:#b45309">DID NetSapiens sans extension : ${esc((report.orphan_ns_dids ?? []).join(", "))}</p>` : ""}
            <p style="font-size:12px;color:#6b7280">Rapport automatique — lecture seule, aucune écriture n'a été faite sur NetSapiens ni Maestro.</p>
          </div>
        </div></body></html>`;

      try {
        const r = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            from: "AVA Statistic <onboarding@resend.dev>",
            to: ALERT_TO,
            subject: `[Planiprêt] ${problems.length} écart(s) DID NetSapiens ↔ Maestro`,
            html,
          }),
        });
        if (!r.ok) { alertError = `resend_${r.status}: ${(await r.text()).slice(0, 200)}`; }
        else alertSent = true;
      } catch (e) {
        alertError = String((e as Error).message ?? e);
      }
    } else if (notify && problems.length > 0 && !resendKey) {
      alertError = "RESEND_API_KEY_missing";
    }

    if (saved?.id) {
      await admin
        .from("planipret_did_reconcile_reports")
        .update({ alert_sent: alertSent, alert_error: alertError })
        .eq("id", saved.id);
    }

    return json({
      ok: true,
      report_id: saved?.id ?? null,
      domain,
      broker_count: report.broker_count ?? rows.length,
      mismatch_count: problems.length,
      summary: report.summary ?? {},
      orphan_ns_dids: report.orphan_ns_dids ?? [],
      rows: problems,
      alert_sent: alertSent,
      alert_error: alertError,
    });
  } catch (e) {
    console.error("[pp-did-reconcile-job]", e);
    return json({ error: String((e as Error).message || e) }, 500);
  }
});
