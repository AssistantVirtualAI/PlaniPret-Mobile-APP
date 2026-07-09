// Planipret mobile — REST-only call-control quality placeholder.

export type QualityLabel = "excellent" | "good" | "poor" | "unknown";

export interface CallQualitySnapshot {
  at: number;
  jitterMs: number | null;
  lossPct: number | null;
  rttMs: number | null;
  label: QualityLabel;
}

type Listener = (s: CallQualitySnapshot) => void;

function classify(jitterMs: number | null, lossPct: number | null, rttMs: number | null): QualityLabel {
  if (jitterMs == null && lossPct == null && rttMs == null) return "unknown";
  if ((lossPct ?? 0) > 5 || (jitterMs ?? 0) > 60 || (rttMs ?? 0) > 400) return "poor";
  if ((lossPct ?? 0) > 2 || (jitterMs ?? 0) > 30 || (rttMs ?? 0) > 200) return "good";
  return "excellent";
}

class CallQualitySampler {
  private listeners = new Set<Listener>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private snap: CallQualitySnapshot = { at: Date.now(), jitterMs: null, lossPct: null, rttMs: null, label: "unknown" };
  private lastPacketsLost = 0;
  private lastPacketsReceived = 0;

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    fn(this.snap);
    if (!this.timer) this.startLoop();
    return () => {
      this.listeners.delete(fn);
      if (this.listeners.size === 0) this.stopLoop();
    };
  }

  private startLoop() {
    this.timer = setInterval(() => { this.sample().catch(() => {}); }, 2000);
  }
  private stopLoop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private emit(patch: Partial<CallQualitySnapshot>) {
    const merged: CallQualitySnapshot = { ...this.snap, ...patch, at: Date.now() } as CallQualitySnapshot;
    merged.label = classify(merged.jitterMs, merged.lossPct, merged.rttMs);
    this.snap = merged;
    this.listeners.forEach((l) => { try { l(merged); } catch {} });
  }

  private async sample() {
    this.emit({ jitterMs: null, lossPct: null, rttMs: null });
    this.lastPacketsLost = 0;
    this.lastPacketsReceived = 0;
  }
}

export const callQualitySampler = new CallQualitySampler();
