/**
 * Deep-link debug store — records every native deep link received by the app
 * and the outcome of the associated handler. Persisted to localStorage so it
 * survives the WKWebView reload triggered by a callback.
 */
export type DeepLinkEvent = {
  ts: number;
  kind: "received" | "handler" | "info" | "error";
  source: string; // e.g. "appUrlOpen", "launchUrl", "MaestroCallback", "SchemeProbe"
  url?: string;
  detail?: string;
};

const KEY = "pp_deep_link_debug_log";
const MAX = 100;
const listeners = new Set<() => void>();
const routedRecently = new Map<string, number>();
const COMPLETED_KEY = "pp_completed_oauth_callbacks";
const ROUTED_KEY = "pp_routed_oauth_callbacks";
const ROUTED_TTL_MS = 120_000;

function callbackKey(kind: "ms365" | "maestro", url: URL): string {
  const state = url.searchParams.get("state") || "no-state";
  const code = url.searchParams.get("code") || url.searchParams.get("error") || url.search;
  return `${kind}:${state}:${String(code).slice(0, 32)}`;
}

function readCompleted(): string[] {
  try {
    const raw = localStorage.getItem(COMPLETED_KEY);
    return raw ? JSON.parse(raw) as string[] : [];
  } catch {
    return [];
  }
}

function writeCompleted(keys: string[]) {
  try { localStorage.setItem(COMPLETED_KEY, JSON.stringify(keys.slice(-40))); } catch {}
}

function readRouted(): Array<{ key: string; ts: number }> {
  try {
    const raw = localStorage.getItem(ROUTED_KEY);
    const list = raw ? JSON.parse(raw) as Array<{ key: string; ts: number }> : [];
    const now = Date.now();
    return list.filter((x) => x?.key && now - Number(x.ts || 0) < ROUTED_TTL_MS);
  } catch {
    return [];
  }
}

function markRouted(key: string) {
  const now = Date.now();
  const list = readRouted().filter((x) => x.key !== key);
  list.push({ key, ts: now });
  try { localStorage.setItem(ROUTED_KEY, JSON.stringify(list.slice(-40))); } catch {}
}

function wasRoutedRecently(key: string): boolean {
  return readRouted().some((x) => x.key === key);
}

function isCompleted(key: string): boolean {
  return readCompleted().includes(key);
}

export function markOAuthCallbackCompleted(kind: "ms365" | "maestro", rawUrlOrSearch?: string | null) {
  if (!rawUrlOrSearch) return;
  try {
    const url = rawUrlOrSearch.startsWith("?")
      ? new URL(`${window.location.origin}/auth/${kind === "ms365" ? "microsoft" : "maestro"}/callback${rawUrlOrSearch}`)
      : new URL(rawUrlOrSearch);
    const key = callbackKey(kind, url);
    const list = readCompleted().filter((k) => k !== key);
    list.push(key);
    writeCompleted(list);
  } catch {}
}

function read(): DeepLinkEvent[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as DeepLinkEvent[]) : [];
  } catch {
    return [];
  }
}

function write(list: DeepLinkEvent[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(-MAX)));
  } catch {}
  listeners.forEach((l) => {
    try { l(); } catch {}
  });
}

export function logDeepLink(ev: Omit<DeepLinkEvent, "ts">) {
  const list = read();
  list.push({ ...ev, ts: Date.now() });
  write(list);
  try {
    // eslint-disable-next-line no-console
    console.log("[deep-link]", ev.source, ev.kind, ev.url ?? "", ev.detail ?? "");
  } catch {}
}

export function getDeepLinkLog(): DeepLinkEvent[] {
  return read();
}

export function clearDeepLinkLog() {
  write([]);
}

