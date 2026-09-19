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

/** NANP normalization shared with the backend lookup (+1XXXXXXXXXX). */
export function normalizeLookupPhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = String(raw).replace(/\D/g, "");
  if (!digits) return null;
  if (digits.length <= 6) return null; // internal extension: resolved server-side
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  if (digits.length >= 8 && digits.length <= 15) return `+${digits}`;
  return null;
}

/**
 * Batch-resolves display numbers against the broker's own contacts in a single
 * query. This is the fast path: it avoids one edge call per row on mobile
 * networks, where individual invocations often fail and leave bare numbers.
 */
async function batchLookupContacts(phones: string[]): Promise<Record<string, string>> {
  const byNormalized = new Map<string, string[]>();
  for (const p of phones) {
    const n = normalizeLookupPhone(p);
    if (!n) continue;
    const list = byNormalized.get(n) ?? [];
    list.push(p);
    byNormalized.set(n, list);
  }
  if (byNormalized.size === 0) return {};
  try {
    const { data, error } = await supabase
      .from("planipret_contacts")
      .select("full_name, phone_normalized")
      .in("phone_normalized", Array.from(byNormalized.keys()))
      .limit(500);
    if (error || !data) return {};
    const out: Record<string, string> = {};
    for (const row of data as Array<{ full_name: string | null; phone_normalized: string | null }>) {
      const name = (row.full_name ?? "").trim();
      const normalized = row.phone_normalized ?? "";
      if (!name || !normalized) continue;
      for (const original of byNormalized.get(normalized) ?? []) {
        if (out[original]) continue;
        out[original] = name;
        cache.set(original, name);
        negative.delete(original);
      }
    }
    return out;
  } catch {
    return {};
  }
}

/**
 * Hook: returns a { [phone]: name } map that fills in progressively.
 * Contacts are resolved in one batched query first, then anything still
 * unknown (colleagues, Maestro, Microsoft) falls back to the edge lookup.
 */
export function useCallerNames(
  phones: (string | null | undefined)[],
): Record<string, string> {
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

    const pending = uniq.filter((p) => !cache.has(p));
    if (pending.length === 0) return () => { aliveRef.current = false; };

    batchLookupContacts(pending).then((resolved) => {
      if (!aliveRef.current) return;
      if (Object.keys(resolved).length) {
        setNames((prev) => ({ ...prev, ...resolved }));
      }
      pending.filter((p) => !resolved[p]).forEach(tryLookup);
    });

    return () => { aliveRef.current = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return names;
}
