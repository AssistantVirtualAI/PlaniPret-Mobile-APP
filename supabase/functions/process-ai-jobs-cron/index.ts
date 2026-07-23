// process-ai-jobs-cron: drains pending pbx_ai_jobs of kind 'process_recording'
// and invokes process-call-recording with service-role auth. Designed to be called
// by a Supabase pg_cron schedule (every minute).
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

  const { data: jobs } = await admin
    .from("pbx_ai_jobs")
    .select("id, call_record_id")
    .eq("kind", "process_recording")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(10);

  const results: any[] = [];
  for (const job of jobs ?? []) {
    await admin.from("pbx_ai_jobs").update({ status: "processing", updated_at: new Date().toISOString() }).eq("id", job.id);
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/process-call-recording`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${SERVICE_ROLE}`,
          "Content-Type": "application/json",
          "x-internal-trigger": "cron",
        },
        body: JSON.stringify({ callId: job.call_record_id }),
      });
      const out = await res.json().catch(() => ({}));
      const ok = res.ok || res.status === 202 || res.status === 409;
      await admin.from("pbx_ai_jobs").update({
        status: ok ? "completed" : "failed",
        updated_at: new Date().toISOString(),
        result: out,
        error: ok ? null : (out?.error ?? `http_${res.status}`),
      }).eq("id", job.id);
      results.push({ id: job.id, status: res.status });
    } catch (e) {
      await admin.from("pbx_ai_jobs").update({
        status: "failed",
        updated_at: new Date().toISOString(),
        error: String(e).slice(0, 500),
      }).eq("id", job.id);
      results.push({ id: job.id, error: String(e) });
    }
  }

  return new Response(JSON.stringify({ drained: results.length, results }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
