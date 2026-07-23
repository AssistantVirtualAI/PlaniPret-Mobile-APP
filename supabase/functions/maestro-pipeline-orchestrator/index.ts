// POST /functions/v1/maestro-pipeline-orchestrator
// Thin alias forwarding to maestro-pipeline-test so external integrations
// (e.g. ns-webhook-receiver) can use the canonical orchestrator name.
import { corsHeaders } from "../_shared/maestro.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const url = `${Deno.env.get("SUPABASE_URL")}/functions/v1/maestro-pipeline-test`;
  const headers = new Headers(req.headers);
  headers.delete("host");
  headers.delete("content-length");

  const body = req.method === "POST" || req.method === "PUT" || req.method === "PATCH"
    ? await req.arrayBuffer()
    : undefined;

  const upstream = await fetch(url, { method: req.method, headers, body });
  const respHeaders = new Headers(corsHeaders);
  respHeaders.set("Content-Type", upstream.headers.get("Content-Type") ?? "application/json");
  return new Response(upstream.body, { status: upstream.status, headers: respHeaders });
});
