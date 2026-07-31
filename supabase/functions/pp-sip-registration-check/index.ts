// pp-sip-registration-check — READ-ONLY fallback check of the backend
// registration/subscription state for the calling broker.
//
// Called by the mobile app on every foreground resume so a "partially
// registered" state (JsSIP thinks it is registered but NS has no live binding,
// or the VoIP push token / `call` subscription is missing) is detected and
// self-healed on the client side.
//
// STRICTLY READ-ONLY on NetSapiens: it never writes devices, answering rules,
// DIDs or routing. It only GETs and reports.
import { corsHeaders, jsonResponse, nsFetch, requirePlanipretBroker } from "../_shared/planipret-ns.ts";

const arrOf = (d: any): any[] =>
  Array.isArray(d) ? d : (Array.isArray(d?.data) ? d.data : (Array.isArray(d?.items) ? d.items : (d ? [d] : [])));

const yes = (v: unknown) => ["yes", "true", "1", "on"].includes(String(v ?? "").toLowerCase());

async function get(path: string) {
  try {
    const res = await nsFetch(path, { method: "GET" }, { functionName: "pp-sip-registration-check" });
    const text = await res.text().catch(() => "");
    let data: any = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = null; }
    return { ok: res.ok, status: res.status, data };
  } catch {
    return { ok: false, status: 0, data: null };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "method_not_allowed" }, 405);

  const auth = await requirePlanipretBroker(req);
  if (auth instanceof Response) return auth;
  const { ctx, supabase } = auth;

  const d = encodeURIComponent(ctx.nsDomain);
  const e = encodeURIComponent(ctx.extension);

  // 1) Live REGISTER bindings (NS-API v2: registrations live under the user and
  //    under each device — probe both, docs/netsapiens/registrations.md).
  const devicesRes = await get(`/domains/${d}/users/${e}/devices`);
  const devices = arrOf(devicesRes.data);
  const deviceIds = devices
    .map((x: any) => String(x?.device ?? x?.aor ?? x?.name ?? "").replace(/^sip:/, "").split("@")[0])
    .filter(Boolean);

  const regProbes = [
    await get(`/domains/${d}/users/${e}/registrations`),
    ...(await Promise.all(
      deviceIds.slice(0, 8).map((id) => get(`/domains/${d}/users/${e}/devices/${encodeURIComponent(id)}/registrations`)),
    )),
  ];
  const regRows = regProbes.flatMap((p) => (p.ok ? arrOf(p.data) : []));
  const aors = Array.from(new Set(
    regRows
      .map((r: any) => String(r?.aor ?? r?.device ?? r?.["device-aor"] ?? r?.user ?? "").replace(/^sip:/, "").split("@")[0])
      .filter(Boolean),
  ));
  const mobileAor = `${ctx.extension}M`;
  const mobileRegistered = aors.some((a) => a.toLowerCase() === mobileAor.toLowerCase());

  // 2) Mobile device must have push enabled (docs/netsapiens/devices.md).
  const mobileDevice = devices.find((x: any) =>
    String(x?.device ?? x?.aor ?? x?.name ?? "").toLowerCase().includes(mobileAor.toLowerCase())
  );
  const devicePushEnabled = mobileDevice ? yes(mobileDevice?.["device-push-enabled"]) : null;

  // 3) VoIP push token freshness (Supabase side).
  const { data: tokenRow } = await supabase
    .from("planipret_voip_push_tokens")
    .select("device_token, environment, updated_at")
    .eq("user_id", ctx.userId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const tokenAgeH = tokenRow?.updated_at
    ? Math.round((Date.now() - new Date(tokenRow.updated_at).getTime()) / 3_600_000)
    : null;

  // 4) `call` webhook subscription — required to wake the suspended app.
  const subs = await get(`/subscriptions`);
  const callSubscription = arrOf(subs.data).some((s: any) =>
    String(s?.model ?? s?.event ?? "").toLowerCase() === "call" &&
    String(s?.["post-url"] ?? s?.post_url ?? "").includes("ns-webhook-receiver")
  );

  const actions: string[] = [];
  if (!mobileRegistered) actions.push("reregister");
  if (!tokenRow?.device_token || (tokenAgeH != null && tokenAgeH > 24)) actions.push("refresh_push_token");

  const healthy = mobileRegistered && !!tokenRow?.device_token && callSubscription;

  return jsonResponse({
    ok: true,
    healthy,
    extension: ctx.extension,
    domain: ctx.nsDomain,
    registration: {
      mobile_aor: mobileAor,
      mobile_registered: mobileRegistered,
      registered_aors: aors,
      count: regRows.length,
    },
    push: {
      device_push_enabled: devicePushEnabled,
      token_present: !!tokenRow?.device_token,
      token_environment: tokenRow?.environment ?? null,
      token_age_hours: tokenAgeH,
    },
    call_subscription: callSubscription,
    actions,
  });
});
