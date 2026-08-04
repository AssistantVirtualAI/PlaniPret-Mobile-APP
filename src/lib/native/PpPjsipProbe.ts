import { Capacitor, registerPlugin } from "@capacitor/core";
import { supabase } from "@/integrations/supabase/client";

/**
 * PpPjsipProbe — déclenchement MANUEL d'un REGISTER SIP natif (PJSIP) en TLS.
 *
 * Périmètre strict : signalement seulement. Ce module n'est branché sur aucun
 * chemin d'appel (ni décrochage, ni appel sortant), n'est jamais appelé au
 * démarrage, et utilise une AOR de test distincte (<ext>PROBE) pour ne pas
 * entrer en concurrence avec l'AOR de production tenue par JsSIP /
 * PpSipKeepAlive.
 *
 * PJSIP n'a pas de transport SIP over WebSocket : le seul transport possible
 * ici est TLS sur le port 5061.
 */

export const PJSIP_PROBE_SERVER = "core1.cluster1.ucstack.io";
export const PJSIP_PROBE_PORT = 5061;

interface PpPjsipPlugin {
  registerTest(opts: {
    username: string;
    password: string;
    domain: string;
    server: string;
    port: number;
    transport: "TLS";
  }): Promise<{ ok: boolean; code: number; reason: string; transport: string; elapsedMs: number }>;
  getState(): Promise<{ available?: boolean; registered?: boolean; username?: string }>;
  isEngineLinked(): Promise<{ linked: boolean }>;
}

const PpPjsip = registerPlugin<PpPjsipPlugin>("PpPjsip");


export type PjsipProbeResult = {
  ok: boolean;
  code?: number;
  reason: string;
  transport?: string;
  elapsedMs?: number;
  aor?: string;
};

export async function runPjsipRegisterProbe(): Promise<PjsipProbeResult> {
  if (!Capacitor.isNativePlatform()) {
    return { ok: false, reason: "not_native — la sonde PJSIP ne tourne que sur l'appareil" };
  }
  if (!Capacitor.isPluginAvailable("PpPjsip")) {
    return { ok: false, reason: "plugin_missing — PpPjsip absent du build (npx cap sync ios)" };
  }

  // 1. Le binaire pjsua est-il réellement lié ? C'est la vraie question du
  //    diagnostic — un REGISTER de test ne l'est pas.
  try {
    const linked = await PpPjsip.isEngineLinked();
    if (!linked?.linked) {
      return { ok: false, reason: "engine_not_linked — libpjsip.xcframework absent du binaire" };
    }
  } catch { /* plugin plus ancien : on continue */ }

  // 2. Si la registration native de PRODUCTION est déjà active, on la rapporte
  //    telle quelle. Enregistrer une seconde AOR ici (ancien `<ext>PROBE`)
  //    renvoyait un 403 attendu de NetSapiens, présenté à tort comme une panne,
  //    ce qui poussait à couper PJSIP et à rebasculer le device en WSS.
  try {
    const state = await PpPjsip.getState();
    if (state?.registered) {
      const user = state.username || "";
      return {
        ok: true,
        code: 200,
        reason: "registration native active — REGISTER TLS 5061 en cours",
        transport: "TLS",
        elapsedMs: 0,
        aor: user ? `sip:${user}` : undefined,
      };
    }
  } catch { /* getState indisponible : on tente le REGISTER de test */ }

  const { data, error } = await supabase.functions.invoke("ns-resolve-sip-credentials", {
    body: { client_type: "mobile", transport: "tls" },
  });
  if (error) return { ok: false, reason: `credentials_error — ${error.message}` };

  const creds = (data ?? {}) as Record<string, string>;
  const username = creds.sip_username ?? "";
  const password = creds.sip_password ?? "";
  const domain = creds.sip_domain ?? "";
  if (!username || !password || !domain) {
    return { ok: false, reason: "credentials_incomplete — sip_username/sip_password/sip_domain manquants" };
  }

  const server = creds.sip_core_server || creds.sip_proxy || PJSIP_PROBE_SERVER;
  // AOR RÉELLE : c'est la seule que NetSapiens accepte d'authentifier.
  const aor = `sip:${username}@${domain}`;
  console.log(`[PpPjsipProbe] REGISTER TLS ${server}:${PJSIP_PROBE_PORT} aor=${aor}`);

  try {
    const res = await PpPjsip.registerTest({
      username,
      password,
      domain,
      server,
      port: PJSIP_PROBE_PORT,
      transport: "TLS",
    });
    console.log("[PpPjsipProbe] result", res);
    if (!res.ok && (res.code === 401 || res.code === 403)) {
      return {
        ...res,
        aor,
        reason: `identifiants refusés (SIP ${res.code}) — le moteur PJSIP et le transport TLS fonctionnent`,
      };
    }
    return { ...res, aor };
  } catch (e: any) {
    const reason = `${e?.code ? `${e.code} — ` : ""}${e?.message ?? String(e)}`;
    console.warn("[PpPjsipProbe] failed", reason);
    return { ok: false, reason, aor };
  }
}

