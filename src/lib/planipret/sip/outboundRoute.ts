/**
 * Arbitrage du chemin d'appel sortant.
 *
 * Invariants :
 * - iOS avec PJSIP lié utilise exclusivement `<ext>M` en TLS.
 * - Android et le web utilisent `<ext>W` en WSS.
 * - Un binaire iOS où PJSIP est absent peut seulement utiliser le device
 *   distinct `<ext>W` en WSS. Il ne doit jamais REGISTER `<ext>M` en WSS.
 * - Le repli REST ne porte pas de média et reste interdit sur mobile.
 */
export type OutboundRoute =
  | "native"               // composer via PJSIP/TLS sur <ext>M
  | "native_unregistered"  // moteur présent mais ligne M non inscrite
  | "webview"              // device W distinct dans la WebView, média WebRTC
  | "web";                 // client web : JsSIP puis repli PBX

/**
 * Un repli WSS est sûr uniquement si le moteur PJSIP est structurellement
 * indisponible. Une erreur de REGISTER TLS reste sur `<ext>M` : basculer dans
 * ce cas créerait une deuxième identité active et masquerait la panne réelle.
 */
export function canUseDistinctWebAorFallback(input: {
  clientType: string;
  isNativePlatform: boolean;
  platform: string;
  nativeFailure: string | null | undefined;
}): boolean {
  if (input.clientType !== "mobile" || !input.isNativePlatform || input.platform !== "ios") return false;
  return input.nativeFailure === "plugin_absent" || input.nativeFailure === "engine_not_linked";
}

export function decideOutboundRoute(input: {
  clientType: string;
  isNativePlatform: boolean;
  platform: string;
  engineAvailable: boolean;
  engineRegistered: boolean;
  allowDistinctWebAorFallback?: boolean;
}): OutboundRoute {
  const nativeMobile = input.clientType === "mobile" && input.isNativePlatform;
  if (!nativeMobile) return "web";
  if (input.platform === "ios") {
    if (input.engineAvailable && input.engineRegistered) return "native";
    if (input.allowDistinctWebAorFallback === true) return "webview";
    return "native_unregistered";
  }
  return "webview";
}
