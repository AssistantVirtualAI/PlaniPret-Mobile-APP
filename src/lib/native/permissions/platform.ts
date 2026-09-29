// Thin wrappers around @capacitor/core so callers don't need lazy imports.
export async function isNative(): Promise<boolean> {
  try {
    const { Capacitor } = await import("@capacitor/core");
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

export async function getPlatform(): Promise<"ios" | "android" | "web"> {
  try {
    const { Capacitor } = await import("@capacitor/core");
    return Capacitor.getPlatform() as "ios" | "android" | "web";
  } catch {
    return "web";
  }
}

export type PermStatus = "granted" | "denied" | "prompt" | "unavailable";

export async function setPref(key: string, value: string) {
  try {
    const { Preferences } = await import("@capacitor/preferences");
    await Preferences.set({ key, value });
  } catch { /* web: ignore */ }
}

export async function getPref(key: string): Promise<string | null> {
  try {
    const { Preferences } = await import("@capacitor/preferences");
    const { value } = await Preferences.get({ key });
    return value ?? null;
  } catch { return null; }
}

export async function openAppSettings() {
  let platform: "ios" | "android" | "web" = "web";
  try {
    const { Capacitor, registerPlugin } = await import("@capacitor/core");
    platform = Capacitor.getPlatform() as "ios" | "android" | "web";
    if (platform === "ios") {
      window.open("app-settings:", "_system");
    } else if (platform === "android") {
      // An Android Settings action is an Intent, not a WebView URL. Navigating
      // to a pseudo-URL would otherwise resolve under https://localhost/.
      const nativeSettings = registerPlugin<{
        openAppSettings: () => Promise<{ ok?: boolean }>;
      }>("PpSipKeepAlive");
      await nativeSettings.openAppSettings();
    }
  } catch {
    // Legacy Android binaries have no native bridge. Never navigate the WebView.
    if (platform !== "android") return;
    window.alert("Ouvrez Réglages Android > Applications > Planiprêt > Autorisations pour activer l'accès.");
  }
}
