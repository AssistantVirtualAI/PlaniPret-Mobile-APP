/**
 * Reload Diagnostics — instruments window/location/history + timers to surface
 * the source of unexpected page reloads or rapid re-renders.
 *
 * Enable by setting localStorage.AVA_DIAG = "1" (or ?diag=1 in the URL), then
 * watch the console for [AVA-DIAG] entries.
 */

const KEY = "AVA_DIAG";
const isBrowser = typeof window !== "undefined";

function enabled(): boolean {
  if (!isBrowser) return false;
  try {
    if (new URLSearchParams(location.search).get("diag") === "1") {
      localStorage.setItem(KEY, "1");
    }
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

function stack(): string {
  return (new Error().stack || "").split("\n").slice(2, 7).join("\n");
}

function log(label: string, detail?: unknown) {
  // eslint-disable-next-line no-console
  console.warn(`%c[AVA-DIAG] ${label}`, "color:#ff5577;font-weight:700", detail ?? "", "\n" + stack());
}

let installed = false;

export function installReloadDiagnostics() {
  if (!isBrowser || installed) return;
  if (!enabled()) return;
  installed = true;

  // eslint-disable-next-line no-console
  console.warn("%c[AVA-DIAG] Reload diagnostics ENABLED", "color:#0023e6;font-weight:800");

  // location.reload / assign / replace
  try {
    const origReload = location.reload.bind(location);
    (location as any).reload = (...a: any[]) => { log("location.reload()", a); return origReload(...a); };
    const origAssign = location.assign.bind(location);
    (location as any).assign = (url: string) => { log("location.assign", url); return origAssign(url); };
    const origReplace = location.replace.bind(location);
    (location as any).replace = (url: string) => { log("location.replace", url); return origReplace(url); };
  } catch (e) { log("patch-location-failed", String(e)); }

  // href setter
  try {
    const proto = Object.getPrototypeOf(location);
    const desc = Object.getOwnPropertyDescriptor(proto, "href") || Object.getOwnPropertyDescriptor(location, "href");
    if (desc?.set) {
      Object.defineProperty(location, "href", {
        configurable: true,
        get: desc.get?.bind(location),
        set: (v: string) => { log("location.href=", v); desc.set!.call(location, v); },
      });
    }
  } catch (e) { log("patch-href-failed", String(e)); }

  // history.pushState / replaceState
  try {
    const ps = history.pushState.bind(history);
    history.pushState = (...a: any[]) => { log("history.pushState", a[2]); return ps(...(a as [any, string, string?])); };
    const rs = history.replaceState.bind(history);
    history.replaceState = (...a: any[]) => { log("history.replaceState", a[2]); return rs(...(a as [any, string, string?])); };
  } catch (e) { log("patch-history-failed", String(e)); }

  // beforeunload / unload / pagehide
  window.addEventListener("beforeunload", (e) => log("beforeunload", e.type));
  window.addEventListener("pagehide", (e) => log("pagehide", { persisted: (e as PageTransitionEvent).persisted }));
  window.addEventListener("unload", () => log("unload"));

  // visibility + focus storms
  let visCount = 0, lastVis = 0;
  document.addEventListener("visibilitychange", () => {
    visCount++;
    const now = Date.now();
    if (now - lastVis < 3000) log("visibilitychange-burst", { count: visCount, state: document.visibilityState });
    lastVis = now;
  });

  // Track suspicious short intervals (<= 3s) and timeouts that fire frequently
  try {
    const origSetInterval = window.setInterval;
    (window as any).setInterval = (fn: any, ms?: number, ...rest: any[]) => {
      if (typeof ms === "number" && ms > 0 && ms <= 3000) {
        log("setInterval(short)", { ms });
      }
      return origSetInterval(fn as any, ms as any, ...rest);
    };
  } catch (e) { log("patch-setInterval-failed", String(e)); }

  // Detect a render loop: count document.body mutations per second
  try {
    let mutations = 0;
    const obs = new MutationObserver((records) => { mutations += records.length; });
    obs.observe(document.documentElement, { childList: true, subtree: true, attributes: true, characterData: false });
    window.setInterval(() => {
      if (mutations > 500) log("render-storm", { mutationsPerSec: mutations });
      mutations = 0;
    }, 1000);
  } catch (e) { log("mutation-observer-failed", String(e)); }

  // Errors / unhandled rejections often precede reloads
  window.addEventListener("error", (e) => log("window.error", { msg: e.message, src: (e as any).filename, line: e.lineno }));
  window.addEventListener("unhandledrejection", (e) => log("unhandledrejection", String((e as any).reason)));

  (window as any).__avaDiag = {
    disable: () => { try { localStorage.removeItem(KEY); } catch {} log("disabled — reload page"); },
    status: "active",
  };
}

if (isBrowser) installReloadDiagnostics();
