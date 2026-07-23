// Mint a WebRTC conversation token for the authenticated broker's own
// ElevenLabs Convai agent. Keeps ELEVENLABS_API_KEY server-side.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { signAvaSession } from "../_shared/ava-session.ts";

const ELEVENLABS_API_KEY = Deno.env.get("ELEVENLABS_API_KEY") ?? "";
const ELEVENLABS_DEFAULT_AGENT_ID = Deno.env.get("ELEVENLABS_DEFAULT_AGENT_ID") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

// naive per-IP+user rate limit (10/min)
const bucket = new Map<string, { n: number; reset: number }>();
function allow(k: string, max = 10, win = 60_000): boolean {
  const now = Date.now();
  const b = bucket.get(k);
  if (!b || now > b.reset) { bucket.set(k, { n: 1, reset: now + win }); return true; }
  if (b.n >= max) return false;
  b.n++; return true;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    if (!ELEVENLABS_API_KEY) return json({ error: "elevenlabs_not_configured" }, 500);

    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return json({ error: "unauthorized" }, 401);
    const jwt = authHeader.slice(7);

    const anon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userRes, error: userErr } = await anon.auth.getUser(jwt);
    if (userErr || !userRes?.user) return json({ error: "unauthorized" }, 401);

    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    if (!allow(`${ip}:${userRes.user.id}`)) return json({ error: "rate_limited" }, 429);

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: prof } = await admin
      .from("planipret_profiles")
      .select("elevenlabs_agent_id, voice_agent_enabled, full_name, extension")
      .eq("user_id", userRes.user.id)
      .maybeSingle();

    if (!prof) return json({ error: "profile_not_found" }, 404);
    if (!prof.voice_agent_enabled) return json({ error: "voice_agent_disabled" }, 403);

    const agentId = prof.elevenlabs_agent_id || ELEVENLABS_DEFAULT_AGENT_ID;
    if (!agentId) return json({ error: "agent_not_provisioned" }, 409);

    // Accept ?type=webrtc|websocket|both — signed URLs are single-use so
    // callers should mint only what they need. Defaults to "both" for
    // backward compat.
    const url = new URL(req.url);
    let type = (url.searchParams.get("type") ?? "").toLowerCase();
    if (req.method === "POST") {
      try {
        const body = await req.json().catch(() => null);
        if (body?.type) type = String(body.type).toLowerCase();
      } catch (_) { /* ignore */ }
    }
    if (!["webrtc", "websocket", "both"].includes(type)) type = "both";

    const needToken = type === "webrtc" || type === "both";
    const needSigned = type === "websocket" || type === "both";

    const [tokenRes, signedRes] = await Promise.all([
      needToken
        ? fetch(
            `https://api.elevenlabs.io/v1/convai/conversation/token?agent_id=${encodeURIComponent(agentId)}`,
            { headers: { "xi-api-key": ELEVENLABS_API_KEY } },
          )
        : Promise.resolve(null as any),
      needSigned
        ? fetch(
            `https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=${encodeURIComponent(agentId)}`,
            { headers: { "xi-api-key": ELEVENLABS_API_KEY } },
          )
        : Promise.resolve(null as any),
    ]);

    const tokenText = tokenRes ? await tokenRes.text() : "";
    const signedText = signedRes ? await signedRes.text() : "";

    const tokenOk = tokenRes ? tokenRes.ok : false;
    const signedOk = signedRes ? signedRes.ok : false;

    if ((needToken && !tokenOk) && (needSigned && !signedOk)) {
      const status = (tokenRes?.status ?? signedRes?.status ?? 502);
      console.error("elevenlabs token error", tokenRes?.status, tokenText, signedRes?.status, signedText);
      return json({
        error: "elevenlabs_error",
        status,
        token_error: tokenRes ? { status: tokenRes.status, body: tokenText.slice(0, 400) } : null,
        signed_error: signedRes ? { status: signedRes.status, body: signedText.slice(0, 400) } : null,
      }, 502);
    }

    const tokenData = tokenOk ? JSON.parse(tokenText) : null;
    const signedData = signedOk ? JSON.parse(signedText) : null;

    let avaSession: string | null = null;
    try { avaSession = await signAvaSession(userRes.user.id, 1800); }
    catch (e) { console.warn("ava_session_sign_failed", (e as Error).message); }

    const brokerName = prof.full_name ?? "Courtier";
    const brokerFirstName = brokerName.trim().split(/\s+/)[0] ?? brokerName;
    const brokerExtension = prof.extension ?? "";

    const dynamicVars: Record<string, string> = {
      ava_broker_name: brokerName,
      ava_broker_first_name: brokerFirstName,
      ava_broker_extension: brokerExtension,
    };
    if (avaSession) {
      dynamicVars.ava_session_token = avaSession;
      dynamicVars.secret__ava_session_token = avaSession;
    }

    return json({
      token: tokenData?.token ?? null,
      signed_url: signedData?.signed_url ?? null,
      agent_id: agentId,
      broker: { name: brokerName, first_name: brokerFirstName, extension: brokerExtension },
      ava_session_token: avaSession,
      dynamic_variables: dynamicVars,
    });
  } catch (e) {
    console.error("pp-ava-webrtc-token", e);
    return json({ error: (e as Error).message ?? "internal_error" }, 500);
  }
});
