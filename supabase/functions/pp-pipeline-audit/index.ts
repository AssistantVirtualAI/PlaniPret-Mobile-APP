// Audit du pipeline Planiprêt : appel -> CDR Maestro -> enregistrement ->
// transcription -> résumé/coaching IA. Retourne un statut OK/KO par étape,
// la liste des appels bloqués et les 50 derniers événements corrélés.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

type Stage = {
  key: string;
  label: string;
  endpoint: string;
  total: number;
  done: number;
  status: "OK" | "KO" | "WARN";
  note?: string;
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );

    const url = new URL(req.url);
    const days = Math.min(Math.max(Number(url.searchParams.get("days")) || 7, 1), 90);
    const brokerId = url.searchParams.get("user_id");
    const since = new Date(Date.now() - days * 864e5).toISOString();

    let q = admin
      .from("planipret_phone_calls")
      .select(
        "id,user_id,created_at,duration_seconds,maestro_call_id,recording_url,ns_recording_url,recording_storage_path,transcript,ai_summary,ai_coaching,status",
      )
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(2000);
    if (brokerId) q = q.eq("user_id", brokerId);
    const { data: calls, error } = await q;
    if (error) return json({ success: false, error: error.message }, 200);

    const rows = calls ?? [];
    const answered = rows.filter((c) => (c.duration_seconds ?? 0) > 0);
    const hasRec = (c: Record<string, unknown>) =>
      Boolean(c.recording_url || c.ns_recording_url || c.recording_storage_path);
    const hasTx = (c: Record<string, unknown>) =>
      typeof c.transcript === "string" && (c.transcript as string).length > 10;

    const pct = (a: number, b: number) => (b === 0 ? 100 : Math.round((a / b) * 100));
    const grade = (a: number, b: number, warn = 80, ok = 95): "OK" | "WARN" | "KO" => {
      const p = pct(a, b);
      return p >= ok ? "OK" : p >= warn ? "WARN" : "KO";
    };

    const cdrDone = rows.filter((c) => c.maestro_call_id).length;
    const recDone = answered.filter(hasRec).length;
    const txDone = answered.filter(hasTx).length;
    const aiDone = answered.filter((c) => c.ai_summary).length;
    const coachDone = answered.filter((c) => c.ai_coaching).length;

    const stages: Stage[] = [
      {
        key: "cdr",
        label: "Appel → CDR Maestro",
        endpoint: "POST /users/{id}/calls + PUT /calls/{id} {status:ended}",
        total: rows.length,
        done: cdrDone,
        status: grade(cdrDone, rows.length),
      },
      {
        key: "recording",
        label: "Enregistrement",
        endpoint: "GET /users/{id}/call/{id}/recording (polling) + NS-API recordings",
        total: answered.length,
        done: recDone,
        status: grade(recDone, answered.length),
      },
      {
        key: "transcript",
        label: "Transcription",
        endpoint: "GET /users/{id}/call/{id}/transcription | ns-transcription",
        total: answered.length,
        done: txDone,
        status: grade(txDone, answered.length),
      },
      {
        key: "ai_summary",
        label: "Résumé IA",
        endpoint: "maestro-ai-analysis → PUT /calls/{id} {ai_summary}",
        total: answered.length,
        done: aiDone,
        status: grade(aiDone, answered.length),
      },
      {
        key: "ai_coaching",
        label: "Coaching IA",
        endpoint: "pp-coach-call (Claude)",
        total: answered.length,
        done: coachDone,
        status: grade(coachDone, answered.length),
      },
    ];

    // Appels bloqués : étape non atteinte / donnée non persistée
    const stuck = answered
      .filter((c) => !c.maestro_call_id || !hasRec(c) || !hasTx(c) || !c.ai_summary)
      .slice(0, 100)
      .map((c) => ({
        call_id: c.id,
        user_id: c.user_id,
        created_at: c.created_at,
        missing: [
          !c.maestro_call_id && "cdr",
          !hasRec(c) && "recording",
          !hasTx(c) && "transcript",
          !c.ai_summary && "ai_summary",
          !c.ai_coaching && "ai_coaching",
        ].filter(Boolean),
      }));

    // SMS
    let smsTotal = 0;
    let smsSynced = 0;
    let smsStuck = 0;
    try {
      const { data: msgs } = await admin
        .from("planipret_phone_messages")
        .select("id,status,maestro_synced,created_at")
        .gte("created_at", since)
        .limit(2000);
      smsTotal = msgs?.length ?? 0;
      smsSynced = (msgs ?? []).filter((m: Record<string, unknown>) => m.maestro_synced).length;
      smsStuck = (msgs ?? []).filter((m: Record<string, unknown>) => m.status === "sending").length;
    } catch (_) { /* colonne absente */ }

    stages.push({
      key: "sms",
      label: "Textos → Maestro",
      endpoint: "POST /users/{id}/messages (envoi réel + journalisation)",
      total: smsTotal,
      done: smsSynced,
      status: grade(smsSynced, smsTotal),
      note: smsStuck ? `${smsStuck} texto(s) bloqué(s) en « sending »` : undefined,
    });

    // Derniers événements corrélés
    const { data: events } = await admin
      .from("planipret_pipeline_logs")
      .select("created_at,step,status,call_id,correlation_id,entity_type,entity_id,endpoint,http_status,error_message")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(50);

    const { data: errs } = await admin
      .from("planipret_pipeline_logs")
      .select("step,error_message")
      .eq("status", "error")
      .gte("created_at", since)
      .limit(500);
    const errorsByStep: Record<string, number> = {};
    for (const e of errs ?? []) errorsByStep[e.step as string] = (errorsByStep[e.step as string] ?? 0) + 1;

    return json({
      success: true,
      window_days: days,
      generated_at: new Date().toISOString(),
      totals: { calls: rows.length, answered: answered.length, sms: smsTotal },
      stages: stages.map((s) => ({ ...s, pct: pct(s.done, s.total) })),
      errors_by_step: errorsByStep,
      stuck_calls: stuck,
      recent_events: events ?? [],
    });
  } catch (e) {
    console.error("[pp-pipeline-audit]", e);
    return json({ success: false, error: String((e as Error)?.message ?? e) }, 200);
  }
});
