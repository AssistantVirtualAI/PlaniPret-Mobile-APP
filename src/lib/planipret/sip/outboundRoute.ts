/**
 * Arbitrage du chemin d'appel sortant.
 *
 * Règle : iOS utilise exclusivement PJSIP/TLS sur `<ext>M`. Android et le web
 * utilisent JsSIP/WSS sur `<ext>W`. Un binaire iOS sans moteur PJSIP doit
 * échouer explicitement plutôt que de mélanger l'identité W avec l'AOR M.
 *
 * Le repli REST (`pp-ns-calls action:start`) n'établit aucune jambe média vers
 * l'appareil : il affichait « Ringing » alors que rien ne sonnait. Il reste
 * interdit sur mobile et réservé au client web.
 */
export type OutboundRoute =
  | "native"               // composer via le moteur natif
  | "native_unregistered"  // moteur présent mais ligne non inscrite → erreur honnête
  | "webview"              // moteur absent : JsSIP dans la WebView (OTA, audio réel)
  | "web";                 // client web : JsSIP puis repli PBX

export function decideOutboundRoute(input: {
  clientType: string;
  isNativePlatform: boolean;
  platform: string;
  engineAvailable: boolean;
  engineRegistered: boolean;
}): OutboundRoute {
  const nativeMobile = input.clientType === "mobile" && input.isNativePlatform;
  if (!nativeMobile) return "web";
  if (input.platform === "ios") {
    return input.engineAvailable && input.engineRegistered ? "native" : "native_unregistered";
  }
  return "webview";
}
