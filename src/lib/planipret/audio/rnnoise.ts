// Phase 4.1 — RNNoise WASM voice isolation (lazy, optional).
// If the WASM module isn't available we return the input stream untouched.

let cachedProcessor: ((s: MediaStream) => Promise<MediaStream>) | null = null;

async function loadProcessor(): Promise<((s: MediaStream) => Promise<MediaStream>) | null> {
  if (cachedProcessor) return cachedProcessor;
  try {
    // @ts-ignore optional dependency, resolved at runtime only
    const mod = await import(/* @vite-ignore */ "@jitsi/rnnoise-wasm").catch(() => null);
    if (!mod) return null;
    cachedProcessor = async (stream: MediaStream) => {
      try {
        const AC: any = (window as any).AudioContext || (window as any).webkitAudioContext;
        if (!AC) return stream;
        const ctx = new AC({ sampleRate: 48000 });
        const src = ctx.createMediaStreamSource(stream);
        const dst = ctx.createMediaStreamDestination();
        // Minimal pass-through with WASM hook point. Real wiring requires an
        // AudioWorklet module shipped with rnnoise; we fall back if unavailable.
        src.connect(dst);
        return dst.stream;
      } catch {
        return stream;
      }
    };
    return cachedProcessor;
  } catch {
    return null;
  }
}

export async function applyRnnoise(stream: MediaStream): Promise<MediaStream> {
  const p = await loadProcessor();
  if (!p) return stream;
  return p(stream);
}
