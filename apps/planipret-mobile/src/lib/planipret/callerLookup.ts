// Resolves caller names via the pp-caller-lookup edge function (device contacts,
// Maestro CRM, org brokers, Microsoft 365). Positive results are cached for the
// session; negatives expire after 60s so `useCallerNames` retries in background.
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const cache = new Map<string, string>();
const negative = new Map<string, number>(); // phone → expiresAt (ms epoch)
const inflight = new Map<string, Promise<string | null>>();
const NEGATIVE_TTL_MS = 60_000;

function negativeFresh(p: string): boolean {
  const exp = negative.get(p);
  if (!exp) return false;
  if (exp < Date.now()) { negative.delete(p); return false; }
  return true;
}

export async function lookupCaller(phone: string | null | undefined): Promise<string | null> {
  const p = (phone || "").trim();
  if (!p) return null;
  if (cache.has(p)) return cache.get(p) || null;
  if (negativeFresh(p)) return null;
  if (inflight.has(p)) return inflight.get(p)!;

  const promise = (async () => {
    try {
      const { data, error } = await supabase.functions.invoke("pp-caller-lookup", { body: { phone: p } });
      if (error) {
        console.warn("[lookupCaller] error", p, error.message);
        negative.set(p, Date.now() + NEGATIVE_TTL_MS);
        return null;
      }
      const d = data as any;
      if (d?.found && d?.name) {
        cache.set(p, d.name);
        negative.delete(p);
        return d.name as string;
      }
      negative.set(p, Date.now() + NEGATIVE_TTL_MS);
      return null;
    } catch (e: any) {
      console.warn("[lookupCaller] threw", p, e?.message);
      negative.set(p, Date.now() + NEGATIVE_TTL_MS);
      return null;
    } finally {
      inflight.delete(p);
    }
  })();
  inflight.set(p, promise);
  return promise;
}

/**
 * Hook: returns a { [phone]: name } map that fills in progressively.
 * Retries unresolved numbers in the background every `retryMs` (default 30s).
 */
export function useCallerNames(
  phones: (string | null | undefined)[],
  opts?: { retryMs?: number },
): Record<string, string> {
  const retryMs = opts?.retryMs ?? 30_000;
  const key = phones.filter(Boolean).join("|");
  const [names, setNames] = useState<Record<string, string>>(() => {
    const seed: Record<string, string> = {};
    for (const p of phones) if (p && cache.has(p)) seed[p] = cache.get(p)!;
    return seed;
  });
  const aliveRef = useRef(true);

  useEffect(() => {
    aliveRef.current = true;
    const uniq = Array.from(new Set(phones.filter((x): x is string => !!x && x.trim().length > 0)));

    const seeded: Record<string, string> = {};
    uniq.forEach((p) => { const c = cache.get(p); if (c) seeded[p] = c; });
    if (Object.keys(seeded).length) setNames((prev) => ({ ...seeded, ...prev }));

    const tryLookup = (p: string) => {
      if (cache.has(p)) return;
      lookupCaller(p).then((name) => {
        if (!aliveRef.current || !name) return;
        setNames((prev) => (prev[p] === name ? prev : { ...prev, [p]: name }));
      });
    };

    uniq.forEach(tryLookup);

    // Periodic background retry for still-unresolved numbers. Negatives expire
    // after 60s, so the retry can actually pick up new Maestro/Microsoft data.
    const interval = window.setInterval(() => {
      if (!aliveRef.current) return;
      uniq.forEach((p) => { if (!cache.has(p)) tryLookup(p); });
    }, retryMs);

    return () => { aliveRef.current = false; window.clearInterval(interval); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, retryMs]);

  return names;
}
