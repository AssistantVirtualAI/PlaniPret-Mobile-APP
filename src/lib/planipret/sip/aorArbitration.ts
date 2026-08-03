/**
 * Arbitrage d'AOR — un seul REGISTER par extension.
 *
 * NetSapiens n'accepte qu'un propriétaire utile par AOR : si deux piles
 * (JsSIP dans la WebView + PJSIP natif) REGISTER le même `<ext>M`, le SBC
 * ferme la socket la plus ancienne avec un WSS 1001 et l'appel entrant part
 * en messagerie.
 *
 * Règle imposée ici :
 *  - l'AOR mobile est TOUJOURS `<ext>M` (jamais `<ext>_mobile`, `<ext>W`, …) ;
 *  - sur plateforme native avec le plugin PJSIP disponible, le natif est
 *    propriétaire dès le chargement du bundle (pré-revendication), AVANT même
 *    que les identifiants soient résolus — sinon JsSIP gagne la course au
 *    démarrage et provoque le 1001 ;
 *  - la propriété est persistée (sessionStorage) pour survivre à un reload de
 *    la WebView ;
 *  - JsSIP ne peut ni démarrer d'UA ni REGISTER tant que le natif possède l'AOR.
 */

import { Capacitor } from "@capacitor/core";

const STORAGE_KEY = "pp_sip_aor_owner";
export const PP_AOR_CLAIM_EVENT = "pp:sip-native-owns-aor";
export const PP_AOR_RELEASE_EVENT = "pp:sip-native-released-aor";

export type AorOwner = "native" | "js";

let owner: AorOwner = "js";
let ownedUsername: string | null = null;

const isBrowser = typeof window !== "undefined";

const emit = (name: string, detail: unknown) => {
  if (!isBrowser) return;
  try { window.dispatchEvent(new CustomEvent(name, { detail })); } catch { /* noop */ }
};

/** Normalise n'importe quelle variante d'identifiant mobile vers `<ext>M`. */
export function normalizeMobileAor(usernameOrExt: string): string {
  const raw = String(usernameOrExt ?? "").trim();
  if (!raw) return raw;
  const ext = raw
    .replace(/@.*$/, "")
    .replace(/[_-]?mobile$/i, "")
    .replace(/[MW]$/i, "");
  return `${ext}M`;
}

export function aorExtension(usernameOrExt: string): string {
  return normalizeMobileAor(usernameOrExt).replace(/M$/, "");
}

export function getAorOwner(): AorOwner { return owner; }
export function getOwnedAor(): string | null { return ownedUsername; }
export function nativeOwnsAor(): boolean { return owner === "native"; }
export function jsMayRegister(): boolean { return owner !== "native"; }

/** Le moteur natif prend (ou confirme) la propriété de l'AOR. */
export function claimAorForNative(username?: string | null, reason = "native_engine"): void {
  const normalized = username ? normalizeMobileAor(username) : ownedUsername;
  const changed = owner !== "native" || normalized !== ownedUsername;
  owner = "native";
  ownedUsername = normalized ?? null;
  persist();
  if (!changed) return;
  console.log(`[AOR] propriétaire = natif (${ownedUsername ?? "?"}) — ${reason}`);
  emit(PP_AOR_CLAIM_EVENT, { username: ownedUsername, reason });
}

/** Le natif rend l'AOR (plugin absent, binaire manquant, échec définitif). */
export function releaseAorFromNative(reason = "native_unavailable"): void {
  if (owner !== "native") return;
  owner = "js";
  persist();
  console.warn(`[AOR] propriétaire = JsSIP — ${reason}`);
  emit(PP_AOR_RELEASE_EVENT, { username: ownedUsername, reason });
}

function persist() {
  if (!isBrowser) return;
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ owner, username: ownedUsername }));
  } catch { /* mode privé */ }
}

function restore() {
  if (!isBrowser) return;
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as { owner?: AorOwner; username?: string | null };
    if (parsed?.owner === "native") {
      owner = "native";
      ownedUsername = parsed.username ?? null;
    }
  } catch { /* noop */ }
}

/**
 * Pré-revendication au chargement : sur iOS/Android avec le plugin PJSIP
 * embarqué, le natif est propriétaire par défaut. Cela ferme la fenêtre de
 * course pendant laquelle JsSIP démarrait un UA et REGISTER-ait `<ext>M`.
 */
export function preclaimNativeAor(): boolean {
  restore();
  try {
    if (!Capacitor.isNativePlatform()) return nativeOwnsAor();
    if (!Capacitor.isPluginAvailable("PpPjsip")) return nativeOwnsAor();
  } catch {
    return nativeOwnsAor();
  }
  claimAorForNative(null, "preclaim_native_plugin");
  return true;
}
