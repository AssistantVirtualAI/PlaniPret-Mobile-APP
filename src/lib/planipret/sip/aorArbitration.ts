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
  clearWatchdog();
  // Purge INCONDITIONNELLE de la persistance : un preclaim périmé en
  // sessionStorage réactivait le skip du chemin legacy au reload suivant.
  purgePersistedOwner();
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

function purgePersistedOwner() {
  if (!isBrowser) return;
  try { window.sessionStorage.removeItem(STORAGE_KEY); } catch { /* noop */ }
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

/* ------------------------------------------------------------------ *
 * Interrupteur persistant `pp_pjsip_enabled` (défaut true)
 * ------------------------------------------------------------------ */

export const PP_PJSIP_ENABLED_KEY = "pp_pjsip_enabled";

/** Lecture synchrone (localStorage) — utilisée avant le preclaim. */
export function isPjsipEnabled(): boolean {
  if (!isBrowser) return true;
  // Sur iOS, un binaire qui embarque PpPjsip doit toujours utiliser le moteur
  // natif. Une ancienne valeur `false` laissée par l'écran SIP Debug créait un
  // interblocage : le JS lançait WSS, mais PpSipKeepAlive le refusait puisque
  // PJSIP était réellement lié au binaire. Résultat : aucun propriétaire AOR.
  try {
    if (Capacitor.getPlatform() === "ios" && Capacitor.isPluginAvailable("PpPjsip")) return true;
  } catch { /* web/bridge indisponible */ }
  try {
    return window.localStorage.getItem(PP_PJSIP_ENABLED_KEY) !== "false";
  } catch {
    return true;
  }
}

/** Écrit localStorage + Preferences (survit au redémarrage de l'app). */
export async function setPjsipEnabled(enabled: boolean): Promise<void> {
  try {
    if (!enabled && Capacitor.getPlatform() === "ios" && Capacitor.isPluginAvailable("PpPjsip")) {
      enabled = true;
      console.warn("[AOR] désactivation PJSIP refusée — moteur natif iOS obligatoire");
    }
  } catch { /* web/bridge indisponible */ }
  try { window.localStorage.setItem(PP_PJSIP_ENABLED_KEY, enabled ? "true" : "false"); } catch { /* noop */ }
  try {
    const { Preferences } = await import("@capacitor/preferences");
    await Preferences.set({ key: PP_PJSIP_ENABLED_KEY, value: enabled ? "true" : "false" });
  } catch { /* noop */ }
  if (!enabled) releaseAorFromNative("pp_pjsip_enabled=false");
}

/** Recharge la valeur persistée native vers localStorage au démarrage. */
export async function hydratePjsipEnabled(): Promise<boolean> {
  try {
    if (Capacitor.getPlatform() === "ios" && Capacitor.isPluginAvailable("PpPjsip")) {
      try { window.localStorage.setItem(PP_PJSIP_ENABLED_KEY, "true"); } catch { /* noop */ }
      try {
        const { Preferences } = await import("@capacitor/preferences");
        await Preferences.set({ key: PP_PJSIP_ENABLED_KEY, value: "true" });
      } catch { /* noop */ }
      return true;
    }
  } catch { /* web/bridge indisponible */ }
  // localStorage appartient au bundle courant et doit rester la source de
  // vérité. Une ancienne valeur Preferences (souvent `false` après un test de
  // diagnostic) arrivait de façon asynchrone APRÈS le REGISTER 200 OK, coupait
  // PJSIP et rendait soudainement l'AOR à JsSIP.
  let localValue: string | null = null;
  try { localValue = window.localStorage.getItem(PP_PJSIP_ENABLED_KEY); } catch { /* noop */ }
  if (localValue === "false" || localValue === "true") {
    try {
      const { Preferences } = await import("@capacitor/preferences");
      await Preferences.set({ key: PP_PJSIP_ENABLED_KEY, value: localValue });
    } catch { /* noop */ }
    if (localValue === "false") releaseAorFromNative("pp_pjsip_enabled=false");
    return localValue === "true";
  }
  try {
    const { Preferences } = await import("@capacitor/preferences");
    const { value } = await Preferences.get({ key: PP_PJSIP_ENABLED_KEY });
    if (value === "false" || value === "true") {
      // Le round-trip Preferences peut finir après le preclaim/REGISTER natif.
      // Une ancienne valeur `false` ne doit jamais reprendre la main sur un
      // moteur qui a déjà gagné l'AOR pendant cette même initialisation.
      if (value === "false" && nativeOwnsAor()) {
        try { window.localStorage.setItem(PP_PJSIP_ENABLED_KEY, "true"); } catch { /* noop */ }
        await Preferences.set({ key: PP_PJSIP_ENABLED_KEY, value: "true" });
        console.warn("[AOR] stale pp_pjsip_enabled=false ignored after native preclaim");
        return true;
      }
      try { window.localStorage.setItem(PP_PJSIP_ENABLED_KEY, value); } catch { /* noop */ }
      if (value === "false") releaseAorFromNative("pp_pjsip_enabled=false");
      return value === "true";
    }
  } catch { /* noop */ }
  return isPjsipEnabled();
}

/* ------------------------------------------------------------------ *
 * Chien de garde : PJSIP doit être `registered` dans les 20 s
 * ------------------------------------------------------------------ */

const WATCHDOG_MS = 45_000;
let watchdogTimer: ReturnType<typeof setTimeout> | null = null;

function clearWatchdog() {
  if (watchdogTimer) { clearTimeout(watchdogTimer); watchdogTimer = null; }
}

/**
 * Armé à chaque claim : si l'état natif n'est pas "registered" 20 s plus tard,
 * on conserve l'AOR natif. Basculer automatiquement vers JsSIP crée précisément
 * le double REGISTER WSS/TLS qui rend les appels entrants indécrochables.
 */
export function armAorWatchdog(isRegistered: () => boolean): void {
  clearWatchdog();
  watchdogTimer = setTimeout(() => {
    watchdogTimer = null;
    if (owner !== "native") return;
    let registered = false;
    try { registered = !!isRegistered(); } catch { registered = false; }
    if (registered) return;
    console.warn("[AOR] watchdog: PJSIP not registered after 45s — native ownership preserved");
    emit("pp:sip-native-registration-stalled", { username: ownedUsername, reason: "watchdog_no_register_45s" });
  }, WATCHDOG_MS);
}

export function cancelAorWatchdog(): void { clearWatchdog(); }

/**
 * Pré-revendication au chargement : sur iOS/Android avec le plugin PJSIP
 * réellement LIÉ (isEngineLinked === true), le natif est propriétaire par
 * défaut. Cela ferme la fenêtre de course pendant laquelle JsSIP démarrait un
 * UA et REGISTER-ait `<ext>M`.
 *
 * `isEngineLinked` est vérifié de façon asynchrone juste après : si le binaire
 * PJSIP n'est pas dans l'app, l'AOR est immédiatement rendu à JsSIP.
 */
export function preclaimNativeAor(): boolean {
  restore();
  if (!isPjsipEnabled()) {
    releaseAorFromNative("pp_pjsip_enabled=false");
    return false;
  }
  try {
    if (!Capacitor.isNativePlatform()) return nativeOwnsAor();
    if (!Capacitor.isPluginAvailable("PpPjsip")) {
      releaseAorFromNative("plugin_not_available");
      return false;
    }
  } catch {
    releaseAorFromNative("plugin_probe_failed");
    return false;
  }
  claimAorForNative(null, "preclaim_native_plugin");
  void verifyEngineLinked();
  return true;
}

/** Vérifie que le module pjsua est bien compilé dans le binaire. */
export async function verifyEngineLinked(): Promise<boolean> {
  try {
    const { registerPlugin } = await import("@capacitor/core");
    const plugin = registerPlugin<{ isEngineLinked(): Promise<{ linked: boolean }> }>("PpPjsip");
    const res = await plugin.isEngineLinked();
    if (res?.linked) return true;
    console.warn("[AOR] isEngineLinked=false → PJSIP absent du binaire");
    releaseAorFromNative("engine_not_linked");
    return false;
  } catch (e) {
    console.warn("[AOR] isEngineLinked indisponible → restitution à JsSIP", e);
    releaseAorFromNative("engine_link_probe_failed");
    return false;
  }
}

// Hydratation de l'interrupteur persistant (non bloquante).
void hydratePjsipEnabled();

