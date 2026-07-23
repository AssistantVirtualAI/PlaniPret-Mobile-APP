import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type ServiceStatus = {
  ok: boolean;
  latency_ms?: number;
  error?: string;
  detail?: string;
};

async function timed<T>(fn: () => Promise<T>): Promise<{ value?: T; ms: number; error?: string }> {
  const t = Date.now();
  try {
    const value = await fn();
    return { value, ms: Date.now() - t };
  } catch (e: any) {
    return { ms: Date.now() - t, error: e?.message ?? String(e) };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { organization_id } = await req.json();
    if (!organization_id) return new Response(JSON.stringify({ error: "organization_id required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { data: member } = await admin.from("organization_members")
      .select("organization_id").eq("user_id", user.id).eq("organization_id", organization_id).maybeSingle();
    if (!member) return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { data: integ } = await admin.from("pbx_integrations").select("*").eq("organization_id", organization_id).maybeSingle();
    const { data: cfgRows } = await admin.from("lemtel_config").select("key, value");
    const cfg = Object.fromEntries((cfgRows || []).map((r: any) => [r.key, r.value]));

    const mockMode = !!integ?.config?.mock_mode;

    const fusionpbx: ServiceStatus = await (async () => {
      if (mockMode) return { ok: true, latency_ms: 12, detail: "mock" };
      if (!integ?.base_url || !cfg.FUSIONPBX_USERNAME || !cfg.FUSIONPBX_API_KEY) return { ok: false, error: "Not configured" };
      const r = await timed(async () => {
        const res = await fetch(`${integ.base_url}/app/api/index.php?username=${encodeURIComponent(cfg.FUSIONPBX_USERNAME)}&key=${encodeURIComponent(cfg.FUSIONPBX_API_KEY)}`, {
          headers: { Authorization: `Basic ${btoa(`${cfg.FUSIONPBX_USERNAME}:${cfg.FUSIONPBX_API_KEY}`)}` },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.status;
      });
      return r.error ? { ok: false, error: r.error, latency_ms: r.ms } : { ok: true, latency_ms: r.ms };
    })();

    const telnyx: ServiceStatus = await (async () => {
      if (mockMode) return { ok: true, latency_ms: 8, detail: "mock" };
      const apiKey = Deno.env.get("TELNYX_API_KEY") || cfg.TELNYX_API_KEY;
      if (!apiKey) return { ok: false, error: "Not configured" };
      const r = await timed(async () => {
        const res = await fetch("https://api.telnyx.com/v2/messaging_profiles?page[size]=1", {
          headers: { Authorization: `Bearer ${apiKey}` },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.status;
      });
      return r.error ? { ok: false, error: r.error, latency_ms: r.ms } : { ok: true, latency_ms: r.ms };
    })();

    const elevenlabs: ServiceStatus = await (async () => {
      if (mockMode) return { ok: true, latency_ms: 9, detail: "mock" };
      const apiKey = Deno.env.get("ELEVENLABS_API_KEY") || cfg.ELEVENLABS_API_KEY;
      if (!apiKey) return { ok: false, error: "Not configured" };
      const r = await timed(async () => {
        const res = await fetch("https://api.elevenlabs.io/v1/user", { headers: { "xi-api-key": apiKey } });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.status;
      });
      return r.error ? { ok: false, error: r.error, latency_ms: r.ms } : { ok: true, latency_ms: r.ms };
    })();

    const ai: ServiceStatus = await (async () => {
      if (mockMode) return { ok: true, latency_ms: 10, detail: "mock" };
      const lovableKey = Deno.env.get("LOVABLE_API_KEY");
      const anthropic = Deno.env.get("ANTHROPIC_API_KEY") || cfg.ANTHROPIC_API_KEY;
      if (lovableKey) return { ok: true, latency_ms: 1, detail: "lovable-gateway" };
      if (anthropic) return { ok: true, latency_ms: 1, detail: "anthropic" };
      return { ok: false, error: "No AI key configured" };
    })();

    return new Response(JSON.stringify({
      mock_mode: mockMode,
      services: { fusionpbx, telnyx, elevenlabs, ai },
      checked_at: new Date().toISOString(),
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message ?? "Internal error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
