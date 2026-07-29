/**
 * Deduplicated Capacitor listener registry (Planiprêt mobile).
 *
 * Multiple React effects (softphone hook, call sheets, diagnostics screens)
 * used to call `Plugin.addListener("event", cb)` independently. Every extra
 * native subscription re-emitted the same event, which triggered duplicated
 * `init()` / `forceReregister()` runs and the reconnect storms we saw in the
 * Xcode logs.
 *
 * This registry guarantees exactly ONE native subscription per
 * `plugin:event` pair and fans the payload out to every JS callback.
 */

type AnyCb = (data: any) => void;

interface Entry {
  callbacks: Set<AnyCb>;
  handle: { remove?: () => void } | null;
  pending: Promise<any> | null;
}

const registry = new Map<string, Entry>();

export interface CapListenerTarget {
  addListener?: (event: string, cb: AnyCb) => any;
}

/**
 * Subscribe to a Capacitor plugin event with de-duplication.
 * Returns an unsubscribe function; the underlying native listener is removed
 * only when the last JS subscriber goes away.
 */
export function addDedupedCapListener(
  pluginName: string,
  plugin: CapListenerTarget | null | undefined,
  event: string,
  cb: AnyCb,
): () => void {
  if (!plugin?.addListener) return () => undefined;
  const key = `${pluginName}:${event}`;
  let entry = registry.get(key);
  if (!entry) {
    entry = { callbacks: new Set(), handle: null, pending: null };
    registry.set(key, entry);
    const fanout = (data: any) => {
      const current = registry.get(key);
      if (!current) return;
      for (const fn of Array.from(current.callbacks)) {
        try { fn(data); } catch (e) { console.warn(`[cap-listeners] ${key} handler failed`, e); }
      }
    };
    try {
      const res = plugin.addListener(event, fanout);
      if (res && typeof res.then === "function") {
        entry.pending = res;
        res.then((h: any) => {
          const current = registry.get(key);
          if (!current) { try { h?.remove?.(); } catch { /* noop */ } return; }
          current.handle = h ?? null;
          current.pending = null;
          if (current.callbacks.size === 0) teardown(key);
        }).catch(() => { registry.delete(key); });
      } else {
        entry.handle = res ?? null;
      }
    } catch {
      registry.delete(key);
      return () => undefined;
    }
  }

  entry.callbacks.add(cb);
  let removed = false;
  return () => {
    if (removed) return;
    removed = true;
    const current = registry.get(key);
    if (!current) return;
    current.callbacks.delete(cb);
    if (current.callbacks.size === 0 && !current.pending) teardown(key);
  };
}

function teardown(key: string) {
  const entry = registry.get(key);
  if (!entry) return;
  registry.delete(key);
  try { entry.handle?.remove?.(); } catch { /* noop */ }
}

/** Debug helper: active deduped listeners and their subscriber counts. */
export function getCapListenerStats(): Record<string, number> {
  const out: Record<string, number> = {};
  registry.forEach((entry, key) => { out[key] = entry.callbacks.size; });
  return out;
}
