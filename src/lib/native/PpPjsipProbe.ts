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
    useRealAor?: boolean;
    realm?: string;
  }): Promise<{ ok: boolean; code: number; reason: string; transport: string; elapsedMs: number }>;
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

/**
 * useRealAor : REGISTER sur l'AOR de PRODUCTION (<ext>M).
 *
 * L'AOR de test <ext>MPROBE n'existe pas dans NetSapiens : elle reçoit un
 * 403 Forbidden sans jamais de challenge 401, donc elle ne peut PAS valider
 * l'authentification digest. Seule l'AOR réelle le permet.
 *
 * Contrepartie : PJSIP tient alors l'AOR pendant 2 à 3 secondes. On arrête donc
 * JsSIP avant et on le relance après, faute de quoi deux agents se disputeraient
 * le même Contact — exactement le défaut diagnostiqué dans le log du 3 août.
 */
export async function runPjsipRegisterProbe(
  opts: { useRealAor?: boolean; realm?: string } = {}
): Promise<PjsipProbeResult> {
  if (!Capacitor.isNativePlatform()) {
    return { ok: false, reason: "not_native — la sonde PJSIP ne tourne que sur l'appareil" };
  }
  if (!Capacitor.isPluginAvailable("PpPjsip")) {
    return { ok: false, reason: "plugin_missing — PpPjsip absent du build (npx cap sync ios)" };
  }

  const { data, error } = await supabase.functions.invoke("ns-resolve-sip-credentials", {
    body: { client_type: "mobile" },
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
  const useRealAor = opts.useRealAor === true;
  const aor = `sip:${useRealAor ? username : `${username}PROBE`}@${domain}`;
  console.log(
    `[PpPjsipProbe] REGISTER TLS ${server}:${PJSIP_PROBE_PORT} aor=${aor} mode=${useRealAor ? "REAL_AOR" : "PROBE_AOR"}`
  );

  // Mode AOR réelle : libérer l'AOR côté JsSIP avant que PJSIP ne la revendique.
  let jsSipWasStopped = false;
  let savedJsSipConfig: unknown = null;
  if (useRealAor) {
    try {
      const mod = await import("@/lib/planipret/sip/ppSipProvider");
      const provider: any = (mod as any).ppSipProvider ?? (mod as any).default;
      // La config doit être capturée AVANT l'arrêt : c'est le seul moyen de
      // relancer JsSIP ensuite. `ppSipProvider` n'expose pas de `start()`, la
      // reprise se fait par `init(cfg)`, et `stop()` conserve `this.cfg`
      // (aucun `this.cfg = null`), donc getConfig() reste valable après coup.
      savedJsSipConfig = provider?.getConfig?.() ?? null;
      if (provider?.stop) {
        console.log("[PpPjsipProbe] arrêt de JsSIP avant la sonde sur AOR réelle", {
          hasConfig: !!savedJsSipConfig,
        });
        // preserveCallIntent : une sonde ne doit jamais détruire une intention
        // de décrochage en cours.
        provider.stop({ preserveCallIntent: true });
        jsSipWasStopped = true;
        // Laisser NetSapiens traiter le unregister avant de réenregistrer.
        await new Promise((r) => setTimeout(r, 1200));
      }
    } catch (e) {
      console.warn("[PpPjsipProbe] impossible d'arrêter JsSIP", e);
    }
  }

  try {
    const res = await PpPjsip.registerTest({
      username,
      password,
      domain,
      server,
      port: PJSIP_PROBE_PORT,
      transport: "TLS",
      useRealAor,
      realm: opts.realm ?? "*",
    });
    console.log("[PpPjsipProbe] result", res);
    return { ...res, aor };
  } catch (e: any) {
    const reason = `${e?.code ? `${e.code} — ` : ""}${e?.message ?? String(e)}`;
    console.warn("[PpPjsipProbe] failed", reason);
    return { ok: false, reason, aor };
  } finally {
    // Rendre l'AOR à JsSIP dans tous les cas, y compris en cas d'exception.
    if (jsSipWasStopped) {
      try {
        const mod = await import("@/lib/planipret/sip/ppSipProvider");
        const provider: any = (mod as any).ppSipProvider ?? (mod as any).default;
        if (savedJsSipConfig && provider?.init) {
          // Laisser PJSIP relâcher complètement l'AOR : deux agents sur le même
          // Contact, c'est la boucle WSS 1001 diagnostiquée le 3 août.
          await new Promise((r) => setTimeout(r, 800));
          console.log("[PpPjsipProbe] reprise de JsSIP après la sonde (init sur la config sauvegardée)");
          await provider.init(savedJsSipConfig);
        } else {
          console.warn(
            "[PpPjsipProbe] config JsSIP indisponible — utiliser le bouton Re-register pour restaurer l'enregistrement"
          );
        }
      } catch (e) {
        console.warn("[PpPjsipProbe] échec de la reprise JsSIP — utiliser Re-register", e);
      }
    }
  }
}
