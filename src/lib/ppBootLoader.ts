/**
 * ppBootLoader — Aggressive boot-time preloader for Planiprêt Mobile.
 *
 * Strategy:
 *  1. Immediately (microtask) kick off all lazy JS chunk imports in parallel.
 *  2. After chunks are warm, prefetch critical page data into ppPageCache.
 *  3. Everything runs fire-and-forget — never blocks the UI.
 *
 * This ensures that switching between tabs feels instant because:
 *  - The JS bundle for every page is already parsed and ready.
 *  - The first data fetch for each page hits sessionStorage cache, not the network.
 */

import { prefetchAllMplanipret } from "@/lib/routePrefetch";
import { writePageCache, readPageCache } from "@/lib/ppPageCache";
import { supabase } from "@/integrations/supabase/client";

let bootStarted = false;

/** Prefetch critical data for a page and store in ppPageCache. */
async function prefetchPageData(userId: string): Promise<void> {
  // Run all data fetches in parallel — each one writes to ppPageCache.
  await Promise.allSettled([
    prefetchCallsData(userId),
    prefetchMessagesData(userId),
    prefetchVoicemailData(userId),
    prefetchNotificationsData(userId),
  ]);
}

async function prefetchCallsData(userId: string): Promise<void> {
  const key = "calls";
  const cached = readPageCache<any>(key, userId);
  if (cached && !cached.stale) return; // still fresh
  try {
    const [cdrRes, vmRes] = await Promise.allSettled([
      supabase.functions.invoke("pp-ns-cdr", { body: { action: "list", limit: 50, offset: 0 } }),
      supabase.functions.invoke("pp-ns-voicemail", { body: { action: "list", folder: "inbox" } }),
    ]);
    const cdrs = (cdrRes.status === "fulfilled" ? (cdrRes.value.data as any)?.cdrs ?? [] : []);
    const vms = (vmRes.status === "fulfilled" ? (vmRes.value.data as any)?.voicemails ?? [] : []);
    writePageCache(key, userId, { cdrs, vms, fetchedAt: Date.now() });
  } catch { /* silent */ }
}

async function prefetchMessagesData(userId: string): Promise<void> {
  const key = "messages";
  const cached = readPageCache<any>(key, userId);
  if (cached && !cached.stale) return;
  try {
    const res = await supabase.functions.invoke("pp-ns-sms", { body: { action: "threads" } });
    const threads = (res.data as any)?.threads ?? [];
    writePageCache(key, userId, { threads, fetchedAt: Date.now() });
  } catch { /* silent */ }
}

async function prefetchVoicemailData(userId: string): Promise<void> {
  const key = "voicemail";
  const cached = readPageCache<any>(key, userId);
  if (cached && !cached.stale) return;
  try {
    const res = await supabase.functions.invoke("pp-ns-voicemail", { body: { action: "list", folder: "inbox" } });
    const voicemails = (res.data as any)?.voicemails ?? [];
    writePageCache(key, userId, { voicemails, fetchedAt: Date.now() });
  } catch { /* silent */ }
}

async function prefetchNotificationsData(userId: string): Promise<void> {
  const key = "notifications";
  const cached = readPageCache<any>(key, userId);
  if (cached && !cached.stale) return;
  try {
    const { data } = await supabase
      .from("planipret_ava_notifications")
      .select("*")
      .eq("user_id", userId)
      .is("read_at", null)
      .order("created_at", { ascending: false })
      .limit(50);
    writePageCache(key, userId, { notifications: data ?? [], fetchedAt: Date.now() });
  } catch { /* silent */ }
}

/**
 * Boot the preloader. Safe to call multiple times — only runs once per session.
 * Call this as early as possible (e.g., in PlanipretMobile on mount).
 *
 * @param userId  The authenticated user's ID. Required for data prefetch.
 */
export function bootPreloader(userId?: string): void {
  if (bootStarted) return;
  bootStarted = true;

  // Phase 1: warm all JS chunks immediately (microtask — no blocking).
  prefetchAllMplanipret();

  // Phase 2: prefetch page data after a short delay so the initial paint
  // is not delayed by network requests.
  if (userId) {
    const delay = typeof (window as any).requestIdleCallback === "function"
      ? (fn: () => void) => (window as any).requestIdleCallback(fn, { timeout: 3000 })
      : (fn: () => void) => setTimeout(fn, 800);

    delay(() => { void prefetchPageData(userId); });
  }
}

/** Re-run data prefetch (e.g., after focus/resume). Chunks are already warm. */
export function refreshPreloadedData(userId: string): void {
  if (!userId) return;
  void prefetchPageData(userId);
}
