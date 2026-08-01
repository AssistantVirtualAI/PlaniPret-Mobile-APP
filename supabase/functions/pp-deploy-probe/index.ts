import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { getMaestroOAuthEnv } from "../_shared/maestro-oauth.ts";

Deno.serve((req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  return new Response(JSON.stringify({ ok: !!getMaestroOAuthEnv }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
