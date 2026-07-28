/**
 * Phase 5 — offline-first recording cache.
 *
 * Resolves a playable URL for a recording, preferring a previously-downloaded
 * local copy. If absent, fetches the short-lived signed URL from the backend,
 * streams the bytes onto disk (native) or into a Blob (web), and returns a
 * local/object URL that does not expire and works offline.
 *
 * iOS note: Filesystem.stat() throws when the file does not exist. The catch
 * block correctly returns null, which causes getCachedRecordingUrl to return
 * null, which causes downloadRecording (and prefetchRecordings) to fetch a
 * fresh copy from the backend. This handles the case where iOS evicts cached
 * files from the Data directory (low storage, app update, sandbox reset).
 *
 * The in-memory set `knownMissingIds` prevents redundant stat calls for files
 * that already failed once during the current session.
 */
import { Capacitor } from '@capacitor/core';
import { loadPbxRecordingAudioMobile } from './mobileSupabase';

const META_KEY_PREFIX = 'ava.recordingCache.v1.';

// Files confirmed missing this session — skip stat, go straight to download.
const knownMissingIds = new Set<string>();

type RecMeta = {
  recording_path?: string | null;
  recording_name?: string | null;
  xml_cdr_uuid?: string | null;
  domain_uuid?: string | null;
  domain_name?: string | null;
  organization_id?: string | null;
  start_at?: string | null;
};

function sanitizeId(id: string) {
  return id.replace(/[^a-zA-Z0-9._-]/g, '_');
}

// iOS WKWebView's <audio> infers codec from file extension. A generic ".audio"
// extension causes the player to refuse playback. We always write the file
// with a real audio extension (.wav by default — FusionPBX's native format).
const KNOWN_EXTS = ['wav', 'mp3', 'ogg', 'm4a', 'mp4', 'aac', 'opus', 'webm'];
const MIN_AUDIO_BYTES = 256; // anything smaller is almost certainly an error page

// Map a Content-Type to a known audio extension. Returns null when unknown.
function extFromContentType(blobType: string | undefined): string | null {
  const t = (blobType || '').toLowerCase();
  if (!t) return null;
  if (t.includes('wav') || t.includes('wave') || t.includes('x-wav')) return 'wav';
  if (t.includes('mpeg') || t.includes('mp3')) return 'mp3';
  if (t.includes('ogg')) return 'ogg';
  if (t.includes('mp4') || t.includes('m4a') || t.includes('aac')) return 'm4a';
  if (t.includes('opus')) return 'opus';
  if (t.includes('webm')) return 'webm';
  return null;
}

function pickExt(blobType: string | undefined, recordingName: string | undefined, cid: string): string {
  const nameLower = (recordingName || '').toLowerCase();
  for (const ext of KNOWN_EXTS) {
    if (nameLower.endsWith('.' + ext)) return ext;
  }
  const fromType = extFromContentType(blobType);
  if (fromType) return fromType;
  console.warn('[recordingCache] cid=' + cid + ' action=pick-ext fallback=wav', { contentType: blobType || null, recordingName: recordingName || null });
  return 'wav';
}


async function findExistingFile(id: string): Promise<string | null> {
  if (!Capacitor.isNativePlatform()) return null;
  try {
    const { Filesystem, Directory } = await import(/* @vite-ignore */ '@capacitor/filesystem');
    const base = sanitizeId(id);
    // Probe known extensions plus the legacy ".audio" name for backward compat.
    const candidates = [...KNOWN_EXTS.map((e) => `recordings/${base}.${e}`), `recordings/${base}.audio`];
    for (const path of candidates) {
      try {
        const st = await Filesystem.stat({ path, directory: Directory.Data });
        if (st && (st.size === undefined || st.size > 0)) return path;
      } catch { /* not this one */ }
    }
  } catch { /* filesystem unavailable */ }
  return null;
}

/**
 * Returns the native playable URL for a cached file, or null if the file
 * does not exist on disk (stat throws → file is absent → return null).
 *
 * IMPORTANT: Filesystem.stat() on iOS throws a native error when the file is
 * missing. That error is caught here and null is returned so the caller knows
 * it must download the file. We also add the id to knownMissingIds so
 * subsequent calls skip the stat entirely.
 */
