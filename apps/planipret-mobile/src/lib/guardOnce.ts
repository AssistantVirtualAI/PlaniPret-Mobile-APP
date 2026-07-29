// Anti-double-execution helper: ensures a keyed async action can only run once
// at a time. Later calls with the same key while the first is in-flight resolve
// to `undefined` and never trigger the underlying function.
//
// Usage:
//   await runOnce("delete:" + id, () => api.delete(id));
//
// Also exports `useBusyGuard()` for React callbacks with a local busy state.

import { useCallback, useRef, useState } from "react";

const inflight = new Map<string, Promise<any>>();

export async function runOnce<T>(key: string, fn: () => Promise<T>): Promise<T | undefined> {
  if (inflight.has(key)) {
    try { return (await inflight.get(key)) as T; } catch { return undefined; }
  }
  const p = (async () => {
    try { return await fn(); }
    finally { inflight.delete(key); }
  })();
  inflight.set(key, p);
  return p;
}

export function isBusy(key: string) {
  return inflight.has(key);
}

/** React hook: returns a wrapped runner + boolean busy flag. */
export function useBusyGuard() {
  const [busy, setBusy] = useState(false);
  const seq = useRef(0);
  const run = useCallback(async <T,>(fn: () => Promise<T>): Promise<T | undefined> => {
    if (seq.current > 0) return undefined;
    seq.current++;
    setBusy(true);
    try { return await fn(); }
    finally { seq.current = 0; setBusy(false); }
  }, []);
  return { busy, run };
}
