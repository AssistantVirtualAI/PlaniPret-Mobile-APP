// Remembers the last visited mobile page so a cold start of the app reopens
// where the broker left off instead of always landing on Home.
const KEY = "pp_last_route";
const HISTORY_KEY = "pp_mobile_route_history_v1";
const ROOT = "/mplanipret";
const HOME = "/mplanipret/home";

function safeRoute(path: string): string | null {
  const clean = String(path ?? "").split(/[?#]/, 1)[0];
  if ((clean === ROOT || clean.startsWith(`${ROOT}/`)) && !/^\/mplanipret\/ava(?:\/|$)/i.test(clean)) {
    return clean;
  }
  return null;
}

function readHistory(): string[] {
  try {
    const raw = sessionStorage.getItem(HISTORY_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed)
      ? parsed.map((route) => safeRoute(String(route))).filter((route): route is string => Boolean(route))
      : [];
  } catch { return []; }
}

function writeHistory(routes: string[]) {
  try { sessionStorage.setItem(HISTORY_KEY, JSON.stringify(routes.slice(-12))); } catch { /* ignore */ }
}

export function rememberLastRoute(path: string) {
  const clean = safeRoute(path);
  if (!clean) return;
  try { localStorage.setItem(KEY, clean); } catch { /* ignore */ }
  const history = readHistory().filter((route) => route !== clean);
  history.push(clean);
  writeHistory(history);
}

/**
 * Returns the previous in-app mobile route only. Browser history is deliberately
 * never used: on a Capacitor cold start or external deep link it may point to
 * an OAuth callback or a page outside Planiprêt.
 */
export function previousMobileRoute(path: string): string | null {
  const current = safeRoute(path);
  if (!current) return null;
  const history = readHistory();
  for (let index = history.length - 1; index >= 0; index -= 1) {
    if (history[index] !== current) continue;
    history.splice(index, 1);
    break;
  }
  while (history.length) {
    const candidate = history.pop();
    if (candidate && candidate !== current) {
      writeHistory(history);
      return candidate;
    }
  }
  writeHistory(history);
  return null;
}

export function lastRememberedRoute(): string | null {
  try { return safeRoute(localStorage.getItem(KEY) ?? ""); } catch { return null; }
}

export const MOBILE_HOME_ROUTE = HOME;
