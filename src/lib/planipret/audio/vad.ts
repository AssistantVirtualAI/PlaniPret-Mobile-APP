// Phase 4.1 — Voice Activity Detection + VU level emitter.
// Pure web-audio; safe in the preview without native plugins.

export type VadEvent = "speaking" | "silent";
export type VadAutoMute = "off" | "30s" | "60s";

export interface VadOptions {
  /** Raw input stream (microphone). */
  stream: MediaStream;
  /** Threshold 0..1 above which we consider speech. */
  threshold?: number;
  /** Auto-mute timer when silent. */
  autoMute?: VadAutoMute;
  onLevel?: (level10: number) => void;
  onEvent?: (e: VadEvent) => void;
  onAutoMute?: () => void;
}

export interface VadHandle {
  stop: () => void;
  setAutoMute: (m: VadAutoMute) => void;
}

export function startVad(opts: VadOptions): VadHandle {
  const { stream, threshold = 0.045, onLevel, onEvent, onAutoMute } = opts;
  let autoMute: VadAutoMute = opts.autoMute ?? "off";
  let silenceSince: number | null = null;
  let raf = 0;
  let lastEvent: VadEvent = "silent";
  const AC: any = (window as any).AudioContext || (window as any).webkitAudioContext;
  if (!AC) return { stop: () => {}, setAutoMute: () => {} };
  const ctx = new AC();
  const src = ctx.createMediaStreamSource(stream);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 1024;
  src.connect(analyser);
  const buf = new Uint8Array(analyser.fftSize);

  const tick = () => {
    analyser.getByteTimeDomainData(buf);
    let sum = 0;
    for (let i = 0; i < buf.length; i++) {
      const v = (buf[i] - 128) / 128;
      sum += v * v;
    }
    const rms = Math.sqrt(sum / buf.length); // 0..1
    onLevel?.(Math.min(10, Math.round(rms * 80)));
    const speaking = rms > threshold;
    const next: VadEvent = speaking ? "speaking" : "silent";
    if (next !== lastEvent) {
      lastEvent = next;
      onEvent?.(next);
      silenceSince = speaking ? null : Date.now();
    }
    if (!speaking && autoMute !== "off") {
      const limit = autoMute === "30s" ? 30_000 : 60_000;
      if (silenceSince && Date.now() - silenceSince >= limit) {
        silenceSince = null;
        onAutoMute?.();
      }
    }
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);

  return {
    stop: () => { cancelAnimationFrame(raf); ctx.close().catch(() => {}); },
    setAutoMute: (m) => { autoMute = m; silenceSince = m === "off" ? null : Date.now(); },
  };
}
