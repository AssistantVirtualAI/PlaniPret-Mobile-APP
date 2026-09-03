import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? Deno.env.get("VITE_SUPABASE_URL") ?? "";
const CRON_TOKEN = Deno.env.get("PP_CRON_TOKEN") ?? Deno.env.get("PP_CRON_SECRET") ?? "";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // This function is a cron trigger bridge: it reads PP_CRON_TOKEN from
  // its own environment and forwards the request to pp-connection-audit
  // with the correct x-pp-cron-secret header. pg_cron calls this function
  // via net.http_post (no auth needed since verify_jwt=false).

  try {
    const url = `${SUPABASE_URL}/functions/v1/pp-connection-audit`;
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-pp-cron-secret": CRON_TOKEN,
      },
      body: JSON.stringify({ notify: true, limit: 500 }),
    });

    const result = await resp.text();
    return new Response(result, {
      status: resp.status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
