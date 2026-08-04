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

  // 1) Live REGISTER bindings.
  //    NS-API v2 has NO /registrations resource (docs/netsapiens/registrations.md):
  //    every 404 we used to collect here made `mobile_registered` permanently
  //    false, which made the app re-REGISTER on every resume — the duplicate
  //    REGISTER on the same AOR is exactly what closes the older WSS socket
  //    with code 1001. Registration state lives ON the device object.
  const devicesRes = await get(`/domains/${d}/users/${e}/devices`);
  const devices = arrOf(devicesRes.data);

  const devId = (x: any) => String(x?.device ?? x?.aor ?? x?.name ?? "").replace(/^sip:/, "").split("@")[0];
  const regExpiresOk = (x: any) => {
    const raw = x?.["device-sip-registration-expires-datetime"];
    if (!raw) return true; // field can lag/replicate; don't invalidate on absence
    const t = Date.parse(String(raw).replace(" ", "T"));
    return !Number.isFinite(t) || t > Date.now();
  };
  const isRegistered = (x: any) =>
    String(x?.["device-sip-registration-state"] ?? x?.registration_state ?? "").toLowerCase() === "registered" &&
    regExpiresOk(x);

  const aors = Array.from(new Set(devices.filter(isRegistered).map(devId).filter(Boolean)));
  const mobileAor = `${ctx.extension}M`;
  let mobileRegistered = aors.some((a) => a.toLowerCase() === mobileAor.toLowerCase());

  // The LIST endpoint sometimes omits registration fields — confirm via DETAIL
  // before declaring the mobile AOR unregistered (avoids false re-REGISTERs).
  if (!mobileRegistered && devices.some((x) => devId(x).toLowerCase() === mobileAor.toLowerCase())) {
    const detail = await get(`/domains/${d}/users/${e}/devices/${encodeURIComponent(mobileAor)}`);
    const row = Array.isArray(detail.data)
      ? detail.data[0]
      : (Array.isArray(detail.data?.data) ? detail.data.data[0] : detail.data);
    if (detail.ok && isRegistered(row)) {
      mobileRegistered = true;
      aors.push(mobileAor);
    }
  }
  const regRows = devices.filter(isRegistered);

  // 1b) The core server that accepted the REGISTER is the one NS uses to route
  //     the inbound INVITE (docs/netsapiens/devices.md: device-sip-registration
  //     -core-server "used to route inbound calls to this device"). A REGISTER
  //     accepted by the portal node instead of a core node looks healthy but
  //     never receives the INVITE -> straight to voicemail.
  const mobileRow = devices.find((x) => devId(x).toLowerCase() === mobileAor.toLowerCase());
  const coreServer = String(mobileRow?.["device-sip-registration-core-server"] ?? "").toLowerCase();
  const coreServerOk = !coreServer || /^core\d+\./.test(coreServer);
  const regContact = String(mobileRow?.["device-sip-registration-contact"] ?? "");
  const regUserAgent = String(mobileRow?.["device-sip-registration-user-agent"] ?? "");

  // 2) Mobile device must have push enabled (docs/netsapiens/devices.md).
  //    The device LIST endpoint often omits `device-push-enabled`, so fall back
  //    to the device DETAIL endpoint before concluding anything.
  const mobileDevice = devices.find((x: any) =>
    String(x?.device ?? x?.aor ?? x?.name ?? "").toLowerCase().includes(mobileAor.toLowerCase())
  );
  let pushRaw = mobileDevice?.["device-push-enabled"];
  if (mobileDevice && (pushRaw === undefined || pushRaw === null || pushRaw === "")) {
    const detail = await get(`/domains/${d}/users/${e}/devices/${encodeURIComponent(mobileAor)}`);
    if (detail.ok) {
      const row = Array.isArray(detail.data)
        ? detail.data[0]
        : (Array.isArray(detail.data?.data) ? detail.data.data[0] : detail.data);
      pushRaw = row?.["device-push-enabled"];
    }
  }
  const pushKnown = pushRaw !== undefined && pushRaw !== null && String(pushRaw) !== "";
  const devicePushEnabled = mobileDevice ? (pushKnown ? yes(pushRaw) : null) : null;


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
  const blockers: string[] = [];
  if (!mobileRegistered) actions.push("reregister");
  if (!tokenRow?.device_token || (tokenAgeH != null && tokenAgeH > 24)) actions.push("refresh_push_token");
  // device-push-enabled=no => NS never fires the APNs VoIP push, no webhook can
  // compensate for that. Surface it as a hard blocker so it gets repaired.
  if (devicePushEnabled === false) {
    blockers.push("MOBILE_PUSH_DISABLED");
    actions.push("repair_device_push");
  }
  if (!mobileDevice) blockers.push("MOBILE_DEVICE_MISSING");
  if (!callSubscription) blockers.push("CALL_SUBSCRIPTION_MISSING");
  if (mobileRegistered && !coreServerOk) {
    blockers.push("REGISTERED_ON_WRONG_CORE");
    actions.push("reregister");
  }

  const healthy = mobileRegistered && !!tokenRow?.device_token && callSubscription &&
    devicePushEnabled !== false && coreServerOk;


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
      core_server: coreServer || null,
      core_server_ok: coreServerOk,
      contact: regContact || null,
      user_agent: regUserAgent || null,
    },
    push: {
      device_push_enabled: devicePushEnabled,
      token_present: !!tokenRow?.device_token,
      token_environment: tokenRow?.environment ?? null,
      token_age_hours: tokenAgeH,
    },
    call_subscription: callSubscription,
    blockers,
    actions,

  });
});
