// pp-inbound-diagnostic — Read-only inbound-call routing diagnostic for a
// Planiprêt broker extension. Explains WHY inbound calls go straight to
// voicemail: DID routing, answering rule / timeframe, device registrations,
// hidden user-level forwards/DND, and recent inbound CDR release causes.
//
// POST { extension?: string, broker_id?: string, limit?: number }
// Auth: Planiprêt broker (own extension) — admins can pass any extension.

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, jsonResponse, nsFetch } from "../_shared/planipret-ns.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const NS_DEFAULT_DOMAIN = Deno.env.get("NS_DEFAULT_DOMAIN") ?? "planipret.ca";

const RULE_PATHS = ["answerrules", "answeringrules", "answering-rules"];

async function body(res: Response) {
  const t = await res.text().catch(() => "");
  try { return t ? JSON.parse(t) : null; } catch { return t.slice(0, 500); }
}

async function get(path: string) {
  try {
    const res = await nsFetch(path, { method: "GET" }, { functionName: "pp-inbound-diagnostic" });
    return { path, status: res.status, ok: res.ok, data: await body(res) };
  } catch (e) {
    return { path, status: 0, ok: false, error: (e as Error).message, data: null };
  }
}

const arrOf = (d: any): any[] =>
  Array.isArray(d) ? d : (Array.isArray(d?.data) ? d.data : (Array.isArray(d?.items) ? d.items : (d ? [d] : [])));

