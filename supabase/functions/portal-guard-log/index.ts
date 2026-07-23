import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const events = Array.isArray(body.events) ? body.events.slice(0, 80) : [];
    const enriched = events.map((event) => ({
      ...event,
      receivedAt: new Date().toISOString(),
      ip: req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown",
      edgeUserAgent: req.headers.get("user-agent") || "unknown",
    }));

    console.log("PORTAL_GUARD_EVENTS", JSON.stringify(enriched));

    return new Response(JSON.stringify({ ok: true, logged: enriched.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("PORTAL_GUARD_LOG_FAILED", error);
    return new Response(JSON.stringify({ ok: false }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});