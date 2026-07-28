// Phase 4.1 — Audio output router for /mplanipret.
// Uses the Capacitor SIP plugin when available (same bridge as Lemtel) and
// falls back to no-ops in the web preview.

export type AudioRoute = "earpiece" | "speaker" | "bluetooth";

function bridge(): any {
  // PpSipKeepAlive is the native Capacitor plugin that exposes setAudioRoute/getAudioRoute.
  // CapacitorSip does not exist in this project — using PpSipKeepAlive instead.
  return (window as any)?.Capacitor?.Plugins?.PpSipKeepAlive ?? null;
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
