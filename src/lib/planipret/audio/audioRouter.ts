// Phase 4.1 — Audio output router for /mplanipret.
// Uses the PpSipKeepAlive Capacitor plugin (setAudioRoute / getAudioRoute)
// which wraps AVAudioSession.overrideOutputAudioPort on iOS.
// Falls back to no-ops in the web preview.

export type AudioRoute = "earpiece" | "speaker" | "bluetooth";

function bridge(): any {
  // PpSipKeepAlive is the plugin that exposes setAudioRoute / getAudioRoute on iOS.
  // CapacitorSip does not exist in this project.
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
