// Phase 4.1 — Audio output router for /mplanipret.
// Uses the Capacitor SIP plugin when available (same bridge as Lemtel) and
// falls back to no-ops in the web preview.

export type AudioRoute = "earpiece" | "speaker" | "bluetooth";

function bridge(): any {
  const plugins = (window as any)?.Capacitor?.Plugins;
  return plugins?.PpSipKeepAlive ?? plugins?.CapacitorSip ?? null;
}

let currentRoute: AudioRoute = "earpiece";

export const audioRouter = {
  async setRoute(route: AudioRoute): Promise<void> {
    currentRoute = route;
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
      try {
        const r = await b.getAudioRoute();
        if (r?.route) { currentRoute = r.route as AudioRoute; return currentRoute; }
      } catch {}
    }
    return currentRoute;
  },

  /**
   * Called when a call becomes active. iOS/Android WebRTC in a WebView defaults
   * to the loudspeaker; a phone call must start on the earpiece (or a connected
   * Bluetooth headset) until the user taps the speaker button.
   */
  async startCallAudio(): Promise<AudioRoute> {
    const route: AudioRoute = currentRoute === "bluetooth" ? "bluetooth" : "earpiece";
    currentRoute = route;
    await audioRouter.setRoute(route);
    // Some stacks (CallKit / AudioFocus) re-apply their own route ~1s after the
    // media session activates, so re-assert once.
    setTimeout(() => { void audioRouter.setRoute(route); }, 1200);
    return route;
  },
};