export function subscribeDeepLinkLog(cb: () => void): () => void {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

export async function handleIncomingDeepLink(
  rawUrl: string | null | undefined,
  source = "unknown",
  navigate?: (path: string, options?: { replace?: boolean }) => void,
): Promise<boolean> {
  if (!rawUrl) return false;
  logDeepLink({ kind: "received", source, url: rawUrl });
  try {
    const url = new URL(rawUrl);
    const pathWithHost = `/${[url.hostname, url.pathname].filter(Boolean).join('/')}`.replace(/\/+/g, '/');
    const isMs365Callback =
      url.pathname === '/auth/microsoft/callback' ||
      url.pathname === '/auth/ms365/callback' ||
      pathWithHost === '/auth/microsoft/callback' ||
      pathWithHost === '/auth/ms365/callback';
    const isMaestroCallback =
      url.pathname === '/auth/maestro/callback' ||
      pathWithHost === '/auth/maestro/callback' ||
      (url.protocol === 'planipret:' && (url.hostname === 'auth' || rawUrl.includes('/auth/maestro/callback')));

    if (!isMs365Callback && !isMaestroCallback) return false;
    if (url.searchParams.has('probe')) {
      logDeepLink({ kind: "handler", source, url: rawUrl, detail: "probe callback routed" });
      return true;
    }
    const kind = isMs365Callback ? "ms365" : "maestro";
    const key = callbackKey(kind, url);
    const now = Date.now();
    const lastRouted = routedRecently.get(key) ?? 0;
    if (isCompleted(key)) {
      logDeepLink({ kind: "handler", source, url: rawUrl, detail: `${kind} callback already completed — ignoring stale replay` });
      try { localStorage.removeItem(kind === "ms365" ? "pp_ms365_callback_url" : "pp_maestro_callback_url"); } catch {}
      if (kind === "ms365") void import('@/lib/ms365CallbackStore').then((m) => m.clearMs365CallbackUrl()).catch(() => {});
      navigate?.(kind === "maestro" ? "/mplanipret/more" : "/mplanipret/home", { replace: true });
      return true;
    }
    if (now - lastRouted < 10_000 || wasRoutedRecently(key)) {
      logDeepLink({ kind: "handler", source, url: rawUrl, detail: `${kind} callback duplicate delivery — already routed` });
      return true;
    }
    routedRecently.set(key, now);
    markRouted(key);
    if (document.visibilityState === "hidden") {
      void import('@capacitor/browser')
        .then(({ Browser }) => Browser.close())
        .catch(() => {});
    }
    if (isMs365Callback) {
      try { localStorage.setItem('pp_ms365_callback_url', rawUrl); } catch {}
      void import('@/lib/ms365CallbackStore').then((m) => m.rememberMs365CallbackUrl(rawUrl)).catch(() => {});
      navigate?.(`/auth/microsoft/callback${url.search}`, { replace: true });
    } else {
      try { localStorage.setItem('pp_maestro_callback_url', rawUrl); } catch {}
      navigate?.(`/auth/maestro/callback${url.search}`, { replace: true });
    }
    logDeepLink({ kind: "handler", source, url: rawUrl, detail: isMs365Callback ? "routed ms365 callback" : "routed maestro callback" });
    return true;
  } catch (e) {
    logDeepLink({ kind: "error", source, url: rawUrl, detail: (e as Error).message });
    return false;
  }
}

/**
 * Scheme probe: dispatch a planipret://__probe URL and wait until the deep-link
 * bridge records it. Resolves true if the OS routed it back to the app within
 * the timeout, false otherwise. Only meaningful on native platforms.
 */
export async function probePlanipretScheme(timeoutMs = 1500): Promise<boolean> {
  const marker = `__probe_${Date.now()}`;
  const url = `planipret://auth/maestro/callback?probe=${marker}`;
  logDeepLink({ kind: "info", source: "SchemeProbe", url, detail: "dispatching" });

  let received = false;
  const unsub = subscribeDeepLinkLog(() => {
    if (getDeepLinkLog().some((e) => e.url?.includes(marker) && e.source !== "SchemeProbe")) {
      received = true;
    }
  });

  try {
    const handled = await handleIncomingDeepLink(url, "SchemeProbe:self");
    if (handled) received = true;
  } catch (e) {
    logDeepLink({ kind: "error", source: "SchemeProbe", detail: (e as Error).message });
  }

  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (received) break;
    await new Promise((r) => setTimeout(r, 100));
  }
  unsub();
  logDeepLink({
    kind: received ? "info" : "error",
    source: "SchemeProbe",
    detail: received ? "scheme OK" : "no callback within timeout",
  });
  return received;
}
