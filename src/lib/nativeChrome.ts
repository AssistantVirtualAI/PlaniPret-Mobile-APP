import { Capacitor } from "@capacitor/core";

/**
 * Chrome natif (barre de statut / barre de navigation).
 *
 * Objectif : sur Android, obtenir exactement le rendu iOS de la capture —
 * la WebView occupe réellement tout l'écran, jusque derrière la barre de
 * statut, comme sur iOS. Les écrans gèrent déjà leurs safe-area CSS.
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
      await StatusBar.setOverlaysWebView({ overlay: true });
      await StatusBar.setBackgroundColor({ color: "#00000000" });
    }
  } catch (e) {
    console.warn("[PP] status bar chrome failed", e);
  }

}
