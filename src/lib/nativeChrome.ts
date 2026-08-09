import { Capacitor } from "@capacitor/core";

/**
 * Chrome natif (barre de statut / barre de navigation).
 *
 * Objectif : sur Android, obtenir exactement le rendu iOS de la capture —
 * la WebView occupe tout l'écran, la barre de statut est peinte de la même
 * couleur que l'en-tête de l'app et suit le thème clair/sombre.
 *
 * On garde `overlay: false` volontairement : la WebView ne passe donc jamais
 * sous la barre de statut (sur Android `env(safe-area-inset-top)` vaut 0 dans
 * ce mode, ce qui évite tout décalage), et le système peint la bande du haut
 * avec la couleur ci-dessous — visuellement identique à iOS.
 */
const CHROME = {
  dark: { bar: "#060D1A", style: "Dark" as const },
  light: { bar: "#FFFFFF", style: "Light" as const },
};

export async function applyNativeChrome(theme: "light" | "dark") {
  if (!Capacitor.isNativePlatform()) return;
  const c = CHROME[theme];
  try {
    const { StatusBar, Style } = await import("@capacitor/status-bar");
    // Style.Dark = texte clair sur fond sombre ; Style.Light = texte sombre.
    await StatusBar.setStyle({ style: c.style === "Dark" ? Style.Dark : Style.Light });
    if (Capacitor.getPlatform() === "android") {
      await StatusBar.setOverlaysWebView({ overlay: false });
      await StatusBar.setBackgroundColor({ color: c.bar });
    }
  } catch (e) {
    console.warn("[PP] status bar chrome failed", e);
  }

}
