// Build-time injected constants (see vite.config.ts `define`)
import { flushPortalGuardEvents, showPortalGuardToast, trackPortalGuardEvent } from "@/lib/portalGuardMonitoring";

declare const __APP_BUILD_ID__: string;
declare const __APP_BUILD_TIME__: string;

export const BUILD_ID: string =
  typeof __APP_BUILD_ID__ !== "undefined" ? __APP_BUILD_ID__ : "dev";
export const BUILD_TIME: string =
  typeof __APP_BUILD_TIME__ !== "undefined" ? __APP_BUILD_TIME__ : new Date().toISOString();

export const APP_VERSION = `v${BUILD_TIME.slice(0, 10)}·${BUILD_ID}`;

/**
 * Hard reload — clears caches, unregisters service workers, then bypasses
 * the HTTP cache via a one-shot query param. Works on Chrome / Safari /
 * Firefox / iOS Safari / Android Chrome.
 */
export async function hardReload(reason = "manual") {
  try {
    console.warn(`[AVA] Hard reload triggered (${reason}). Build ${APP_VERSION}`);
    showPortalGuardToast("Version/CSS invalide détecté — rechargement complet du portail…", "warning");
    trackPortalGuardEvent("hard-reload-forced", { reason, buildId: BUILD_ID, version: APP_VERSION }, "warning");
    localStorage.removeItem("ava_app_build_id");
    const sw = await navigator.serviceWorker?.getRegistrations?.();
    await Promise.all((sw || []).map((r) => r.unregister()));
    await navigator.serviceWorker?.register?.(`/sw.js?_ava_kill=${Date.now().toString(36)}`, { scope: "/" }).catch(() => undefined);
    const keys = await window.caches?.keys?.();
    await Promise.all((keys || []).map((k) => caches.delete(k)));
    await flushPortalGuardEvents();
  } catch (e) {
    console.warn("[AVA] cache clear failed", e);
    trackPortalGuardEvent("hard-reload-cache-clear-failed", { reason, message: String((e as Error)?.message || e), buildId: BUILD_ID }, "error");
  }
  const url = new URL(location.href);
  url.searchParams.set("_ava_b", BUILD_ID);
  url.searchParams.set("_r", Date.now().toString(36));
  url.searchParams.delete("__vite_recovered");
  location.replace(url.toString());
}
