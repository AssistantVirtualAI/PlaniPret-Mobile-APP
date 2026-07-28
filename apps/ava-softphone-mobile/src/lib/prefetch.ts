/**
 * Préchargement opportuniste des données les plus consultées.
 *
 * Utilise `requestIdleCallback` (avec fallback `setTimeout`) pour ne pas
 * bloquer le premier rendu. Les appels passent par `mobileApi.*` qui est déjà
 * dédupliqué (in-flight) — donc inoffensif si la page demande la même donnée.
 *
 * Les résultats sont stockés dans le cache partagé `useAutoSync` via
 * `seedAutoSyncCache(cacheKey, value)` pour un affichage instantané.
 */
import { mobileApi } from './mobileApi';
import { seedAutoSyncCache } from '../hooks/useAutoSync';

type Task = { key: string; run: () => Promise<unknown> };

// Minimal startup payload: load only what the Home tab needs immediately.
// SIP credentials, dashboard stats, and a tiny page of recent calls — all in
// parallel via Promise.all so the first paint has data ready.
const STARTUP_TASKS: Task[] = [
  // Keep these cache keys aligned with the screens that consume them.
  { key: 'me',                 run: () => mobileApi.me() },
  { key: 'domainStats:today',  run: () => mobileApi.domainStats('today') },
  { key: 'mobile.calls.7',     run: () => mobileApi.calls({ rangeDays: 7, limit: 10 }) },
  { key: 'mobile.sipCreds',    run: () => mobileApi.webphoneToken() },
];

let started = false;

export function startPrefetch() {
  if (started) return; started = true;
  const schedule = (cb: () => void) => {
    const ric = (globalThis as any).requestIdleCallback as undefined | ((c: () => void, o?: { timeout: number }) => number);
    if (ric) ric(cb, { timeout: 2_000 });
    else setTimeout(cb, 300);
  };
  schedule(() => {
    // Parallel: mobile data endpoints are independent.
    Promise.all(
      STARTUP_TASKS.map(async (t) => {
        try { seedAutoSyncCache(t.key, await t.run()); } catch { /* silent */ }
      }),
    );
  });
}

/**
 * Préchargement ciblé déclenché par la navigation entre onglets.
 * On précharge la donnée probable de la page voisine pour rendre
 * la transition instantanée (stale-while-revalidate).
 */
const NAV_TASKS: Record<string, Task[]> = {
  home:     [
    { key: 'me',                run: () => mobileApi.me() },
    { key: 'domainStats:today', run: () => mobileApi.domainStats('today') },
  ],
  calls:    [{ key: 'mobile.calls.7',    run: () => mobileApi.calls({ rangeDays: 7, limit: 20 }) }],
  messages: [{ key: 'mobile.threads',    run: () => mobileApi.threads() }],
  voicemail:[{ key: 'mobile.voicemails', run: () => mobileApi.voicemails() }],
  more:     [
    { key: 'mobile.voicemails', run: () => mobileApi.voicemails() },
    { key: 'mobile.threads',    run: () => mobileApi.threads() },
  ],
};

const navDone = new Set<string>();
export function prefetchForTab(tab: string) {
  if (navDone.has(tab)) return;
  const tasks = NAV_TASKS[tab];
  if (!tasks) return;
  navDone.add(tab);
  const schedule = (cb: () => void) => {
    const ric = (globalThis as any).requestIdleCallback as undefined | ((c: () => void, o?: { timeout: number }) => number);
    if (ric) ric(cb, { timeout: 1_500 });
    else setTimeout(cb, 0);
  };
  schedule(() => {
    Promise.all(
      tasks.map(async (t) => {
        try { seedAutoSyncCache(t.key, await t.run()); } catch {}
      }),
    );
  });
}

