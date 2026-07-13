/**
 * Shared in-memory cache for pp-ns-contacts actions.
 * Prevents each page (MContacts, MSearch, Dialer, active call) from
 * independently fetching the same 500-row directory on every mount.
 *
 * TTL: 60s. In-flight requests are deduped so parallel callers share
 * a single network request.
 */
import { supabase } from "@/integrations/supabase/client";

type Action = "list" | "shared" | "directory";
type Entry = { at: number; value: any[] };

const TTL_MS = 60_000;
const cache = new Map<Action, Entry>();
const inflight = new Map<Action, Promise<any[]>>();

function keyFor(payload: any): any[] {
  return payload?.directory ?? payload?.contacts ?? [];
}

export async function getPpContacts(action: Action, opts: { limit?: number; force?: boolean } = {}): Promise<any[]> {
  const now = Date.now();
  if (!opts.force) {
    const hit = cache.get(action);
    if (hit && now - hit.at < TTL_MS) return hit.value;
    const pending = inflight.get(action);
    if (pending) return pending;
  }
  const p = (async () => {
    const { data, error } = await supabase.functions.invoke("pp-ns-contacts", {
      body: { action, limit: opts.limit ?? 500 },
    });
    const payload: any = data ?? {};
    if (error || payload?.error) throw new Error(payload?.error || error?.message || action);
    const value = keyFor(payload);
    cache.set(action, { at: Date.now(), value });
    return value;
  })();
  inflight.set(action, p);
  try {
    return await p;
  } finally {
    inflight.delete(action);
  }
}

export function invalidatePpContacts(action?: Action) {
  if (action) cache.delete(action);
  else cache.clear();
}
