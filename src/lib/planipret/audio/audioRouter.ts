// Phase 4.1 — Audio output router for /mplanipret.
// Uses the Capacitor SIP plugin when available (same bridge as Lemtel) and
// falls back to no-ops in the web preview.

export type AudioRoute = "earpiece" | "speaker" | "bluetooth";

function bridge(): any {
  return (window as any)?.Capacitor?.Plugins?.CapacitorSip ?? null;
}

export const audioRouter = {
  async setRoute(route: AudioRoute): Promise<void> {
    const b = bridge();
    if (b?.setAudioRoute) {
      try { await b.setAudioRoute({ route }); return; } catch {}
    }
    // Web fallback: try matching sinkId on every <audio> tag.
    try {
      document.querySelectorAll("audio").forEach((el: any) => {
        if (typeof el.setSinkId === "function") {
          el.setSinkId(route === "speaker" ? "default" : "").catch(() => {});
        }
      });
    } catch {}
  },

  async getCurrentRoute(): Promise<AudioRoute> {
    const b = bridge();
    if (b?.getAudioRoute) {
      try { const r = await b.getAudioRoute(); return (r?.route as AudioRoute) ?? "earpiece"; } catch {}
    }
    return "earpiece";
  },
};
