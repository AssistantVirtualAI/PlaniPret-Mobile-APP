// Phase 4.2 — Network monitor + quality classifier for /mplanipret.
// Wraps @capacitor/network; safe on web (falls back to navigator.onLine).

import { Network, type ConnectionStatus } from "@capacitor/network";

export type NetQuality = "excellent" | "good" | "fair" | "poor" | "offline";

export interface NetSample {
  connected: boolean;
  type: string;       // wifi | cellular | none | unknown
  rtt: number | null; // ms
  loss: number;       // 0..1
  quality: NetQuality;
  ts: number;
}

type Handler = (s: NetSample) => void;

const PREFS_KEY = "pp_network_prefs";
export interface NetworkPrefs {
  autoSwitch: boolean;
  preferWifi: boolean;
  backgroundCalls: boolean;
}
export function loadNetworkPrefs(): NetworkPrefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (raw) return { autoSwitch: true, preferWifi: true, backgroundCalls: true, ...JSON.parse(raw) };
  } catch {}
  return { autoSwitch: true, preferWifi: true, backgroundCalls: true };
}
export function saveNetworkPrefs(p: NetworkPrefs) {
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(p)); } catch {}
}

function classify(rtt: number | null, loss: number, connected: boolean): NetQuality {
  if (!connected) return "offline";
  if (rtt === null) return "good";
  if (loss > 0.05) return "poor";
  if (rtt < 50) return "excellent";
  if (rtt < 150) return "good";
  if (rtt < 300) return "fair";
  return "poor";
}

async function probeRtt(url: string, n = 3): Promise<{ rtt: number | null; loss: number }> {
  let total = 0; let ok = 0;
  for (let i = 0; i < n; i++) {
    const t = performance.now();
    try {
      await fetch(`${url}?t=${Date.now()}`, { method: "HEAD", cache: "no-store" });
      total += performance.now() - t;
      ok++;
    } catch { /* lost */ }
  }
  return { rtt: ok ? Math.round(total / ok) : null, loss: 1 - ok / n };
}

class NetworkMonitorImpl {
  private handlers = new Set<Handler>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private last: NetSample = { connected: true, type: "unknown", rtt: null, loss: 0, quality: "good", ts: Date.now() };
  private inited = false;
  private probeUrl = `${import.meta.env.VITE_SUPABASE_URL ?? ""}/auth/v1/health`;

  async init() {
    if (this.inited) return;
    this.inited = true;
    try {
      const status = await Network.getStatus();
      this.onChange(status);
      Network.addListener("networkStatusChange", (s) => this.onChange(s));
    } catch {
      this.onChange({ connected: navigator.onLine, connectionType: "unknown" } as any);
      window.addEventListener("online", () => this.onChange({ connected: true, connectionType: "unknown" } as any));
      window.addEventListener("offline", () => this.onChange({ connected: false, connectionType: "none" } as any));
    }
  }

  /** Start the 5 s sampler (call only while an active call is on-screen). */
  startSampling() {
    if (this.timer) return;
    this.timer = setInterval(() => this.checkSignalQuality(), 5000);
    this.checkSignalQuality();
  }
  stopSampling() {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
  }

  subscribe(fn: Handler) {
    this.handlers.add(fn);
    fn(this.last);
    return () => { this.handlers.delete(fn); };
  }

  current(): NetSample { return this.last; }

  private onChange(status: ConnectionStatus | any) {
    const connected = !!status.connected;
    const type = String(status.connectionType ?? "unknown");
    this.publish({ ...this.last, connected, type, quality: classify(this.last.rtt, this.last.loss, connected), ts: Date.now() });
    if (!connected) this.attemptHandover().catch(() => {});
  }

  private async checkSignalQuality() {
    if (!this.probeUrl) return;
    const { rtt, loss } = await probeRtt(this.probeUrl);
    this.publish({ ...this.last, rtt, loss, quality: classify(rtt, loss, this.last.connected), ts: Date.now() });
  }

  /** Best-effort handover orchestration. Real SIP re-INVITE requires native. */
  async attemptHandover(): Promise<void> {
    try {
      const b: any = (window as any)?.Capacitor?.Plugins?.CapacitorSip;
      if (b?.prewarmAudio) await b.prewarmAudio({});
      if (b?.reinvite) await b.reinvite({});
    } catch { /* silent */ }
  }

  private publish(s: NetSample) {
    this.last = s;
    this.handlers.forEach((h) => h(s));
  }
}

export const networkMonitor = new NetworkMonitorImpl();
