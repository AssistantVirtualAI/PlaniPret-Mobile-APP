// Simple Web Audio ring players — no audio files needed.
export class RingtonePlayer {
  private ctx: AudioContext | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private oscs: OscillatorNode[] = [];
  private gain: GainNode | null = null;
  constructor(
    private readonly frequencies = [440],
    private readonly cadenceMs = 1500,
    private readonly toneMs = 1000,
    private readonly volume = 0.15,
  ) {}

  start() {
    if (this.timer) return;
    try {
      this.ctx = this.ctx || new (window.AudioContext || (window as any).webkitAudioContext)();
      this.ctx.resume?.().catch(() => {});
      const beep = () => {
        if (!this.ctx) return;
        this.stopTone();
        this.gain = this.ctx.createGain();
        this.gain.gain.value = this.volume;
        this.gain.connect(this.ctx.destination);
        this.oscs = this.frequencies.map((freq) => {
          const osc = this.ctx!.createOscillator();
          osc.frequency.value = freq;
          osc.type = "sine";
          osc.connect(this.gain!);
          osc.start();
          return osc;
        });
        setTimeout(() => {
          this.stopTone();
        }, this.toneMs);
      };
      beep();
      this.timer = setInterval(beep, this.cadenceMs);
    } catch (e) {
      console.warn("RingtonePlayer failed", e);
    }
  }

  private stopTone() {
    for (const osc of this.oscs) {
      try { osc.stop(); } catch {}
      try { osc.disconnect(); } catch {}
    }
    this.oscs = [];
    try { this.gain?.disconnect(); } catch {}
    this.gain = null;
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.stopTone();
    try { this.ctx?.close(); } catch {}
    this.ctx = null;
  }
}

export const ringtone = new RingtonePlayer([440], 1500, 1000, 0.15);
// North-American ringback cadence used by SIP carriers: 440 + 480 Hz, 2s on / 4s cadence.
export const ringback = new RingtonePlayer([440, 480], 4000, 2000, 0.12);