async function getCachedNativePath(id: string): Promise<string | null> {
  if (!Capacitor.isNativePlatform()) return null;

  // Fast-path: already confirmed missing this session.
  if (knownMissingIds.has(id)) return null;

  try {
    const { Filesystem, Directory } = await import(/* @vite-ignore */ '@capacitor/filesystem');
    const found = await findExistingFile(id);
    if (!found) {
      knownMissingIds.add(id);
      return null;
    }
    const statResult = await Filesystem.stat({ path: found, directory: Directory.Data });
    if (!statResult || (statResult.size !== undefined && statResult.size === 0)) {
      knownMissingIds.add(id);
      return null;
    }
    const uri = await Filesystem.getUri({ path: found, directory: Directory.Data });
    return Capacitor.convertFileSrc(uri.uri);
  } catch {
    knownMissingIds.add(id);
    return null;
  }
}

const webBlobCache = new Map<string, string>();

export async function getCachedRecordingUrl(id: string): Promise<string | null> {
  if (Capacitor.isNativePlatform()) return getCachedNativePath(id);
  return webBlobCache.get(id) || null;
}

/**
 * Call this after a successful download to clear the missing-file flag so
 * subsequent getCachedRecordingUrl calls return the freshly-written file.
 */
export function markRecordingCached(id: string) {
  knownMissingIds.delete(id);
}

/**
 * Download + cache the recording. Returns a playable URL.
 * Reuses an existing cached copy if present (force=true to bypass).
 */
