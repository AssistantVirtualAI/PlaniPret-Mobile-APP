/**
 * Tracks a pending Microsoft SSO attempt so mobile apps can detect when the
 * user returned to the app WITHOUT the deep-link callback firing (e.g. the
 * SFSafariViewController closed manually, or Entra ID never redirected).
 * Persisted in Preferences (native) + localStorage (web) so it survives
 * WebView suspensions on iOS/Android.
 */
import { Capacitor } from "@capacitor/core";

const KEY = "pp_ms365_pending_started_at";

async function setNative(value: string) {
  if (!Capacitor.isNativePlatform()) return;
  try {
    const { Preferences } = await import("@capacitor/preferences");
    await Preferences.set({ key: KEY, value });
  } catch {}
}
async function removeNative() {
  if (!Capacitor.isNativePlatform()) return;
  try {
    const { Preferences } = await import("@capacitor/preferences");
    await Preferences.remove({ key: KEY });
  } catch {}
}
async function getNative(): Promise<string | null> {
  if (!Capacitor.isNativePlatform()) return null;
  try {
    const { Preferences } = await import("@capacitor/preferences");
    const { value } = await Preferences.get({ key: KEY });
    return value ?? null;
  } catch { return null; }
}

export function markMs365Pending(): void {
  const now = String(Date.now());
  try { localStorage.setItem(KEY, now); } catch {}
  try { sessionStorage.setItem(KEY, now); } catch {}
  void setNative(now);
}

export function clearMs365Pending(): void {
  try { localStorage.removeItem(KEY); } catch {}
  try { sessionStorage.removeItem(KEY); } catch {}
  void removeNative();
}

export async function getMs365PendingStartedAt(): Promise<number | null> {
  try {
    const local = localStorage.getItem(KEY) || sessionStorage.getItem(KEY) || (await getNative());
    if (!local) return null;
    const ts = Number(local);
    return Number.isFinite(ts) ? ts : null;
  } catch {
    const v = await getNative();
    return v ? Number(v) || null : null;
  }
}
