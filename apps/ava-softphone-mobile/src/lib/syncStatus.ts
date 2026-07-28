/**
 * Lightweight global sync-status bus.
 * useAutoSync reports begin/success/error events keyed by `cacheKey` (or anonymous).
 * UI subscribes via `useSyncStatus()` to show a single global progress pill.
 */
export type SyncState = 'idle' | 'loading' | 'success' | 'error';

export interface SyncSnapshot {
  state: SyncState;
  inflight: number;
  lastSuccessAt: number | null;
  lastErrorAt: number | null;
  lastError: string | null;
  totalLoaders: number;
  readyLoaders: number;
}

type Listener = (s: SyncSnapshot) => void;

const loaders = new Map<string, { state: SyncState; error?: string | null }>();
let inflight = 0;
let lastSuccessAt: number | null = null;
let lastErrorAt: number | null = null;
let lastError: string | null = null;
let resetTimer: ReturnType<typeof setTimeout> | null = null;

const listeners = new Set<Listener>();
let counter = 0;
export function nextSyncId() { return `s${++counter}`; }

function snapshot(): SyncSnapshot {
  const totalLoaders = loaders.size;
  const readyLoaders = Array.from(loaders.values()).filter((l) => l.state === 'success').length;
  let state: SyncState = 'idle';
  if (inflight > 0) state = 'loading';
  else if (lastErrorAt && (!lastSuccessAt || lastErrorAt > lastSuccessAt)) state = 'error';
  else if (lastSuccessAt) state = 'success';
  return { state, inflight, lastSuccessAt, lastErrorAt, lastError, totalLoaders, readyLoaders };
}

function emit() {
  const s = snapshot();
  listeners.forEach((l) => { try { l(s); } catch {} });
}

export function syncBegin(id: string) {
  loaders.set(id, { state: 'loading' });
  inflight++;
  if (resetTimer) { clearTimeout(resetTimer); resetTimer = null; }
  emit();
}
export function syncSuccess(id: string) {
  loaders.set(id, { state: 'success' });
  inflight = Math.max(0, inflight - 1);
  lastSuccessAt = Date.now();
  emit();
  if (inflight === 0) {
    if (resetTimer) clearTimeout(resetTimer);
    resetTimer = setTimeout(() => { emit(); }, 2500);
  }
}
export function syncError(id: string, err: string) {
  loaders.set(id, { state: 'error', error: err });
  inflight = Math.max(0, inflight - 1);
  lastErrorAt = Date.now();
  lastError = err;
  emit();
}
export function getSyncSnapshot() { return snapshot(); }
export function subscribeSync(l: Listener) { listeners.add(l); l(snapshot()); return () => { listeners.delete(l); }; }

// Manual refresh bus — useAutoSync hooks subscribe; SyncIndicator triggers.
const refreshSubs = new Set<() => void>();
export function onSyncRefresh(fn: () => void) { refreshSubs.add(fn); return () => { refreshSubs.delete(fn); }; }
export function triggerSyncRefresh() { refreshSubs.forEach((fn) => { try { fn(); } catch {} }); }

import { useEffect, useState } from 'react';
export function useSyncStatus() {
  const [snap, setSnap] = useState<SyncSnapshot>(() => snapshot());
  useEffect(() => { const off = subscribeSync(setSnap); return () => { off(); }; }, []);
  return snap;
}

