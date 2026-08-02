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
  //
  // ROOT CAUSE of the permanent false negative (docs/netsapiens/registrations.md,
  // verbatim): "NS-API v2 does not expose a separate top-level '/registrations'
  // resource; SIP registration state/contact/expiry info is embedded directly on
  // the Device object". We were probing /users/{ext}/registrations and
  // /devices/{id}/registrations - endpoints that DO NOT EXIST - so every probe
  // 404'd, registered_aors was always [] and mobile_registered always false,
  // while the portal clearly showed 113M and 113W registered. The client reacted
  // to that with `hard transport rebuild (push_wake_pbx_unregistered)` DURING the
  // inbound ring, tearing down the very socket the INVITE was arriving on.
  //
  // Registration state now comes from the Device object, using the three checks
  // documented under "is my device really registered and reachable":
  //   1. device-sip-registration-state == "registered"
  //   2. device-sip-registration-expires-datetime in the future
  //   3. device-sip-registration-core-server is a healthy core node
  const devicesRes = await get(`/domains/${d}/users/${e}/devices`);
  const devices = arrOf(devicesRes.data);
  const mobileAor = `${ctx.extension}M`;

  const devId = (x: any) =>
    String(x?.device ?? x?.aor ?? x?.name ?? "").replace(/^sip:/, "").split("@")[0];
  const regExpiresOk = (x: any) => {
    const raw = x?.["device-sip-registration-expires-datetime"];
    // The field is nullable and "may lag for replication" (devices.md), so its
    // absence must never invalidate an otherwise `registered` state.
    if (!raw) return true;
    const t = Date.parse(String(raw).replace(" ", "T"));
    return !Number.isFinite(t) || t > Date.now();
  };
  const isRegistered = (x: any) =>
    String(x?.["device-sip-registration-state"] ?? x?.registration_state ?? "").toLowerCase() ===
      "registered" && regExpiresOk(x);

  const aors = Array.from(new Set(devices.filter(isRegistered).map(devId).filter(Boolean)));
  let seen = aors.some((a) => a.toLowerCase() === mobileAor.toLowerCase());

  // The LIST endpoint sometimes omits the registration fields; confirm through
  // the DETAIL endpoint before declaring the mobile AOR unregistered, otherwise
  // we resurrect the very false negative this function is meant to kill.
  if (!seen && devices.some((x: any) => devId(x).toLowerCase() === mobileAor.toLowerCase())) {
    const detail = await get(`/domains/${d}/users/${e}/devices/${encodeURIComponent(mobileAor)}`);
    const row = Array.isArray(detail.data)
      ? detail.data[0]
      : (Array.isArray(detail.data?.data) ? detail.data.data[0] : detail.data);
    if (detail.ok && isRegistered(row)) {
      seen = true;
      aors.push(mobileAor);
    }
  }
  const regRows = devices.filter(isRegistered);

  // 1b) The core server that accepted the REGISTER is the one NetSapiens uses to
  //     route the inbound INVITE (devices.md: "Server handling last registration;
  //     used to route inbound calls to this device"). A REGISTER accepted by the
  //     portal node instead of a core node reads as `registered` but never
  //     receives the INVITE -> straight to voicemail.
  const mobileRow = devices.find((x: any) => devId(x).toLowerCase() === mobileAor.toLowerCase());
  const coreServer = String(mobileRow?.["device-sip-registration-core-server"] ?? "").toLowerCase();
  const coreServerOk = !coreServer || /^core\d+\./.test(coreServer);
  const regContact = String(mobileRow?.["device-sip-registration-contact"] ?? "");
  const regUserAgent = String(mobileRow?.["device-sip-registration-user-agent"] ?? "");

  // NEVER report "not registered" when we simply could not read the PBX. get()
  // swallows every failure into {ok:false}, so an unreachable /devices call must
  // yield `null` (unknown), never `false` - a `false` makes the client tear down
  // its transport, and doing that mid-ring loses the call.
  //
  // Three states: true (seen), false (device list read, AOR absent or not
  // registered), null (unreadable => callers must take no corrective action).
  const probesAnswered = devicesRes.ok;
  const probeStatuses = [devicesRes.status];
  const mobileRegistered: boolean | null = seen
    ? true
    : (probesAnswered && devices.length > 0 ? false : null);

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
  // Only a confirmed negative justifies a re-register. `null` means unreadable.
  if (mobileRegistered === false) actions.push("reregister");
  if (!tokenRow?.device_token || (tokenAgeH != null && tokenAgeH > 24)) actions.push("refresh_push_token");
  // device-push-enabled=no => NS never fires the APNs VoIP push, no webhook can
  // compensate for that. Surface it as a hard blocker so it gets repaired.
  if (devicePushEnabled === false) {
    blockers.push("MOBILE_PUSH_DISABLED");
    actions.push("repair_device_push");
  }
  if (!mobileDevice) blockers.push("MOBILE_DEVICE_MISSING");
  // Registered on the wrong node = registered but unreachable. Report it, but do
  // NOT let it flip `healthy` into a transport rebuild: the fix is a re-REGISTER
  // to a core node, not a teardown of a live socket.
  if (seen && !coreServerOk) blockers.push("REGISTERED_ON_NON_CORE_SERVER");
  if (!callSubscription) blockers.push("CALL_SUBSCRIPTION_MISSING");

  // `unknown` registration must not be reported as unhealthy: the app used that
  // verdict to rebuild its transport mid-ring.
  const healthy = mobileRegistered !== false && !!tokenRow?.device_token && callSubscription &&
    devicePushEnabled !== false;


  return jsonResponse({
    ok: true,
    healthy,
    extension: ctx.extension,
    domain: ctx.nsDomain,
    registration: {
      mobile_aor: mobileAor,
      // true | false | null (null = PBX registrations unreadable, do not act)
      mobile_registered: mobileRegistered,
      registered_aors: aors,
      count: regRows.length,
      // Diagnostics for the unreadable case: 403 = missing API scope,
      // 404 = wrong endpoint for this NS deployment, 0 = network failure.
      probes_answered: probesAnswered,
      probe_statuses: probeStatuses,
      // Routing evidence (devices.md): the core node that accepted the REGISTER
      // is the one NetSapiens uses to deliver the inbound INVITE. A non-core
      // node reads as `registered` yet never receives the call.
      core_server: coreServer || null,
      core_server_ok: coreServerOk,
      registration_contact: regContact || null,
      registration_user_agent: regUserAgent || null,
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
