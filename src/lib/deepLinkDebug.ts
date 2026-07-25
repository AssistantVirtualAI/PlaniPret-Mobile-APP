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

/**
 * Scheme probe: dispatch a planipret://__probe URL and wait until the deep-link
 * bridge records it. Resolves true if the OS routed it back to the app within
 * the timeout, false otherwise. Only meaningful on native platforms.
 */
export async function probePlanipretScheme(timeoutMs = 1500): Promise<boolean> {
  const marker = `__probe_${Date.now()}`;
  const url = `planipret://__probe?m=${marker}`;
  logDeepLink({ kind: "info", source: "SchemeProbe", url, detail: "dispatching" });

  let received = false;
  const unsub = subscribeDeepLinkLog(() => {
    if (getDeepLinkLog().some((e) => e.url?.includes(marker) && e.source !== "SchemeProbe")) {
      received = true;
    }
  });

  try {
    // Prefer a hidden iframe: safer than window.location for custom schemes on iOS.
    const iframe = document.createElement("iframe");
    iframe.style.display = "none";
    iframe.src = url;
    document.body.appendChild(iframe);
    setTimeout(() => { try { iframe.remove(); } catch {} }, 400);
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
