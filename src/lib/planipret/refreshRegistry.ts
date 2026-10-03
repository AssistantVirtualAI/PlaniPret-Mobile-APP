/**
 * Pull-to-refresh owner registry (client-only).
 * - register(fn) returns an unregister bound to THIS entry (identity token),
 *   never a blind pop(): a hidden/unmounted panel can only remove itself.
 * - The most recent live entry owns the gesture; none = refresh disabled.
 * - Every change bumps `generation` so an in-flight pull started by a
 *   previous owner releases its spinner and is ignored.
 */
export type RefreshFn = () => Promise<void> | void;

export function createRefreshRegistry() {
  let entries: Array<{ id: number; fn: RefreshFn }> = [];
  let seq = 0;
  let generation = 0;
  const listeners = new Set<() => void>();
  const bump = () => { generation += 1; listeners.forEach((l) => l()); };

  function register(fn: RefreshFn | null): () => void {
    if (!fn) return () => {};
    const id = ++seq;
    entries.push({ id, fn });
    bump();
    let done = false;
    return () => {
      if (done) return;
      done = true;
      entries = entries.filter((e) => e.id !== id);
      bump();
    };
  }
  const current = (): RefreshFn | null => entries[entries.length - 1]?.fn ?? null;
  const clear = () => { entries = []; bump(); };
  return {
    register,
    current,
    clear,
    get generation() { return generation; },
    get size() { return entries.length; },
    subscribe(l: () => void) { listeners.add(l); return () => { listeners.delete(l); }; },
  };
}