const yes = (v: unknown) => {
  const s = String(v ?? "").toLowerCase();
  return s === "yes" || s === "true" || s === "1" || s === "on";
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "method_not_allowed" }, 405);

  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token || token === ANON_KEY) return jsonResponse({ error: "Unauthorized" }, 401);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
  const { data: userData } = await admin.auth.getUser(token);
  const caller = userData?.user;
  if (!caller) return jsonResponse({ error: "Unauthorized" }, 401);

  let isAdmin = false;
  for (const fn of ["is_planipret_admin", "is_super_admin"]) {
    if (isAdmin) break;
    try { const { data } = await admin.rpc(fn, { _user_id: caller.id }); if (data) isAdmin = true; } catch { /* ignore */ }
  }

  const input: any = await req.json().catch(() => ({}));
  const limit = Math.max(1, Math.min(20, Number(input?.limit ?? 5)));
  const url = new URL(req.url);
  const rawMode = isAdmin && (input?.raw === true || input?.raw === 1 || url.searchParams.get("raw") === "1");


  // Resolve target extension/domain
  let ext = input?.extension ? String(input.extension) : "";
  let domain = NS_DEFAULT_DOMAIN;

  const { data: ownProfile } = await admin
    .from("planipret_profiles")
    .select("id, user_id, full_name, extension, ns_extension, ns_domain")
    .eq("user_id", caller.id)
    .maybeSingle();

  if (input?.broker_id && isAdmin) {
    const { data: b } = await admin
      .from("planipret_profiles")
      .select("id, user_id, full_name, extension, ns_extension, ns_domain")
      .or(`id.eq.${input.broker_id},user_id.eq.${input.broker_id}`)
      .maybeSingle();
    if (!b) return jsonResponse({ error: "broker_not_found" }, 404);
    ext = String(b.ns_extension ?? b.extension ?? "");
    domain = b.ns_domain || NS_DEFAULT_DOMAIN;
  } else if (ext) {
    if (!isAdmin && String(ownProfile?.ns_extension ?? ownProfile?.extension ?? "") !== ext) {
      return jsonResponse({ error: "forbidden" }, 403);
    }
    domain = ownProfile?.ns_domain || NS_DEFAULT_DOMAIN;
  } else {
    ext = String(ownProfile?.ns_extension ?? ownProfile?.extension ?? "");
    domain = ownProfile?.ns_domain || NS_DEFAULT_DOMAIN;
  }
  if (!ext) return jsonResponse({ error: "no_extension" }, 400);

  const d = encodeURIComponent(domain);
  const e = encodeURIComponent(ext);

  // 1) User record (DND / forwards / voicemail)
  const user = await get(`/domains/${d}/users/${e}`);

  // 2) Answering rules (auto-detect sub-resource)
  let rules: any = { path: null, status: 404, ok: false, data: null };
  for (const p of RULE_PATHS) {
    const r = await get(`/domains/${d}/users/${e}/${p}`);
    if (r.ok) { rules = r; break; }
    rules = r;
  }

  // 3) Devices / registrations
  // NS-API v2 has NO /registrations resource and /subscriptions is SIP
  // SUBSCRIBE (presence), not REGISTER (docs/netsapiens/registrations.md).
  // Registration state lives on the Device object itself.
  const devices = await get(`/domains/${d}/users/${e}/devices`);
  const registrations = {
    path: `/domains/${d}/users/${e}/devices`,
    status: devices.status,
    ok: devices.ok,
    data: arrOf(devices.data),
    probes: [{ path: devices.path, status: devices.status, count: arrOf(devices.data).length }],
  } as any;


  // 4) DID inventory — probe domain-wide AND user-scoped endpoints (NS v1/v2 variants)
  const didProbes = [
    // The unpaginated NS endpoint silently returns only the first 100 DIDs.
    // This tenant has 350+, so it produced false NO_DID_POINTING_TO_EXT
    // verdicts for extensions whose number was beyond page one.
    await get(`/domains/${d}/phonenumbers?limit=1000`),
    await get(`/domains/${d}/users/${e}/phonenumbers`),
    await get(`/domains/${d}/phonenumbers?user=${e}`),
  ];
  const didRows = didProbes.flatMap((p) => (p.ok ? arrOf(p.data) : []));
  const phoneNumbers = {
    path: didProbes.find((p) => p.ok && arrOf(p.data).length)?.path ?? didProbes[0].path,
    status: didProbes.find((p) => p.ok && arrOf(p.data).length)?.status ?? didProbes[0].status,
    ok: didProbes.some((p) => p.ok),
    data: didRows,
    probes: didProbes.map((p) => ({ path: p.path, status: p.status, count: p.ok ? arrOf(p.data).length : 0 })),
  } as any;

  // 5) Recent inbound CDRs
  const cdrs = await get(`/domains/${d}/users/${e}/cdrs?limit=${limit}`);

  // ---- Analysis ----
  const issues: string[] = [];
  const verdicts: string[] = [];
  const u = Array.isArray(user.data) ? user.data[0] : (user.data?.data ?? user.data);

  // user-level DND / forwards
  const dndKeys = ["do-not-disturb", "do-not-disturb-enabled", "dnd"];
  const fwdKeys = [
    "forward-always-enabled", "forward-always", "call-forward-always",
    "forward-on-busy-enabled", "forward-when-unregistered-enabled",
    "forward-no-answer-enabled",
  ];
  const dndOn = dndKeys.some((k) => yes(u?.[k]));
  if (dndOn) { verdicts.push("HIDDEN_DND"); issues.push("DND actif au niveau de l'utilisateur NS."); }
  const activeForwards = fwdKeys.filter((k) => yes(u?.[k]) && !k.startsWith("forward-no-answer"));
  if (activeForwards.length) {
    verdicts.push("HIDDEN_FORWARD");
    issues.push(`Renvoi actif au niveau utilisateur: ${activeForwards.join(", ")}`);
  }
  const callScreeningKeys = [
    "call-screening", "call-screening-enabled",
    "phone-numbers-to-allow-enabled", "phone-numbers-to-reject-enabled",
    "reject-anonymous-calls-enabled", "anonymous-call-rejection-enabled", "anonymous-call-rejection",
  ];
  const activeCallScreening = callScreeningKeys.filter((k) => yes(u?.[k]));
  if (activeCallScreening.length) {
    verdicts.unshift("CALL_SCREENING_BLOCKING");
    issues.unshift(`Call screening / allow-reject list actif: ${activeCallScreening.join(", ")} — cause typique de “No Dial Rule” et voicemail instantané.`);
  }

  // answering rules
  const ruleList = arrOf(rules.data).filter((r) => r && typeof r === "object");
  const tfOf = (r: any) => String(r?.["time-frame"] ?? r?.timeframe ?? r?.time_frame ?? "");
  const defaultRule = ruleList.find((r) => ["default", "*", "always"].includes(tfOf(r).toLowerCase()));
  // NS-API v2 exposes the computed active timeframe as `is-active`.
  const activeRule = ruleList.find((r) => yes(r?.["is-active"])) ?? defaultRule;

  if (!ruleList.length) {
    verdicts.push("NO_ANSWERING_RULE");
    issues.push("Aucune règle de réponse retournée par NS — les appels suivent la route par défaut (souvent messagerie).");
  } else if (!defaultRule) {
    verdicts.push("TIMEFRAME_NOT_MATCHED");
    issues.push(`Aucune règle avec timeframe Default/*. Timeframes présents: ${ruleList.map(tfOf).join(", ")}`);
  }

  const simRing = activeRule?.["simultaneous-ring"] ?? null;
  // NS-API v2 AnswerruleFeatureSimRing stores destinations in `parameters`.
  const simList: any[] = arrOf(simRing?.parameters ?? []);
  const simEnabled = yes(simRing?.enabled) || yes(activeRule?.["simultaneous-ring-enabled"]);
  const ringTimeout = Number(
    simRing?.timeout ?? activeRule?.["ring-timeout"] ?? activeRule?.["timeout"] ?? 0,
  );
  if (activeRule && !simEnabled && !simList.length) {
    verdicts.push("SIM_RING_DISABLED");
    issues.push("La règle active n'a pas de sonnerie simultanée activée.");
  }
  if (activeRule && ringTimeout > 0 && ringTimeout < 15) {
    verdicts.push("RING_TIMEOUT_TOO_SHORT");
    issues.push(`Ring timeout = ${ringTimeout}s : trop court pour un mobile (push + réveil). Minimum recommandé 25-35s.`);
  }
  const ruleDnd = yes(activeRule?.["do-not-disturb"]) || yes(activeRule?.["do-not-disturb-enabled"]);
  if (ruleDnd) { verdicts.push("RULE_DND"); issues.push("La règle active a DND=yes."); }
  const ruleFwdAlways = yes(activeRule?.["forward-always"]?.enabled) || yes(activeRule?.["forward-always-enabled"]);
  if (ruleFwdAlways) { verdicts.push("RULE_FORWARD_ALWAYS"); issues.push("La règle active a un renvoi permanent activé."); }

  // devices — a device is registered ONLY when NS says so
  // (`device-sip-registration-state == "registered"` AND the expiry is in the
  // future). The old heuristic treated `device-sip-registration-uri` — a field
  // always present on every device — as proof of registration, so this
  // diagnostic reported unregistered mobiles as registered.
  const deviceList = arrOf(devices.data).filter((x) => x && typeof x === "object");
  const registeredAors = new Set<string>();
  for (const r of deviceList) {
    const aor = String(
      r?.["device"] ?? r?.aor ?? r?.["aor-user"] ?? r?.name ?? "",
    ).replace(/^sip:/, "");
    const state = String(
      r?.["device-sip-registration-state"] ?? r?.["registration-status"] ?? r?.status ?? "",
    ).toLowerCase();
    const expRaw = r?.["device-sip-registration-expires-datetime"];
    const expTs = expRaw ? Date.parse(String(expRaw).replace(" ", "T")) : NaN;
    const notExpired = !Number.isFinite(expTs) || expTs > Date.now();
    if (aor && state === "registered" && notExpired) registeredAors.add(aor.toLowerCase());
  }

  if (!registeredAors.size) {
    verdicts.push("NO_REGISTRATION_VISIBLE");
    issues.push("NS-API ne montre aucune registration active pour cette extension (endpoint devices/subscriptions).");
  }
  const mobileAor = `${ext.toLowerCase()}m`;
  const legacyMobileAor = `${ext.toLowerCase()}_mobile`;
  const mobileRegistered = [...registeredAors].some((a) => {
    const user = a.replace(/^sip:/, "").split("@")[0];
    return user === mobileAor || user === legacyMobileAor;
  });
  if (registeredAors.size && !mobileRegistered) {
    verdicts.push("MOBILE_DEVICE_NOT_REGISTERED");
    issues.push(`Le device ${ext}M n'apparaît pas enregistré côté NS.`);
  }

  // device-push-enabled (docs/netsapiens/devices.md): a mobile client that is
  // suspended in the background only rings if NS is allowed to push-wake it.
  // READ-ONLY: we never write this back automatically.
  const pushFlags = deviceList.map((d: any) => ({
    aor: String(d?.aor ?? d?.device ?? d?.["device-aor"] ?? d?.name ?? "").replace(/^sip:/, ""),
    pushEnabled: String(d?.["device-push-enabled"] ?? d?.push_enabled ?? "").toLowerCase(),
    regState: String(d?.["device-sip-registration-state"] ?? d?.["registration-status"] ?? "").toLowerCase(),
  })).filter((d) => d.aor);
  const mobilePush = pushFlags.find((d) => {
    const user = d.aor.split("@")[0].toLowerCase();
    return user === mobileAor || user === legacyMobileAor;
  });
  if (mobilePush && mobilePush.pushEnabled === "no") {
    verdicts.push("MOBILE_PUSH_DISABLED");
    issues.push(`device-push-enabled=no sur ${mobilePush.aor} : NS ne réveillera pas l'app en arrière-plan. À corriger manuellement dans le portail.`);
  }


  // sim-ring destinations vs registered devices
  const simTargets = simList.map((x) => String(x?.destination ?? x ?? "").toLowerCase()).filter(Boolean);
  const simCoversMobile = simTargets.some((t) =>
    t === "<owndevices>" || t.includes(`${ext.toLowerCase()}m`) || t.includes(`${ext.toLowerCase()}_mobile`)
  );
  const simCoversExtOnly = simTargets.length > 0 && !simCoversMobile;
  if (simCoversExtOnly) {
    verdicts.push("SIM_RING_MISSING_MOBILE");
    issues.push(`La sonnerie simultanée ne cible pas ${ext}M / <OwnDevices>: ${simTargets.join(", ")}`);
  }

  // DIDs pointing at this extension — dedupe by number, match on ANY destination-ish field
  const numbersRaw = arrOf(phoneNumbers.data).filter((x) => x && typeof x === "object");
  const numOf = (n: any) => String(
    n?.["phonenumber"] ?? n?.["phone-number"] ?? n?.number ?? n?.did ?? "",
  ).trim();
  const seenNum = new Set<string>();
  const numbers = numbersRaw.filter((n) => {
    const k = numOf(n) || JSON.stringify(n);
    if (seenNum.has(k)) return false;
    seenNum.add(k);
    return true;
  });
  const destFields = [
    "destination", "dialrule-application", "dial-rule-application",
    "dialrule-parameter", "dial-rule-parameter",
    "dialrule-destination", "dial-rule-destination", "application",
    "to-user", "users", "user", "dest-user", "destination-user",
    "dialrule-translation-destination", "dial-rule-translation-destination",
    "forward-destination", "owner",
  ];
  const extRe = new RegExp(`(^|[^0-9])${ext}([^0-9]|$)`);
  const destOf = (n: any) =>
    destFields.map((f) => String(n?.[f] ?? "")).filter(Boolean).join(" ");
  const mine = numbers.filter((n) => {
    const t = destOf(n);
    return extRe.test(t) || t.toLowerCase().includes(`${ext.toLowerCase()}@`);
  });
  const didsToVoicemail = mine.filter((n) => {
    const t = destOf(n).toLowerCase();
    return t.includes("vmail") || t.includes("voicemail");
  });
  const didsToApp = mine.filter((n) => {
    const t = destOf(n).toLowerCase();
    return t.includes("speakaccount") || t.includes("speakeraccount") ||
      (t.includes("application") && (t.includes("agent") || t.includes("ai")));
  });
  const didsNotToUser = mine.filter((n) => {
    const t = destOf(n).toLowerCase();
    const app = String(n?.["dial-rule-application"] ?? n?.["dialrule-application"] ?? n?.application ?? n?.["dest-application"] ?? "").toLowerCase();
    return app && !["to-user", "user", "sip"].includes(app) && !t.includes(`${ext.toLowerCase()}@`) && !new RegExp(`(^|[^0-9])${ext}([^0-9]|$)`).test(t);
  });
  if (didsToVoicemail.length) {
    verdicts.push("DID_ROUTED_TO_VOICEMAIL");
    issues.push(`DID routé directement vers la messagerie: ${didsToVoicemail.map(numOf).join(", ")}`);
  }
  if (didsToApp.length) {
    verdicts.unshift("DID_ROUTED_TO_SPEAKACCOUNT");
    issues.unshift(`DID routé vers SpeakAccount / agent IA au lieu du poste ${ext}: ${didsToApp.map(numOf).join(", ")}`);
  } else if (didsNotToUser.length) {
    verdicts.push("DID_NOT_ROUTED_TO_USER");
    issues.push(`DID assigné au poste ${ext}, mais application NS différente de to-user: ${didsNotToUser.map(numOf).join(", ")}`);
  }
  if (phoneNumbers.ok && numbers.length && !mine.length) {
    verdicts.push("NO_DID_POINTING_TO_EXT");
    issues.push(`Aucun DID de l'inventaire ne pointe vers l'extension ${ext} (routage possible via file/AA). DIDs lus: ${numbers.length}`);
  }


  // CDR analysis
  const cdrRows = arrOf(cdrs.data).filter((x) => x && typeof x === "object");
  const inbound = cdrRows.filter((c) => {
    const dir = String(c?.["call-direction"] ?? c?.direction ?? "").toLowerCase();
    return !dir || dir.includes("inbound") || dir.includes("in");
  });
  const cdrSummary = inbound.slice(0, limit).map((c) => ({
    id: c?.["call-id"] ?? c?.id,
    time: c?.["time-start"] ?? c?.["start-time"] ?? c?.time_start,
    from: c?.["call-orig-from-user"] ?? c?.["orig-from-user"] ?? c?.from,
    term_user: c?.["call-term-user"] ?? c?.["term-user"] ?? c?.["term-to-user"],
    term_to_uri: c?.["call-term-to-uri"] ?? c?.["term-to-uri"] ?? c?.call_term_to_uri ?? null,
    disposition: c?.["call-disposition"] ?? c?.disposition,
    release_code: c?.["release-code"] ?? c?.["call-release-code"] ?? c?.["disconnect-reason"] ?? c?.["call-disconnect-reason-text"] ?? c?.reason,
    ring_seconds: Number(c?.["time-ringing"] ?? c?.["ring-duration"] ?? c?.["duration-ringing"] ?? 0),
    answer_time: c?.["call-answer-datetime"] ?? c?.["time-answer"] ?? null,
    start_time: c?.["call-start-datetime"] ?? c?.["time-start"] ?? null,
    duration: Number(c?.["duration"] ?? c?.["time-talking"] ?? 0),
  }));
  const straightToVm = cdrSummary.filter(
    (c) => (c.ring_seconds ?? 0) < 3 && String(c.term_user ?? "").toLowerCase().includes("vmail"),
  );
  if (straightToVm.length) {
    verdicts.push("ROUTING_TO_VOICEMAIL");
    issues.push(`${straightToVm.length} appel(s) entrant(s) récent(s) terminés en messagerie avec < 3s de sonnerie → problème de routage, pas de non-réponse.`);
  }

  // Calls answered by a NS *application* (SpeakAccount, AA, VMail, Conference…)
  // instead of a SIP device: term-to-uri is not a sip: AOR and answer == start.
  const appTerminated = cdrSummary.filter((c) => {
    const uri = String(c.term_to_uri ?? "").trim();
    if (!uri) return false;
    if (/^sip:/i.test(uri) || uri.includes("@")) return false;
    const instant = (c.ring_seconds ?? 0) < 3 ||
      (!!c.answer_time && !!c.start_time && String(c.answer_time) === String(c.start_time));
    return instant;
  });
  if (appTerminated.length) {
    const apps = [...new Set(appTerminated.map((c) => String(c.term_to_uri)))];
    verdicts.unshift("TERMINATED_BY_APPLICATION");
    issues.unshift(
      `${appTerminated.length} appel(s) entrant(s) répondu(s) instantanément par une application NS (${apps.join(", ")}) — l'appel n'a jamais été forké vers un device SIP. Interception en amont des answering rules (DID / territoire).`,
    );
  }

  const noDialRule = cdrSummary.filter((c) => /no dial rule/i.test(String(c.release_code ?? "")));
  if (noDialRule.length) {
    verdicts.unshift("NO_DIAL_RULE_BLOCK");
    issues.unshift(`${noDialRule.length} appel(s) récent(s) avec “No Dial Rule” — vérifier/désactiver call screening + listes allow/reject sur le poste.`);
  }

  const unreachable = cdrSummary.filter((c) => {
    const rc = String(c.release_code ?? "");
    return /408|480|486|503|Temporarily Unavailable|Request Timeout/i.test(rc);
  });
  if (unreachable.length) {
    verdicts.push("DEVICES_UNREACHABLE");
    issues.push(`Codes SIP d'injoignabilité détectés: ${unreachable.map((c) => c.release_code).join(", ")}`);
  }

  const primary = verdicts[0] ?? (issues.length ? "UNKNOWN" : "NO_ISSUE_DETECTED");

  try {
    await admin.from("planipret_edge_function_runs").insert({
      function_name: "pp-inbound-diagnostic",
      status: "success",
      triggered_by: caller.id,
      summary: { extension: ext, domain, verdicts, issue_count: issues.length },
    });
  } catch { /* best-effort */ }

  return jsonResponse({
    ok: true,
    extension: ext,
    domain,
    is_admin: isAdmin,
    verdict: primary,
    verdicts,
    issues,
    summary: {
      user_dnd: dndOn,
      user_forwards: activeForwards,
      user_call_screening: activeCallScreening,
      rules_count: ruleList.length,
      active_timeframe: activeRule ? tfOf(activeRule) : null,
      sim_ring_enabled: simEnabled,
      sim_ring_targets: simTargets,
      ring_timeout: ringTimeout || null,
      registered_aors: [...registeredAors],
      mobile_registered: mobileRegistered,
      device_push_flags: pushFlags,
      mobile_push_enabled: mobilePush ? mobilePush.pushEnabled || "unknown" : "unknown",

      dids_total_read: numbers.length,
      dids_matching_extension: mine.map(numOf).filter(Boolean),
      inbound_cdrs: cdrSummary,
    },
    raw: {
      user: { status: user.status, data: u ?? null },
      answering_rules: { path: rules.path, status: rules.status, data: rules.data },
      devices: { status: devices.status, data: devices.data },
      registrations: { status: registrations.status, probes: registrations.probes, data: registrations.data },
      phone_numbers: {
        status: phoneNumbers.status,
        probes: phoneNumbers.probes,
        count: numbers.length,
        all: numbers.map((n) => ({
          number: numOf(n),
          destination: destOf(n),
          application: n?.["dial-rule-application"] ?? n?.["dialrule-application"] ?? n?.application ?? null,
          translation_destination:
            n?.["dial-rule-translation-destination"] ?? n?.["dialrule-translation-destination"] ?? null,
        })),
        matching: mine,
      },
      cdrs: { status: cdrs.status, count: cdrRows.length },
    },
    // raw=1 → unfiltered NS payloads (admin only) for escalation evidence.
    ns_raw: rawMode
      ? {
          user: user.data,
          answering_rules: rules.data,
          answering_rules_path: rules.path,
          devices: devices.data,
          registration_probes: regProbes.map((p) => ({ path: p.path, status: p.status, data: p.data })),
          phonenumber_probes: didProbes.map((p) => ({ path: p.path, status: p.status, data: p.data })),
          cdrs: cdrRows,
        }
      : undefined,

  });
});
