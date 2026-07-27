// POST /functions/v1/maestro-pipeline-orchestrator
// Orchestrateur principal du pipeline Maestro pour un appel.
// Reçoit { call_id, actions? } et délègue à maestro-cdr pour pousser
// le CDR, déclencher la transcription et l'analyse IA.
// Pour les health checks, utiliser maestro-pipeline-test directement.
import { corsHeaders } from "../_shared/maestro.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let body: any = {};
  try { body = await req.json(); } catch { /* empty */ }

  const callId = body?.call_id;
  if (!callId) {
    return new Response(JSON.stringify({ error: "call_id required" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Déléguer à maestro-cdr qui gère : client lookup, CDR push, transcript, AI analysis
  const supaUrl = Deno.env.get("SUPABASE_URL")!;
  const url = `${supaUrl}/functions/v1/maestro-cdr`;
  const headers = new Headers();
  headers.set("Content-Type", "application/json");
  headers.set("Authorization", req.headers.get("Authorization") ?? "");

  const upstream = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({ call_id: callId }),
  });

  const respHeaders = new Headers(corsHeaders);
  respHeaders.set("Content-Type", upstream.headers.get("Content-Type") ?? "application/json");
  return new Response(upstream.body, { status: upstream.status, headers: respHeaders });
});