export async function downloadRecording(
  id: string,
  meta: RecMeta,
  accessToken: string | null,
  organizationId: string | null,
  domainUuidFallback: string | null,
  opts: { force?: boolean } = {},
): Promise<string> {
  if (!opts.force) {
    const existing = await getCachedRecordingUrl(id);
    if (existing) return existing;
  }

  const signedUrl = await loadPbxRecordingAudioMobile(
    {
      id,
      xml_cdr_uuid: meta.xml_cdr_uuid || undefined,
      recording_path: meta.recording_path || undefined,
      recording_name: meta.recording_name || undefined,
      domain_uuid: meta.domain_uuid || undefined,
      domain_name: meta.domain_name || undefined,
      organization_id: meta.organization_id || undefined,
      start_at: meta.start_at || undefined,
    },
    accessToken,
    organizationId,
    domainUuidFallback,
    { skipCache: true },
  );

  const cid = sanitizeId(id);
  // Validate it's a real HTTP(S) URL — never a stale blob: URL that fetch() can't read.
  if (!/^https?:\/\//i.test(signedUrl)) {
    console.error('[recordingCache] cid=' + cid + ' action=invalid-url', { signedUrl: signedUrl.slice(0, 40) });
    throw new Error('Invalid recording URL — not an HTTP URL');
  }
  console.log('[recordingCache] cid=' + cid + ' action=fetch-start', { force: !!opts.force });
  const resp = await fetch(signedUrl);
  if (!resp.ok) {
    console.error('[recordingCache] cid=' + cid + ' action=fetch-fail', { status: resp.status });
    throw new Error(`Download failed: HTTP ${resp.status}`);
  }
  const contentType = resp.headers.get('content-type') || '';
  const contentLength = Number(resp.headers.get('content-length') || '0') || 0;
  const blob = await resp.blob();
  const effectiveType = blob.type || contentType;

  // Stronger validation: refuse empty / suspiciously small / non-audio payloads.
  if (blob.size === 0) {
    console.error('[recordingCache] cid=' + cid + ' action=validate size=0', { contentType, contentLength });
    throw new Error('Download failed: empty audio blob (0 bytes)');
  }
  if (contentLength > 0 && Math.abs(contentLength - blob.size) > 16) {
    console.warn('[recordingCache] cid=' + cid + ' action=validate size-mismatch', { contentLength, blobSize: blob.size, contentType: effectiveType });
  }
  if (blob.size < MIN_AUDIO_BYTES) {
    console.error('[recordingCache] cid=' + cid + ' action=validate too-small', { size: blob.size, contentType: effectiveType });
    throw new Error(`Download failed: payload too small (${blob.size} bytes, content-type=${effectiveType || 'unknown'})`);
  }
  if (effectiveType && !/audio|octet-stream|mpeg|wav|ogg|mp4|m4a|aac|opus|webm/i.test(effectiveType)) {
    console.error('[recordingCache] cid=' + cid + ' action=validate non-audio', { contentType: effectiveType, size: blob.size });
    throw new Error(`Download failed: unexpected content-type "${effectiveType}"`);
  }

  if (Capacitor.isNativePlatform()) {
    const { Filesystem, Directory } = await import(/* @vite-ignore */ '@capacitor/filesystem');
    const buf = await blob.arrayBuffer();
    if (buf.byteLength === 0) throw new Error('Download failed: empty audio buffer (0 bytes)');
    const b64 = arrayBufferToBase64(buf);
    try { await Filesystem.mkdir({ path: 'recordings', directory: Directory.Data, recursive: true }); } catch {}
    let ext = pickExt(effectiveType, meta.recording_name || undefined, cid);
    if (!KNOWN_EXTS.includes(ext)) {
      const fallback = extFromContentType(effectiveType) || 'wav';
      console.warn('[recordingCache] cid=' + cid + ' action=ext-unknown fallback=' + fallback, { derived: ext, contentType: effectiveType });
      ext = fallback;
    }
    console.log('[recordingCache] cid=' + cid + ' action=write', { ext, contentType: effectiveType || '(none)', size: buf.byteLength, recordingName: meta.recording_name || null });
    const path = `recordings/${cid}.${ext}`;
    await Filesystem.writeFile({ path, directory: Directory.Data, data: b64 });
    try { localStorage.setItem(META_KEY_PREFIX + id, JSON.stringify({ at: Date.now(), size: buf.byteLength, ext, contentType: effectiveType || null })); } catch {}
    // Clear the missing flag now that the file is written.
    markRecordingCached(id);
    const uri = await Filesystem.getUri({ path, directory: Directory.Data });
    const src = Capacitor.convertFileSrc(uri.uri);
    console.log('[recordingCache] cid=' + cid + ' action=ready', { ext, src });
    return src;

  } else {
    const url = URL.createObjectURL(blob);
    const prev = webBlobCache.get(id);
    if (prev) { try { URL.revokeObjectURL(prev); } catch {} }
    webBlobCache.set(id, url);
    console.log('[recordingCache] cid=' + cid + ' action=ready-web', { contentType: effectiveType, size: blob.size });
    return url;
  }
}


/**
 * Best-effort warm-up: pre-fetch multiple recordings in the background.
 * Failures are swallowed so the UI never blocks on prefetch.
 *
 * Files that are missing from disk (stat threw) will have been added to
 * knownMissingIds by getCachedNativePath, so getCachedRecordingUrl returns
 * null for them and downloadRecording proceeds to fetch from the backend.
 */
export async function prefetchRecordings(
  items: Array<{ id: string; meta: RecMeta }>,
  accessToken: string | null,
  organizationId: string | null,
  domainUuidFallback: string | null,
  opts: { concurrency?: number } = {},
): Promise<void> {
  const concurrency = Math.max(1, Math.min(4, opts.concurrency ?? 2));
  let i = 0;
  const workers: Promise<void>[] = [];
  for (let k = 0; k < concurrency; k++) {
    workers.push((async () => {
      while (i < items.length) {
        const idx = i++;
        const it = items[idx];
        try {
          const cached = await getCachedRecordingUrl(it.id);
          if (cached) continue;
          // getCachedRecordingUrl returned null — either the file was never
          // downloaded or iOS evicted it. Download it now.
          await downloadRecording(it.id, it.meta, accessToken, organizationId, domainUuidFallback);
        } catch { /* ignore individual failures — try the next item */ }
      }
    })());
  }
  await Promise.all(workers);
}

function arrayBufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)) as any);
  }
  return typeof btoa === 'function' ? btoa(binary) : Buffer.from(binary, 'binary').toString('base64');
}
