// Lightweight Web Vitals + resource timing collector.
// No external deps — uses PerformanceObserver directly.
// Data is kept in-memory and persisted per-route in sessionStorage so the
// diagnostics dashboard can render historical values across navigations.

export type VitalName = "LCP" | "CLS" | "INP" | "FCP" | "TTFB" | "FID";

export interface RouteMetrics {
  path: string;
  timestamp: number;
  vitals: Partial<Record<VitalName, number>>;
  navigation?: {
    domContentLoaded: number;
    loadEvent: number;
    domInteractive: number;
    transferSize: number;
    duration: number;
  };
  longTasks: number; // total ms
  resources: {
    total: number;
    scripts: { count: number; bytes: number; slowest: number };
    styles: { count: number; bytes: number };
    images: { count: number; bytes: number };
    fetches: { count: number; slowest: number; total: number };
  };
  memory?: { usedJSHeapSize: number; totalJSHeapSize: number };
}

const STORAGE_KEY = "__ava_perf_metrics_v1";
const MAX_ROUTES = 40;

type Listener = (all: RouteMetrics[]) => void;
const listeners = new Set<Listener>();
let current: RouteMetrics | null = null;
let history: RouteMetrics[] = [];
let clsValue = 0;
let clsEntries: PerformanceEntry[] = [];

function loadHistory() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (raw) history = JSON.parse(raw);
  } catch {}
}
function saveHistory() {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(history.slice(-MAX_ROUTES)));
  } catch {}
}
function notify() {
  const snap = getAllMetrics();
  listeners.forEach((l) => { try { l(snap); } catch {} });
}

function ensureCurrent(): RouteMetrics {
  const path = typeof window !== "undefined" ? window.location.pathname : "/";
  if (!current || current.path !== path) {
    if (current) {
      history.push(current);
      if (history.length > MAX_ROUTES) history.shift();
      saveHistory();
    }
    current = {
      path,
      timestamp: Date.now(),
      vitals: {},
      longTasks: 0,
      resources: {
        total: 0,
        scripts: { count: 0, bytes: 0, slowest: 0 },
        styles: { count: 0, bytes: 0 },
        images: { count: 0, bytes: 0 },
        fetches: { count: 0, slowest: 0, total: 0 },
      },
    };
    clsValue = 0;
    clsEntries = [];
    // Reset resource baseline for the new "page view".
    resourceBaseline = performance.now();
  }
  return current;
}

let resourceBaseline = 0;
let inited = false;

function obs(type: string, buffered: boolean, cb: (list: PerformanceObserverEntryList) => void) {
  try {
    const o = new PerformanceObserver(cb);
    o.observe({ type, buffered } as any);
    return o;
  } catch { return null; }
}

