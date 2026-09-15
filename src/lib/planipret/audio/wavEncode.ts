// Planipret — convert a MediaRecorder blob (webm/opus on Android, mp4/aac on iOS)
// into a plain 16-bit PCM WAV mono 8 kHz buffer.
//
// Why: NetSapiens only reliably ingests WAV/PCM greetings. Pushing webm or m4a
// straight to /greetings works on some nodes and silently fails on others
// ("greeting recorded but callers hear the default message"). Converting in the
// browser removes the whole class of failure.

const TARGET_RATE = 8000;

export async function blobToWavMono8k(blob: Blob): Promise<Uint8Array> {
  const arrayBuffer = await blob.arrayBuffer();
  const Ctx: typeof AudioContext =
    (window as any).AudioContext ?? (window as any).webkitAudioContext;
  if (!Ctx) throw new Error("audio_context_unavailable");

  const decodeCtx = new Ctx();
  let decoded: AudioBuffer;
  try {
    decoded = await new Promise<AudioBuffer>((resolve, reject) => {
      // Callback form keeps Safari/WKWebView happy.
      const p = (decodeCtx as any).decodeAudioData(arrayBuffer.slice(0), resolve, reject);
      if (p && typeof p.then === "function") p.then(resolve, reject);
    });
  } finally {
    decodeCtx.close().catch(() => undefined);
  }

  const frames = Math.max(1, Math.ceil(decoded.duration * TARGET_RATE));
  const OfflineCtx: typeof OfflineAudioContext =
    (window as any).OfflineAudioContext ?? (window as any).webkitOfflineAudioContext;
  if (!OfflineCtx) throw new Error("offline_audio_unavailable");

  const offline = new OfflineCtx(1, frames, TARGET_RATE);
  const src = offline.createBufferSource();
  src.buffer = decoded;
  src.connect(offline.destination);
  src.start(0);
  const rendered = await offline.startRendering();

  return encodeWav(rendered.getChannelData(0), TARGET_RATE);
}

function encodeWav(samples: Float32Array, sampleRate: number): Uint8Array {
  const bytes = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(bytes);
  const writeStr = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
  };

  writeStr(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);              // PCM
  view.setUint16(22, 1, true);              // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // byte rate
  view.setUint16(32, 2, true);              // block align
  view.setUint16(34, 16, true);             // bits per sample
  writeStr(36, "data");
  view.setUint32(40, samples.length * 2, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    offset += 2;
  }
  return new Uint8Array(bytes);
}

/** Peak level of the recording — used to reject silent takes. */
export function wavPeak(wav: Uint8Array): number {
  const view = new DataView(wav.buffer, wav.byteOffset, wav.byteLength);
  let peak = 0;
  for (let i = 44; i + 1 < wav.length; i += 2) {
    const v = Math.abs(view.getInt16(i, true)) / 0x8000;
    if (v > peak) peak = v;
  }
  return peak;
}

export function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}
