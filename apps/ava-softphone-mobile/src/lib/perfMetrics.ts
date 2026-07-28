/**
 * Lightweight in-app performance metrics.
 *
 *  - Compteurs : nombre de requêtes réseau, cache hits / misses, erreurs.
 *  - Timings   : durée de chargement par page / par cacheKey (moy., dernier).
 *  - Listeners : pour rafraîchir l'overlay temps réel.
 *
 * Active par défaut, n'envoie rien à l'extérieur. Affichable via
 * `<PerfOverlay />` (déclenché par ?perf=1 ou localStorage 'ava.perf').
 */

type Counters = {
  requests: number;
  cacheHits: number;
  cacheMisses: number;
  errors: number;
  inflightDedupes: number;
};

export type RouteTiming = {
  key: string;
  count: number;
  lastMs: number;
  totalMs: number;
  avgMs: number;
  lastAt: number;
};

const counters: Counters = {
  requests: 0,
  cacheHits: 0,
  cacheMisses: 0,
  errors: 0,
  inflightDedupes: 0,
};

const timings = new Map<string, RouteTiming>();
const listeners = new Set<() => void>();

function notify() { for (const fn of listeners) { try { fn(); } catch {} } }

export const perf = {
  hit(key: string) { counters.cacheHits++; notify(); void key; },
  miss(key: string) { counters.cacheMisses++; notify(); void key; },
  request() { counters.requests++; notify(); },
  dedupe() { counters.inflightDedupes++; notify(); },
  error() { counters.errors++; notify(); },
  timing(key: string, ms: number) {
    const t = timings.get(key) || { key, count: 0, lastMs: 0, totalMs: 0, avgMs: 0, lastAt: 0 };
    t.count++; t.lastMs = ms; t.totalMs += ms; t.avgMs = t.totalMs / t.count; t.lastAt = Date.now();
    timings.set(key, t);
    notify();
  },
  snapshot() {
    return {
      counters: { ...counters },
      timings: Array.from(timings.values()).sort((a, b) => b.lastAt - a.lastAt),
    };
  },
  subscribe(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; },
  reset() {
    counters.requests = counters.cacheHits = counters.cacheMisses = 0;
    counters.errors = counters.inflightDedupes = 0;
    timings.clear();
    notify();
  },
};

export function isPerfOverlayEnabled(): boolean {
  try {
    if (new URLSearchParams(window.location.search).get('perf') === '1') return true;
    return localStorage.getItem('ava.perf') === '1';
  } catch { return false; }
}
