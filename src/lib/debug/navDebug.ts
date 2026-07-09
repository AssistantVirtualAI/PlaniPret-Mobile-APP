/**
 * Lightweight navigation debug recorder.
 *
 * Enable via:
 *   - URL flag:   ?debug=nav  (sticky for the session)
 *   - LocalStorage: localStorage.setItem('lovable_nav_debug', '1')
 *
 * Then guards / pages call `recordRedirect(from, to, source, reason?)`
 * whenever they redirect. The overlay reads `getNavLog()`.
 */

export type NavEvent = {
  ts: number;
  from: string;
  to: string;
  source: string; // e.g. "AppSeparationGuard", "PlanipretMobile.loadProfile"
  reason?: string;
};

const MAX = 50;
const log: NavEvent[] = [];
const subs = new Set<() => void>();

export function isNavDebugEnabled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (new URLSearchParams(window.location.search).get("debug") === "nav") {
      localStorage.setItem("lovable_nav_debug", "1");
    }
    return localStorage.getItem("lovable_nav_debug") === "1";
  } catch {
    return false;
  }
}

export function setNavDebug(on: boolean) {
  try {
    if (on) localStorage.setItem("lovable_nav_debug", "1");
    else localStorage.removeItem("lovable_nav_debug");
  } catch { /* ignore */ }
}

export function recordRedirect(from: string, to: string, source: string, reason?: string) {
  const ev: NavEvent = { ts: Date.now(), from, to, source, reason };
  log.push(ev);
  if (log.length > MAX) log.shift();
  if (isNavDebugEnabled()) {
    // eslint-disable-next-line no-console
    console.info(`[nav] ${source}: ${from} → ${to}${reason ? ` (${reason})` : ""}`);
  }
  subs.forEach((fn) => { try { fn(); } catch { /* ignore */ } });
}

export function getNavLog(): NavEvent[] {
  return log.slice();
}

export function subscribeNavLog(fn: () => void): () => void {
  subs.add(fn);
  return () => subs.delete(fn);
}

export function clearNavLog() {
  log.length = 0;
  subs.forEach((fn) => fn());
}
