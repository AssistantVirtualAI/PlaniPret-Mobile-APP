/**
 * pp-ns-call-doctor — diagnostic LIVE de la chaîne d'appel Planiprêt.
 *
 * Vérifie, pour le courtier authentifié, tout ce qui doit être vrai côté
 * NetSapiens pour qu'un appel entrant sonne et qu'un appel sortant parte :
 *
 *  1. devices        — `<ext>M` (mobile) et `<ext>W` (WebView) existent,
 *                      expiry 1800s, NAT automatique, transport cohérent.
 *  2. registrations  — au moins un contact enregistré, épinglé sur un noeud
 *                      core (une registration portail n'est PAS utilisée pour
 *                      la livraison entrante → messagerie directe).
 *  3. answer rules   — une règle active qui fait du SimRing vers `<ext>M`.
 *  4. subscriptions  — un abonnement webhook `call` (réveil VoIP push).
 *  5. DID            — le numéro pointe bien vers l'extension.
 *
 * Lecture seule : aucune écriture NS-API. Retourne un verdict par contrôle
 * avec une action lisible en cas d'échec.
 */
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { nsFetch, requirePlanipretBroker, jsonResponse } from "../_shared/planipret-ns.ts";
import { buildCdrE2eReport } from "../_shared/pp-cdr-e2e.ts";

const CORE_HOST = /(^|\.)core\d+\.[^/]*ucstack\.io$/i;
const PORTAL_HOST = /(^|\.)(portal\d*|voice)[^/]*\.(ucstack\.io|ava-telecom\.ca)$/i;

type Check = {
  id: string;
  label: string;
  status: "ok" | "warn" | "fail";
  detail: string;
  action?: string;
  data?: unknown;
};

async function nsJson(path: string): Promise<{ ok: boolean; status: number; body: any }> {
  try {
    const r = await nsFetch(path, { method: "GET" }, { functionName: "pp-ns-call-doctor" });
    const text = await r.text();
    let body: any = null;
    try { body = text ? JSON.parse(text) : null; } catch { body = text; }
    return { ok: r.ok, status: r.status, body };
  } catch (e) {
    return { ok: false, status: 0, body: { error: String((e as Error)?.message ?? e) } };
  }
}

const asArray = (v: any): any[] =>
  Array.isArray(v) ? v : Array.isArray(v?.data) ? v.data : Array.isArray(v?.items) ? v.items : v ? [v] : [];

