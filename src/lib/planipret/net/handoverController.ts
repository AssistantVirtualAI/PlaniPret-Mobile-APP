// Planipret mobile — REST-only network change observer.

import { networkMonitor, type NetSample } from "@/lib/planipret/network/networkMonitor";

export type HandoverEvent =
  | { kind: "network-change"; from: string; to: string; at: number }
  | { kind: "quality-drop"; from: string; to: string; at: number }
  | { kind: "rest-control"; at: number; ok: boolean; reason: "network-change" | "quality-drop" };

type Listener = (e: HandoverEvent) => void;

class HandoverController {
  private listeners = new Set<Listener>();
  private lastType: string = "unknown";
  private lastQuality: NetSample["quality"] = "good";
  private started = false;
  private unsubNet: (() => void) | null = null;
  private lastActionAt = 0;

  async start() {
    if (this.started) return;
    this.started = true;
    try { await networkMonitor.init(); } catch {}
    this.unsubNet = networkMonitor.subscribe((s) => this.onNet(s));
  }
  stop() {
    this.started = false;
    this.unsubNet?.();
    this.unsubNet = null;
  }
  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => { this.listeners.delete(fn); };
  }
  private emit(e: HandoverEvent) { this.listeners.forEach((l) => { try { l(e); } catch {} }); }

  private autoEnabled(): boolean {
    try { const v = localStorage.getItem("pp_auto_handover"); return v === null ? true : v === "1"; }
    catch { return true; }
  }

  private runHandover(reason: "network-change" | "quality-drop") {
    if (!this.autoEnabled()) return;
    this.lastActionAt = Date.now();
    this.emit({ kind: "rest-control", at: Date.now(), ok: true, reason });
  }

  private async onNet(s: NetSample) {
    const prev = this.lastType;
    const prevQ = this.lastQuality;
    this.lastType = s.type;
    this.lastQuality = s.quality;

    // Interface change (Wi-Fi ↔ LTE ↔ none): trigger handover.
    if (prev !== "unknown" && prev !== s.type && Date.now() - this.lastActionAt > 1500) {
      this.emit({ kind: "network-change", from: prev, to: s.type, at: Date.now() });
      if (s.connected) this.runHandover("network-change");
      return;
    }

    // Quality dropped to poor: keep the indicator REST-only.
    if (
      s.connected &&
      prevQ !== "poor" &&
      s.quality === "poor" &&
      Date.now() - this.lastActionAt > 5000
    ) {
      this.emit({ kind: "quality-drop", from: prevQ, to: s.quality, at: Date.now() });
      this.runHandover("quality-drop");
    }
  }

  async forceHandover(): Promise<boolean> {
    this.runHandover("network-change");
    return true;
  }
}

export const handoverController = new HandoverController();
