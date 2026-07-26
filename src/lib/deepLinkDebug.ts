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

// Module-level dedup set: tracks codes already routed in this app session.
// Prevents iOS from replaying the same OAuth callback via both appUrlOpen
// AND getLaunchUrl simultaneously, which caused Maestro to loop.
const _handledKeys = new Set<string>();

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
    // Dedup: build a key from the OAuth code (first 20 chars) + state.
    // If we've already routed this exact callback, skip silently.
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state') ?? '';
    const dedupKey = code ? `${code.substring(0, 20)}_${state}` : url.search;
    if (_handledKeys.has(dedupKey)) {
      logDeepLink({ kind: "handler", source, url: rawUrl, detail: "duplicate deep link — skipping (module guard)" });
      return true;
    }
    _handledKeys.add(dedupKey);
    // Auto-clear after 60s to allow legitimate re-auth flows.
    setTimeout(() => _handledKeys.delete(dedupKey), 60_000);
    void import('@capacitor/browser')
      .then(({ Browser }) => Browser.close())
      .catch(() => {});
    if (isMs365Callback) {
      try { localStorage.setItem('pp_ms365_callback_url', rawUrl); } catch {}
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
