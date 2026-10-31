/**
 * Arbitrage du chemin d'appel sortant.
 *
 * Invariants Planiprêt :
 * - Toute application native mobile (iOS ou Android) utilise exclusivement
 *   `<ext>M` via PJSIP/TLS 5061.
 * - Le portail/browser utilise exclusivement `<ext>W` via JsSIP/WSS.
 * - Le widget Maestro reste sur `<ext>x` et ne participe jamais à ce contrat.
 * - Une absence ou une erreur du moteur natif n'autorise jamais un REGISTER WSS
 *   sur M : l'application échoue explicitement et protège l'AOR mobile.
 */
export type OutboundRoute =
  | "native"               // PJSIP/TLS sur <ext>M
  | "native_unregistered"  // moteur absent/inactif ou REGISTER M/TLS non confirmé
  | "web";                 // portail : JsSIP/WSS sur <ext>W

/**
 * Conservé pour les appelants existants : aucun binaire mobile ne reçoit à
 * présent l'autorisation de retomber sur W/WSS. Le correctif Android doit être
 * un vrai moteur PJSIP, pas un changement de suffixe.
 */
export function canUseDistinctWebAorFallback(_input: {
  clientType: string;
  isNativePlatform: boolean;
  platform: string;
  nativeFailure: string | null | undefined;
}): boolean {
  return false;
}

export function decideOutboundRoute(input: {
  clientType: string;
  isNativePlatform: boolean;
  platform: string;
  engineAvailable: boolean;
  engineRegistered: boolean;
  allowDistinctWebAorFallback?: boolean;
}): OutboundRoute {
  const nativeMobile = input.clientType === "mobile"
    && input.isNativePlatform
    && (input.platform === "ios" || input.platform === "android");
  if (!nativeMobile) return "web";
  return input.engineAvailable && input.engineRegistered ? "native" : "native_unregistered";
}
