/**
 * Restitution de transport après abandon de l'AOR par le moteur natif.
 *
 * Le device NetSapiens `<ext>M` porte UN seul transport
 * (`device-sip-transport-type`). Quand PJSIP s'initialise, il bascule le device
 * en TLS 5061. Si le natif rend ensuite l'AOR (binaire absent, watchdog,
 * interrupteur désactivé), JsSIP REGISTER en WSS 9002 sur un device encore
 * déclaré TLS : le PBX n'y forke jamais les appels entrants → messagerie.
 *
 * Ce module écoute la restitution et remet le device en WSS avant que JsSIP
 * ne (re)démarre son UA.
 */

import { supabase } from "@/integrations/supabase/client";
import { PP_AOR_RELEASE_EVENT } from "./aorArbitration";

export const PP_TRANSPORT_RESTORED_EVENT = "pp:sip-transport-restored-wss";

let installed = false;
let inFlight: Promise<void> | null = null;
let lastRunAt = 0;

/** Repasse `<ext>M` en WSS 9002 côté PBX (idempotent, throttlé à 15 s). */
export async function restoreWssTransport(reason = "aor_released"): Promise<void> {
  if (inFlight) return inFlight;
  if (Date.now() - lastRunAt < 15_000) return;
  lastRunAt = Date.now();

  inFlight = (async () => {
    try {
      const { data, error } = await supabase.functions.invoke("ns-resolve-sip-credentials", {
        body: { client_type: "mobile", transport: "wss" },
      });
      if (error) throw error;
      console.info(`[AOR] transport device remis en WSS (${reason})`, {
        device: (data as any)?.device_name,
        transport: (data as any)?.transport ?? "wss",
      });
      try {
        window.dispatchEvent(new CustomEvent(PP_TRANSPORT_RESTORED_EVENT, { detail: { reason } }));
      } catch { /* noop */ }
    } catch (e) {
      console.warn("[AOR] échec de restitution du transport WSS", e);
    } finally {
      inFlight = null;
    }
  })();

  return inFlight;
}

/** À appeler une fois au montage du softphone. */
export function installAorTransportRecovery(): void {
  if (installed || typeof window === "undefined") return;
  installed = true;
  window.addEventListener(PP_AOR_RELEASE_EVENT, (ev: Event) => {
    const reason = (ev as CustomEvent)?.detail?.reason ?? "aor_released";
    // Le natif ne possède plus l'AOR : JsSIP va REGISTER en WSS.
    void restoreWssTransport(String(reason));
  });
}
