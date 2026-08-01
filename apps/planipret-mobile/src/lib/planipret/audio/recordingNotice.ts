// Plays the "cet appel est enregistré" notice locally at the start of every
// active call. The audio lives in the private `pbx-audio` bucket
// (`call-recording-notice.wav`) — the same file NetSapiens plays to the caller
// as ring announcement — so both parties hear the same notice.
//
// Dedup state is module-level (NOT component-level) so that navigating away
// from / re-mounting PpActiveCallScreen never replays the notice mid-call, and
// a brand new call always plays it once.

import { supabase } from "@/integrations/supabase/client";

const BUCKET = "pbx-audio";
const OBJECT = "call-recording-notice.wav";

let cachedUrl: string | null = null;
let cachedAt = 0;

/** call keys already announced (module-level → survives re-render/navigation) */
const announced = new Set<string>();
let currentEl: HTMLAudioElement | null = null;

function log(msg: string, detail?: unknown) {
  // eslint-disable-next-line no-console
  console.info(`[recording-notice] ${msg}`, detail ?? "");
}

async function getNoticeUrl(): Promise<string | null> {
  if (cachedUrl && Date.now() - cachedAt < 45 * 60 * 1000) return cachedUrl;
  try {
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(OBJECT, 3600);
    if (error) log("signed url error", error.message);
    if (data?.signedUrl) {
      cachedUrl = data.signedUrl;
      cachedAt = Date.now();
      return cachedUrl;
    }
  } catch (e: any) {
    log("signed url threw", e?.message ?? e);
  }
  // Fallback: bucket may have been flipped public.
  try {
    const { data } = supabase.storage.from(BUCKET).getPublicUrl(OBJECT);
    if (data?.publicUrl) {
      const head = await fetch(data.publicUrl, { method: "HEAD" });
      if (head.ok) {
        cachedUrl = data.publicUrl;
        cachedAt = Date.now();
        log("using public url fallback");
        return cachedUrl;
      }
    }
  } catch { /* ignore */ }
  return null;
}

/**
 * Best-effort playback of the recording notice, once per `callKey`.
 * Never throws, never blocks the call.
 */
export async function playRecordingNotice(callKey?: string): Promise<void> {
  const key = callKey && callKey.length ? callKey : "__default__";
  if (announced.has(key)) return;
  announced.add(key);
  // keep the set bounded
  if (announced.size > 50) announced.clear();

  try {
    const url = await getNoticeUrl();
    if (!url) { log("notice unavailable (no url) — skipped", { key }); return; }
    const el = new Audio(url);
    el.volume = 0.9;
    // Do not steal the call's audio session on iOS: keep it inline.
    (el as any).playsInline = true;
    currentEl = el;
    await el.play().then(
      () => log("playing", { key }),
      (e: any) => log("play blocked", e?.message ?? e),
    );
  } catch (e: any) {
    log("failed", e?.message ?? e);
  }
}

/** Called when a call ends so the next call re-plays the notice. */
export function resetRecordingNotice(callKey?: string) {
  if (callKey) announced.delete(callKey);
  else announced.clear();
  try { currentEl?.pause(); } catch { /* noop */ }
  currentEl = null;
}
