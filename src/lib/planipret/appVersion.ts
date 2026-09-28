/**
 * Version affichée dans l'app mobile.
 *
 * Source de vérité : la build native (@capacitor/app → MARKETING_VERSION /
 * CURRENT_PROJECT_VERSION). Après une soumission App Store / Play, la nouvelle
 * version s'affiche automatiquement — plus rien n'est codé en dur.
 * Les versions OTA ne sont jamais affichées ni appliquées : les mises à jour
 * Planiprêt sont exclusivement distribuées par l'App Store et Google Play.
 */
import { Capacitor } from "@capacitor/core";
import { App } from "@capacitor/app";

export type AppVersionInfo = { label: string; native: string; build: string; ota?: string };

export async function getAppVersionInfo(): Promise<AppVersionInfo> {
  if (!Capacitor.isNativePlatform()) {
    const webVersion = (import.meta as any).env?.VITE_APP_VERSION || "web";
    return { label: `Web (${webVersion})`, native: "web", build: "—" };
  }

  let native = "—";
  let build = "—";

  try {
    const info = await App.getInfo();
    native = info.version || "—";
    build = info.build || "—";
  } catch (err) {
    console.warn("[version] Failed to get native App info", err);
  }

  // Si on est en natif mais que App.getInfo a échoué ou renvoie les valeurs par défaut
  // de Xcode/Android Studio (1.0.0 / 1), on utilise la version de package.json injectée
  // au build par Vite comme indicateur de la version attendue.
  const bundledVersion = (import.meta as any).env?.VITE_APP_VERSION;
  if ((native === "—" || native === "1.0.0") && bundledVersion) {
    native = bundledVersion;
  }

  const label = `v${native} (build ${build})`;
  return { label, native, build };
}
