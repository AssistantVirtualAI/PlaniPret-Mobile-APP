// Trigger a validation test call so both the Maestro widget and the mobile
// app ring on a broker's extension in parallel. Admin-only. Uses NS-API to
// originate a call to the broker's extension (which forks to every device).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const NS_API_KEY = Deno.env.get("NS_API_KEY") ?? "";
const NS_API_BASE_URL = Deno.env.get("NS_API_BASE_URL") ?? "https://voice.ava-telecom.ca/ns-api/v2";
const NS_DEFAULT_DOMAIN = Deno.env.get("NS_DEFAULT_DOMAIN") ?? "planipret.ca";
const NS_TEST_CALLER_ID = Deno.env.get("NS_TEST_CALLER_ID") ?? "5555550100";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const authHeader = req.headers.get("Authorization") ?? "";
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData } = await userClient.auth.getUser();
  const user = userData?.user;
  if (!user) return json({ error: "not_authenticated" }, 401);

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { data: isSuper } = await admin.rpc("is_super_admin", { _user_id: user.id });
  const { data: isPpAdmin } = await admin.rpc("is_planipret_admin", { _user_id: user.id });
  if (!isSuper && !isPpAdmin) return json({ error: "forbidden" }, 403);

  const body: any = await req.json().catch(() => ({}));
  const brokerId = String(body?.broker_id ?? "");
  if (!brokerId) return json({ error: "missing_broker_id" }, 400);
  const fromNumber = String(body?.from_number ?? NS_TEST_CALLER_ID);

  const { data: profile, error: pErr } = await admin
    .from("planipret_profiles")
    .select("id,full_name,ns_extension,ns_domain")
    .eq("id", brokerId)
    .maybeSingle();
  if (pErr || !profile) return json({ error: "profile_not_found" }, 404);
  const ext = profile.ns_extension;
  if (!ext) return json({ error: "no_extension" }, 400);
  const domain = profile.ns_domain || NS_DEFAULT_DOMAIN;

  // NS-API originate: dial the extension itself; NS forks to every registered
  // device (widget + mobile). caller_id_number = admin test line.
  const nsRes = await fetch(
    `${NS_API_BASE_URL}/domains/${encodeURIComponent(domain)}/users/${encodeURIComponent(ext)}/calls`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${NS_API_KEY}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        to_number: ext,
        caller_id_number: fromNumber,
        caller_id_name: "TEST PLANIPRET",
      }),
    },
  );
  const nsText = await nsRes.text();
  let nsData: any = null;
  try { nsData = nsText ? JSON.parse(nsText) : null; } catch { nsData = nsText; }

  const nsCallId = nsData?.call_id ?? nsData?.id ?? null;
  const testSessionId = nsCallId ?? crypto.randomUUID();

  // Track the test session so the admin UI can watch which device answers.
  try {
    await admin.from("planipret_call_sessions").upsert({
      call_id: testSessionId,
      broker_id: brokerId,
      direction: "inbound",
      remote_number: fromNumber,
      state: "ringing",
      started_at: new Date().toISOString(),
    } as any, { onConflict: "call_id" });
  } catch (e) {
    console.error("call_session_upsert_failed", (e as Error).message);
  }

  try {
    await admin.from("planipret_ns_migration_log").insert({
      broker_id: brokerId,
      action: "test_call",
      status: nsRes.ok ? "ok" : "error",
      details: { ns_status: nsRes.status, ns_call_id: nsCallId, from: fromNumber, ext, triggered_by: user.id },
    });
  } catch { /* ignore */ }

  if (!nsRes.ok) {
    return json({
      ok: false,
      error: "ns_originate_failed",
      ns_status: nsRes.status,
      ns_body: nsData,
      test_session_id: testSessionId,
    }, 200);
  }

  return json({
    ok: true,
    test_session_id: testSessionId,
    ns_call_id: nsCallId,
    tip: "Décrochez sur un appareil ; l'autre doit s'éteindre automatiquement.",
  });
});
