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

/**
 * ring16 - true once CallKit has handed us a usable output route for the current
 * call. Playing anything before that corrupts the shared WebKit audio pipeline
 * (see the comment in playRecordingNotice).
 */
let audioRouteLive = false;
if (typeof window !== "undefined") {
  window.addEventListener("pp:audio-route-live", () => { audioRouteLive = true; });
}

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

    // ring16 - Wait for the audio route to exist before creating this element.
    //
    // In log 138 this notice was the FIRST thing to touch audio after the 200 OK,
    // and it did so while AVAudioSession still had no output route (CallKit's
    // didActivate had not fired yet). The result, verbatim:
    //     AudioSession::beginInterruption but session is already interrupted!
    //     [recording-notice] play blocked "The operation was aborted."
    // A new Audio() on an interrupted session is what pushes WebKit's shared
    // audio pipeline into its interrupted state - and the CALL's own <audio>
    // element is in that very same pipeline. A cosmetic notice was therefore
    // taking down the conversation audio it is supposed to announce.
    //
    // So we hold off until the route is live. The native didActivate handler
    // dispatches pp:audio-route-live; we also cap the wait so the notice still
    // plays on paths where that event never comes (web, Android).
    await waitForAudioRoute();

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

/**
 * ring16 - Resolve once the CallKit audio route is live, or after a short cap.
 * Never rejects: the notice must never be able to hold up or break a call.
 */
function waitForAudioRoute(maxWaitMs = 2500): Promise<void> {
  return new Promise<void>((resolve) => {
    if (typeof window === "undefined") { resolve(); return; }
    if (audioRouteLive) { resolve(); return; }
    let done = false;
    const finish = (why: string) => {
      if (done) return;
      done = true;
      window.clearTimeout(timer);
      window.removeEventListener("pp:audio-route-live", onLive);
      log(`notice released (${why})`);
      resolve();
    };
    const onLive = () => finish("audio route live");
    const timer = window.setTimeout(() => finish(`no route event after ${maxWaitMs}ms`), maxWaitMs);
    window.addEventListener("pp:audio-route-live", onLive, { once: true });
  });
}

/** Called when a call ends so the next call re-plays the notice. */
export function resetRecordingNotice(callKey?: string) {
  if (callKey) announced.delete(callKey);
  else announced.clear();
  // ring16 - the next call gets a fresh session; require a fresh route signal.
  audioRouteLive = false;
  try { currentEl?.pause(); } catch { /* noop */ }
  currentEl = null;
}
