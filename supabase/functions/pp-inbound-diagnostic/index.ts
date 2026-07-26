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
  // NOTE: /users/{ext}/subscriptions returns SIP SUBSCRIBE (presence), NOT
  // REGISTER bindings. Real registrations live under the device sub-resource
  // and at domain level — probe all of them.
  const devices = await get(`/domains/${d}/users/${e}/devices`);
  const deviceIds = arrOf(devices.data)
    .map((x: any) => String(x?.device ?? x?.aor ?? x?.name ?? "").replace(/^sip:/, "").split("@")[0])
    .filter(Boolean);
  const regProbes = [
    await get(`/domains/${d}/users/${e}/registrations`),
    await get(`/domains/${d}/registrations?user=${e}`),
    ...(await Promise.all(
      deviceIds.slice(0, 6).map((id) =>
        get(`/domains/${d}/users/${e}/devices/${encodeURIComponent(id)}/registrations`)
      ),
    )),
    await get(`/domains/${d}/users/${e}/subscriptions`),
  ];
  const registrations = {
    path: regProbes.find((p) => p.ok && arrOf(p.data).length)?.path ?? regProbes[0].path,
    status: regProbes.find((p) => p.ok && arrOf(p.data).length)?.status ?? regProbes[0].status,
    ok: regProbes.some((p) => p.ok),
    data: regProbes.flatMap((p) => (p.ok ? arrOf(p.data) : [])),
    probes: regProbes.map((p) => ({ path: p.path, status: p.status, count: p.ok ? arrOf(p.data).length : 0 })),
  } as any;


  // 4) DID inventory — probe domain-wide AND user-scoped endpoints (NS v1/v2 variants)
  const didProbes = [
    await get(`/domains/${d}/phonenumbers`),
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

  // answering rules
  const ruleList = arrOf(rules.data).filter((r) => r && typeof r === "object");
  const tfOf = (r: any) => String(r?.["time-frame"] ?? r?.timeframe ?? r?.time_frame ?? "");
  const defaultRule = ruleList.find((r) => ["default", "*", "always"].includes(tfOf(r).toLowerCase()));
  const activeRule = ruleList.find((r) => yes(r?.["active"]) ) ?? defaultRule;

  if (!ruleList.length) {
    verdicts.push("NO_ANSWERING_RULE");
    issues.push("Aucune règle de réponse retournée par NS — les appels suivent la route par défaut (souvent messagerie).");
  } else if (!defaultRule) {
    verdicts.push("TIMEFRAME_NOT_MATCHED");
    issues.push(`Aucune règle avec timeframe Default/*. Timeframes présents: ${ruleList.map(tfOf).join(", ")}`);
  }

  const simRing = activeRule?.["simultaneous-ring"] ?? null;
  const simList: any[] = arrOf(simRing?.destinations ?? simRing?.list ?? activeRule?.["simultaneous-ring-list"] ?? []);
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

  // devices
  const deviceList = arrOf(devices.data).filter((x) => x && typeof x === "object");
  const regList = arrOf(registrations.data).filter((x) => x && typeof x === "object");
  const registeredAors = new Set<string>();
  for (const r of [...deviceList, ...regList]) {
    const aor = String(
      r?.aor ?? r?.["device"] ?? r?.["aor-user"] ?? r?.["sub-user"] ?? r?.["user"] ?? r?.name ?? "",
    ).replace(/^sip:/, "");
    const exp = Number(r?.expires ?? r?.["registration-expires"] ?? r?.["expires-seconds"] ?? 0);
    const statusStr = String(
      r?.["registration-status"] ?? r?.["device-registration-status"] ?? r?.status ?? "",
    ).toLowerCase();
    const isReg =
      !!(r?.["registration-time"] ?? r?.["reg-time"] ?? r?.contact ?? r?.["registration-contact"] ??
         r?.["contact-uri"] ?? r?.["device-sip-registration-uri"] ?? r?.["registration-ip"] ??
         r?.["ip-address"] ?? r?.["user-agent"]) ||
      exp > 0 ||
      statusStr.includes("register") || statusStr.includes("online") || statusStr === "active";
    if (aor && isReg) registeredAors.add(aor.toLowerCase());
  }

  if (!registeredAors.size) {
    verdicts.push("NO_REGISTRATION_VISIBLE");
    issues.push("NS-API ne montre aucune registration active pour cette extension (endpoint devices/subscriptions).");
  }
  const mobileRegistered = [...registeredAors].some((a) => a.includes(`${ext.toLowerCase()}_mobile`));
  if (registeredAors.size && !mobileRegistered) {
    verdicts.push("MOBILE_DEVICE_NOT_REGISTERED");
    issues.push(`Le device ${ext}_mobile n'apparaît pas enregistré côté NS.`);
  }

  // sim-ring destinations vs registered devices
  const simTargets = simList.map((x) => String(x?.destination ?? x ?? "").toLowerCase()).filter(Boolean);
  const simCoversMobile = simTargets.some((t) => t.includes(`${ext.toLowerCase()}_mobile`));
  const simCoversExtOnly = simTargets.length > 0 && !simCoversMobile;
  if (simCoversExtOnly) {
    verdicts.push("SIM_RING_MISSING_MOBILE");
    issues.push(`La sonnerie simultanée ne cible pas ${ext}_mobile: ${simTargets.join(", ")}`);
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
  if (didsToVoicemail.length) {
    verdicts.push("DID_ROUTED_TO_VOICEMAIL");
    issues.push(`DID routé directement vers la messagerie: ${didsToVoicemail.map(numOf).join(", ")}`);
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
    release_code: c?.["release-code"] ?? c?.["call-release-code"] ?? c?.["disconnect-reason"],
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
      rules_count: ruleList.length,
      active_timeframe: activeRule ? tfOf(activeRule) : null,
      sim_ring_enabled: simEnabled,
      sim_ring_targets: simTargets,
      ring_timeout: ringTimeout || null,
      registered_aors: [...registeredAors],
      mobile_registered: mobileRegistered,
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