const hostOf = (raw: unknown) =>
  String(raw ?? "").trim().replace(/^\w+:\/\//, "").replace(/\/+$/, "").replace(/:\d+$/, "");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const auth = await requirePlanipretBroker(req);
  if (auth instanceof Response) return auth;
  const { ctx, supabase } = auth;

  // Un admin Planiprêt peut diagnostiquer n'importe quel courtier via
  // `{ extension: "113" }` ou `{ broker_user_id }`. Sinon, le courtier
  // authentifié se diagnostique lui-même.
  let body: any = {};
  try { body = await req.clone().json(); } catch { /* body vide */ }
  let target = { extension: String(ctx.extension), domain: ctx.nsDomain };
  const wanted = String(body?.extension ?? "").trim();
  const wantedUser = String(body?.broker_user_id ?? "").trim();
  if (wanted || wantedUser) {
    const { data: isAdmin } = await supabase.rpc("is_planipret_admin", { _user_id: ctx.userId });
    if (isAdmin !== true) return jsonResponse({ ok: false, error: "forbidden_admin_only" }, 403);
    const q = supabase
      .from("planipret_profiles")
      .select("extension, ns_extension, ns_domain")
      .limit(1);
    const { data: prof } = wantedUser
      ? await q.eq("user_id", wantedUser).maybeSingle()
      : await q.or(`extension.eq.${wanted},ns_extension.eq.${wanted}`).maybeSingle();
    if (!prof?.ns_domain) return jsonResponse({ ok: false, error: "broker_not_found" }, 404);
    target = {
      extension: String((prof as any).extension || (prof as any).ns_extension),
      domain: String((prof as any).ns_domain),
    };
  }

  const domain = target.domain;
  const ext = target.extension;
  const mobileId = `${ext}M`;
  const widgetId = `${ext}W`;
  const encDomain = encodeURIComponent(domain);
  const encExt = encodeURIComponent(ext);

  const checks: Check[] = [];

  /* ---------------- 1. Devices ---------------- */
  const devRes = await nsJson(`/domains/${encDomain}/users/${encExt}/devices`);
  const devices = asArray(devRes.body);
  const findDev = (id: string) =>
    devices.find((d) => String(d?.device ?? d?.["device"] ?? d?.aor ?? "").replace(/^sip:/, "").split("@")[0] === id);

  for (const [id, label] of [[mobileId, "Device mobile (natif)"], [widgetId, "Device WebView"]] as const) {
    const d = findDev(id);
    if (!d) {
      checks.push({
        id: `device_${id}`,
        label,
        status: "fail",
        detail: `Le device ${id} n'existe pas dans NetSapiens.`,
        action: "Lancer « Synchroniser les appareils » (ns-provision-broker-devices) pour ce courtier.",
      });
      continue;
    }
    const expiry = Number(d["device-sip-registration-expiry-seconds"] ?? 0);
    const transport = String(d["device-sip-transport-type"] ?? d["transport"] ?? "?").toUpperCase();
    const nat = String(d["device-sip-nat-traversal-enabled"] ?? "?");
    const problems: string[] = [];
    // Expiry NS par défaut = 60s : le device est vu « non enregistré » entre
    // deux REGISTER et l'appel part en messagerie.
    if (expiry < 600) problems.push(`expiry ${expiry || "60 (défaut)"}s < 600s`);
    if (nat !== "automatic") problems.push(`NAT traversal = ${nat}`);
    checks.push({
      id: `device_${id}`,
      label,
      status: problems.length ? "warn" : "ok",
      detail: problems.length
        ? `${id} : ${problems.join(", ")} (transport ${transport}).`
        : `${id} OK — transport ${transport}, expiry ${expiry}s, NAT ${nat}.`,
      action: problems.length ? "Relancer la synchronisation des appareils pour réparer ce device." : undefined,
      data: { id, transport, expiry, nat },
    });
  }

  /* ---------------- 2. Registrations ---------------- */
  // NS-API v2 exposes live registration state on each Device object; there is
  // no reliable subscriber-registrations endpoint. Querying that old path made
  // healthy phones appear offline and hid the actual device/core mismatch.
  const regs = devices.filter((d) =>
    String(d?.["device-sip-registration-state"] ?? d?.["registration-state"] ?? "").toLowerCase() === "registered"
  );
  if (!regs.length) {
    checks.push({
      id: "registrations",
      label: "Enregistrements SIP",
      status: "fail",
      detail: "Aucun contact enregistré : tout appel entrant part directement en messagerie.",
      action: "Ouvrir l'application mobile et attendre l'état « Enregistré » dans Diagnostic SIP.",
    });
  } else {
    const summary = regs.map((r) => {
      const aor = String(r?.aor ?? r?.device ?? r?.["device-aor"] ?? "").replace(/^sip:/, "");
      const server = hostOf(r?.["device-sip-registration-core-server"] ?? r?.["core-server"] ?? r?.server);
      return {
        aor,
        server,
        onCore: !!server && CORE_HOST.test(server) && !PORTAL_HOST.test(server),
        expires: r?.["device-sip-registration-expires-datetime"] ?? null,
        userAgent: r?.["device-sip-registration-user-agent"] ?? r?.["user-agent"] ?? null,
      };
    });
    const offCore = summary.filter((s) => s.server && !s.onCore);
    // Deux contacts sur le MÊME AOR = les piles JsSIP et PJSIP se battent :
    // NS ferme la plus ancienne socket (WSS 1001) et l'appel se perd.
    const byAor = new Map<string, number>();
    for (const s of summary) byAor.set(s.aor, (byAor.get(s.aor) ?? 0) + 1);
    const duplicated = [...byAor.entries()].filter(([, n]) => n > 1).map(([a]) => a);

    checks.push({
      id: "registrations",
      label: "Enregistrements SIP",
      status: duplicated.length ? "fail" : offCore.length ? "warn" : "ok",
      detail: duplicated.length
        ? `AOR enregistré en double : ${duplicated.join(", ")} — les deux piles (JsSIP + PJSIP) se disputent l'AOR (fermeture 1001).`
        : offCore.length
          ? `Enregistrement hors noeud core : ${offCore.map((s) => `${s.aor}@${s.server}`).join(", ")}.`
          : `${summary.length} contact(s) enregistré(s) sur un noeud core.`,
      action: duplicated.length
        ? "Désactiver PJSIP ou JsSIP dans Diagnostic SIP, puis relancer l'application."
        : offCore.length
          ? "Une registration portail n'est pas utilisée pour la livraison entrante : forcer core1 et relancer l'app."
          : undefined,
      data: summary,
    });
  }

  /* ---------------- 3. Answer rules / SimRing ---------------- */
  const arRes = await nsJson(`/domains/${encDomain}/users/${encExt}/answerrules`);
  const rules = asArray(arRes.body);
  const active = rules.filter((r) => String(r?.["time-frame"] ?? r?.timeframe ?? "").length > 0);
  const simringHit = rules.find((r) => {
    const blob = JSON.stringify(r ?? {});
    return blob.includes("<OwnDevices>") || blob.includes(mobileId) || /simultaneous|sim-?ring/i.test(blob);
  });
  checks.push({
    id: "answer_rules",
    label: "Règles de réponse (SimRing)",
    status: simringHit ? "ok" : rules.length ? "warn" : "fail",
    detail: simringHit
      ? `SimRing actif et incluant les appareils du poste ${ext}.`
      : rules.length
        ? `${rules.length} règle(s) trouvée(s) mais aucune ne fait sonner ${mobileId}.`
        : "Aucune règle de réponse : l'appel n'est jamais forké vers le mobile.",
    action: simringHit ? undefined : "Lancer « Synchroniser les règles de sonnerie » (pp-sync-answering-rules).",
    data: { total: rules.length, active: active.length },
  });

  /* ---------------- 4. Abonnements webhook ---------------- */
  const subRes = await nsJson(`/subscriptions`);
  const subs = asArray(subRes.body).filter((s) => {
    const blob = JSON.stringify(s ?? {});
    return blob.includes(domain) || !blob.includes("domain");
  });
  const callSub = subs.find((s) => /(^|[^a-z])call([^a-z]|$)/i.test(String(s?.model ?? s?.["subscription-model"] ?? "")));
  checks.push({
    id: "webhook_subscription",
    label: "Abonnement webhook « call »",
    status: callSub ? "ok" : "fail",
    detail: callSub
      ? "Abonnement `call` présent : le push VoIP peut réveiller l'application."
      : "Aucun abonnement `call` : aucun push VoIP, l'app endormie ne sonnera pas.",
    action: callSub ? undefined : "Recréer l'abonnement webhook (modèle `call`, domaine obligatoire côté Reseller).",
    data: { total: subs.length },
  });

  /* ---------------- 5. Routage DID ---------------- */
  const didRes = await nsJson(`/domains/${encDomain}/phonenumbers`);
  const dids = asArray(didRes.body);
  const mine = dids.filter((d) => {
    const dest = String(
      d?.["dial-rule-translation-destination-user"] ?? d?.["destination-user"] ?? d?.destination ?? "",
    );
    return dest === ext || dest.startsWith(`${ext}@`);
  });
  const brokenDid = dids.filter((d) => !String(d?.["dial-rule-translation-destination-user"] ?? "").trim());
  checks.push({
    id: "did_routing",
    label: "Routage des numéros (DID)",
    status: mine.length ? (brokenDid.length ? "warn" : "ok") : "warn",
    detail: mine.length
      ? `${mine.length} numéro(s) routé(s) vers l'extension ${ext}.`
      : `Aucun DID ne pointe directement vers ${ext} (appel via SVI/file d'attente possible).`,
    action: brokenDid.length
      ? `${brokenDid.length} DID sans destination de traduction — exécuter le gardien DID (pp-did-guardian).`
      : undefined,
    data: { mine: mine.length, total: dids.length, broken: brokenDid.length },
  });

  /* ---------------- 6. Bout en bout : CDR reçu + poussé vers Maestro ---------------- */
  const sinceIso = new Date(Date.now() - 30 * 24 * 3_600_000).toISOString();
  const [lastCallRes, lastPushRes, lastFailRes] = await Promise.all([
    supabase
      .from("planipret_phone_calls")
      .select("created_at")
      .eq("extension", ext)
      .gte("created_at", sinceIso)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("planipret_maestro_sync_log")
      .select("created_at")
      .eq("success", true)
      .gte("created_at", sinceIso)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("planipret_maestro_sync_log")
      .select("created_at, response_status, action")
      .eq("success", false)
      .gte("created_at", sinceIso)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const lastCallAt = (lastCallRes.data as any)?.created_at ?? null;
  const lastPushAt = (lastPushRes.data as any)?.created_at ?? null;
  const lastFail = lastFailRes.data as any;
  // Erreur pertinente seulement si elle est postérieure au dernier succès.
  const failIsCurrent = !!lastFail
    && (!lastPushAt || Date.parse(lastFail.created_at) > Date.parse(lastPushAt));

  const e2e = buildCdrE2eReport({
    webhookSubscription: !!callSub,
    lastCallAt,
    lastMaestroPushAt: lastPushAt,
    lastMaestroError: failIsCurrent
      ? `${lastFail.action ?? "push"} → HTTP ${lastFail.response_status ?? "?"} (${lastFail.created_at})`
      : null,
  });
  for (const c of e2e.checks) {
    checks.push({ id: `cdr_${c.id}`, label: c.label, status: c.status, detail: c.detail, action: c.action });
  }

  const failed = checks.filter((c) => c.status === "fail");

  const warned = checks.filter((c) => c.status === "warn");

  return jsonResponse({
    ok: true,
    extension: ext,
    domain,
    devices: { mobile: mobileId, widget: widgetId },
    verdict: failed.length ? "fail" : warned.length ? "warn" : "ok",
    summary: failed.length
      ? `${failed.length} blocage(s) empêchent les appels.`
      : warned.length
        ? `${warned.length} avertissement(s) — les appels peuvent être instables.`
        : "Chaîne d'appel complète et cohérente.",
    checks,
    cdr_e2e: { verdict: e2e.verdict, summary: e2e.summary, last_call_at: lastCallAt, last_maestro_push_at: lastPushAt },
    checked_at: new Date().toISOString(),
  });
});
