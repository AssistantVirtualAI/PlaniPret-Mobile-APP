/**
 * Reprise de la ligne mobile par l'application (OTA, aucun code natif).
 *
 * NetSapiens n'accepte qu'UN propriétaire utile par AOR `<ext>M`
 * (docs/netsapiens/registrations.md). Le service de maintien en arrière-plan
 * (`Planipret iOS KeepAlive`) peut tenir la ligne alors que l'app est au
 * premier plan : la ligne paraît « en ligne » côté serveur, mais aucun appel
 * ne porte d'audio dans l'application.
 *
 * Règle appliquée ici : au premier plan et hors appel, l'APPLICATION doit être
 * propriétaire. On libère le service de maintien, on réenregistre la WebView,
 * puis on revérifie auprès du serveur. Attente croissante pour ne jamais
 * marteler ni créer de double REGISTER.
 */
import { ppSipProvider } from "@/lib/planipret/sip/ppSipProvider";
import { Capacitor } from "@capacitor/core";
import { nativeSip } from "@/lib/planipret/sip/nativeSipService";
import {
  getPlanipretSipKeepAliveStatus,
  stopPlanipretSipKeepAlive,
} from "@/lib/planipret/sip/nativePpSipService";
import { checkSipBackendRegistration, type SipBackendCheck } from "@/lib/planipret/sip/sipBackendCheck";

const BACKOFF_MS = [0, 15_000, 60_000, 300_000];

let attempt = 0;
let nextAllowedAt = 0;
let running = false;

export type OwnershipRepairResult = {
  attempted: boolean;
  holder: "app" | "background" | "none" | "unknown";
  repaired: boolean;
  reason?: string;
};

function callActive(): boolean {
  try {
    if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === "ios" && nativeSip.getCallId()) return true;
    const s = ppSipProvider.getSnapshot();
    return s.callState !== "idle" && s.callState !== "ended";
  } catch {
    return false;
  }
}

function foreground(): boolean {
  return typeof document === "undefined" || document.visibilityState === "visible";
}

export function resetOwnershipRepairBackoff() {
  attempt = 0;
  nextAllowedAt = 0;
}

/**
 * À appeler au démarrage et à chaque retour au premier plan.
 * `check` évite un aller-retour réseau quand l'appelant vient déjà de le faire.
 */
export async function ensureForegroundOwnership(
  check?: SipBackendCheck | null,
): Promise<OwnershipRepairResult> {
  if (running) return { attempted: false, holder: "unknown", repaired: false, reason: "busy" };
  if (!foreground()) return { attempted: false, holder: "unknown", repaired: false, reason: "background" };
  if (callActive()) return { attempted: false, holder: "unknown", repaired: false, reason: "call_active" };
  if (Date.now() < nextAllowedAt) {
    return { attempted: false, holder: "unknown", repaired: false, reason: "backoff" };
  }

  running = true;
  try {
    if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === "ios") {
      const repaired = await nativeSip.repairRegistration();
      if (repaired) resetOwnershipRepairBackoff();
      else {
        attempt = Math.min(attempt + 1, BACKOFF_MS.length - 1);
        nextAllowedAt = Date.now() + BACKOFF_MS[attempt];
      }
      return {
        attempted: true,
        holder: repaired ? "app" : "none",
        repaired,
        reason: repaired ? "pjsip_registered" : "pjsip_registration_failed",
      };
    }

    const state = check ?? (await checkSipBackendRegistration({ force: true, minIntervalMs: 0 }));
    const holder = (state?.registration?.holder ?? "unknown") as OwnershipRepairResult["holder"];
    if (!state) return { attempted: false, holder, repaired: false, reason: "no_backend_state" };
    if (holder === "app") {
      resetOwnershipRepairBackoff();
      return { attempted: false, holder, repaired: true };
    }

    // 1) Libérer le service de maintien : il doit rendre l'AOR avant tout
    //    nouveau REGISTER, sinon les deux sockets s'annulent (WSS 1001).
    try {
      const st = await getPlanipretSipKeepAliveStatus().catch(() => null);
      if (st && st.status !== "idle") await stopPlanipretSipKeepAlive();
    } catch { /* plugin absent (web) */ }

    // 2) L'application reprend la ligne.
    try {
      const cfg = ppSipProvider.getConfig();
      if (cfg && ppSipProvider.getSnapshot().status !== "registered") await ppSipProvider.init(cfg);
      else ppSipProvider.forceReregister();
    } catch { /* réessai au prochain passage */ }

    // 3) Confirmation serveur (le REGISTER se propage en quelques secondes).
    let after: SipBackendCheck | null = null;
    for (let i = 0; i < 4; i++) {
      await new Promise((r) => setTimeout(r, 2_000 * (i + 1)));
      if (!foreground() || callActive()) break;
      after = await checkSipBackendRegistration({ force: true, minIntervalMs: 0 });
      if (after?.registration?.holder === "app") break;
    }

    const repaired = after?.registration?.holder === "app";
    if (repaired) {
      resetOwnershipRepairBackoff();
    } else {
      attempt = Math.min(attempt + 1, BACKOFF_MS.length - 1);
      nextAllowedAt = Date.now() + BACKOFF_MS[attempt];
    }
    return {
      attempted: true,
      holder: (after?.registration?.holder ?? holder) as OwnershipRepairResult["holder"],
      repaired,
    };
  } finally {
    running = false;
  }
}