export function initPerfMetrics() {
  if (inited || typeof window === "undefined") return;
  inited = true;
  loadHistory();
  ensureCurrent();

  // Navigation timing
  const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
  if (nav) {
    const c = ensureCurrent();
    c.navigation = {
      domContentLoaded: Math.round(nav.domContentLoadedEventEnd),
      loadEvent: Math.round(nav.loadEventEnd),
      domInteractive: Math.round(nav.domInteractive),
      transferSize: nav.transferSize || 0,
      duration: Math.round(nav.duration),
    };
    c.vitals.TTFB = Math.round(nav.responseStart);
  }

  // FCP
  obs("paint", true, (list) => {
    list.getEntries().forEach((e) => {
      if (e.name === "first-contentful-paint") {
        ensureCurrent().vitals.FCP = Math.round(e.startTime);
        notify();
      }
    });
  });

  // LCP (keep updating until user interaction / page hide)
  obs("largest-contentful-paint", true, (list) => {
    const entries = list.getEntries();
    const last = entries[entries.length - 1] as any;
    if (last) {
      ensureCurrent().vitals.LCP = Math.round(last.renderTime || last.startTime);
      notify();
    }
  });

  // CLS
  obs("layout-shift", true, (list) => {
    list.getEntries().forEach((e: any) => {
      if (!e.hadRecentInput) {
        clsValue += e.value;
        clsEntries.push(e);
        ensureCurrent().vitals.CLS = Number(clsValue.toFixed(4));
      }
    });
    notify();
  });

  // INP (approx via Event Timing)
  let worstInp = 0;
  obs("event", true, (list) => {
    list.getEntries().forEach((e: any) => {
      const dur = e.duration;
      if (dur > worstInp) {
        worstInp = dur;
        ensureCurrent().vitals.INP = Math.round(dur);
      }
    });
    notify();
  });

  // Long tasks
  obs("longtask", true, (list) => {
    let sum = 0;
    list.getEntries().forEach((e) => { sum += e.duration; });
    ensureCurrent().longTasks += Math.round(sum);
    notify();
  });

  // Resources
  obs("resource", true, (list) => {
    const c = ensureCurrent();
    list.getEntries().forEach((entry) => {
      const e = entry as PerformanceResourceTiming;
      if (e.startTime < resourceBaseline - 500) return;
      c.resources.total += 1;
      const bytes = e.transferSize || e.encodedBodySize || 0;
      const dur = e.duration;
      const t = e.initiatorType;
      if (t === "script") {
        c.resources.scripts.count++;
        c.resources.scripts.bytes += bytes;
        if (dur > c.resources.scripts.slowest) c.resources.scripts.slowest = Math.round(dur);
      } else if (t === "css" || t === "link") {
        c.resources.styles.count++;
        c.resources.styles.bytes += bytes;
      } else if (t === "img") {
        c.resources.images.count++;
        c.resources.images.bytes += bytes;
      } else if (t === "fetch" || t === "xmlhttprequest") {
        c.resources.fetches.count++;
        c.resources.fetches.total += Math.round(dur);
        if (dur > c.resources.fetches.slowest) c.resources.fetches.slowest = Math.round(dur);
      }
    });
    // Memory (Chrome only)
    const perfAny = performance as any;
    if (perfAny.memory) {
      c.memory = {
        usedJSHeapSize: perfAny.memory.usedJSHeapSize,
        totalJSHeapSize: perfAny.memory.totalJSHeapSize,
      };
    }
    notify();
  });

  // Persist on hide
  const flush = () => {
    if (current) {
      const idx = history.findIndex((h) => h.path === current!.path && h.timestamp === current!.timestamp);
      if (idx === -1) history.push({ ...current });
      else history[idx] = { ...current };
      saveHistory();
    }
  };
  window.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flush();
  });
  window.addEventListener("pagehide", flush);

  // React to SPA navigation (history API is patched so pushState/replaceState fire onNav)
  const onNav = () => {
    ensureCurrent();
    notify();
  };
  window.addEventListener("popstate", onNav);
  (["pushState", "replaceState"] as const).forEach((k) => {
    const orig = (window.history as any)[k].bind(window.history);
    (window.history as any)[k] = (...args: any[]) => {
      const r = orig(...args);
      queueMicrotask(onNav);
      return r;
    };
  });
}

export function getCurrentMetrics(): RouteMetrics | null {
  return current ? { ...current } : null;
}
export function getAllMetrics(): RouteMetrics[] {
  const arr = [...history];
  if (current) arr.push({ ...current });
  return arr;
}
export function subscribeMetrics(cb: Listener) {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}
export function clearMetrics() {
  history = [];
  current = null;
  clsValue = 0;
  clsEntries = [];
  try { sessionStorage.removeItem(STORAGE_KEY); } catch {}
  ensureCurrent();
  notify();
}

// --- Vitals rating helpers (Google Web Vitals thresholds) ---
export function rateVital(name: VitalName, value: number): "good" | "needs-improvement" | "poor" {
  switch (name) {
    case "LCP": return value <= 2500 ? "good" : value <= 4000 ? "needs-improvement" : "poor";
    case "FCP": return value <= 1800 ? "good" : value <= 3000 ? "needs-improvement" : "poor";
    case "TTFB": return value <= 800 ? "good" : value <= 1800 ? "needs-improvement" : "poor";
    case "INP": return value <= 200 ? "good" : value <= 500 ? "needs-improvement" : "poor";
    case "FID": return value <= 100 ? "good" : value <= 300 ? "needs-improvement" : "poor";
    case "CLS": return value <= 0.1 ? "good" : value <= 0.25 ? "needs-improvement" : "poor";
  }
}
