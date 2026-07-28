/**
 * backgroundSync — keeps call history, queues, voicemail and recordings fresh
 * even when the app is in the background.
 *
 * Strategy:
 *  - Native (if @capacitor/background-runner is installed): register a
 *    BGTaskScheduler / WorkManager job. On any failure (plugin missing,
 *    permission denied, dispatch error) we fall back silently.
 *  - Fallback: an in-process interval timer keeps consumers refreshed. This
 *    works in the web preview and on native when the OS keeps the app warm.
 *  - Silent push / foreground refresh are handled by useAutoSync.
 */
import { Capacitor } from '@capacitor/core';

const TASK_ID = 'com.lemtel.softphone.sync';
const INTERVAL_MIN = 15;
const FALLBACK_INTERVAL_MS = INTERVAL_MIN * 60 * 1000;

type SyncFn = () => Promise<void>;

let registered = false;
let fallbackTimer: ReturnType<typeof setInterval> | null = null;
const runners = new Set<SyncFn>();

function log(level: 'info' | 'warn' | 'error', msg: string, extra?: unknown) {
  const prefix = '[backgroundSync]';
  // Single channel, prefixed, so devs can grep "[backgroundSync]" easily.
  if (level === 'error') console.error(prefix, msg, extra ?? '');
  else if (level === 'warn') console.warn(prefix, msg, extra ?? '');
  else console.info(prefix, msg, extra ?? '');
}

export function registerBackgroundSync(run: SyncFn) {
  runners.add(run);
  return () => runners.delete(run);
}

async function runAll() {
  const results = await Promise.allSettled(Array.from(runners).map((r) => r()));
  const failures = results.filter((r) => r.status === 'rejected');
  if (failures.length) {
    log('warn', `sync completed with ${failures.length}/${results.length} failures`, failures.map((f: any) => f.reason?.message || String(f.reason)));
  }
}

function startFallbackTimer(reason: string) {
  if (fallbackTimer) return;
  log('info', `using interval fallback (${INTERVAL_MIN}m) — ${reason}`);
  fallbackTimer = setInterval(() => { runAll().catch((e) => log('error', 'fallback runAll threw', e)); }, FALLBACK_INTERVAL_MS);
}

export async function initBackgroundSync() {
  if (registered) return;
  registered = true;

  if (!Capacitor.isNativePlatform()) {
    startFallbackTimer('non-native platform');
    return;
  }

  // Best-effort native registration. The plugin is optional; on any failure
  // we degrade to the interval fallback rather than crashing.
  try {
    // Variable specifier with @vite-ignore keeps Rollup from trying to resolve
    // the optional package at build time.
    const pkg = '@capacitor/background-runner';
    const mod = await import(/* @vite-ignore */ pkg).catch((e) => {
      log('warn', 'background-runner not installed', e?.message || e);
      return null;
    });
    if (!mod) { startFallbackTimer('plugin not installed'); return; }
    const { BackgroundRunner } = mod as any;
    if (!BackgroundRunner?.dispatchEvent) {
      startFallbackTimer('plugin missing dispatchEvent');
      return;
    }
    await BackgroundRunner.dispatchEvent({
      label: TASK_ID,
      event: 'syncPbx',
      details: { intervalMinutes: INTERVAL_MIN },
    });
    log('info', 'native background task registered', TASK_ID);
  } catch (e: any) {
    log('error', 'native registration failed, falling back', e?.message || e);
    startFallbackTimer('native registration error');
  }
}

/** Called from a silent push or BG event to fan out a sync to all consumers. */
export async function triggerBackgroundSync() {
  try {
    await runAll();
  } catch (e: any) {
    log('error', 'triggerBackgroundSync failed', e?.message || e);
  }
}
