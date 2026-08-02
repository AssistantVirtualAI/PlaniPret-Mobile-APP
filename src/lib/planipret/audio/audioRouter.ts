// Phase 4.1 — Audio output router for /mplanipret.
// Uses the Capacitor SIP plugin when available (same bridge as Lemtel) and
// falls back to no-ops in the web preview.

export type AudioRoute = "earpiece" | "speaker" | "bluetooth";

function bridge(): any {
  const plugins = (window as any)?.Capacitor?.Plugins;
  return plugins?.PpSipKeepAlive ?? plugins?.CapacitorSip ?? null;
}

let currentRoute: AudioRoute = "earpiece";
let reassertTimer: ReturnType<typeof setTimeout> | null = null;
let routeGeneration = 0;

/**
 * ring11 - the route we last successfully pushed across the native bridge.
 * Distinct from `currentRoute`, which is the route the UI *wants*.
 */
let appliedRoute: AudioRoute | null = null;

export const audioRouter = {
  async setRoute(route: AudioRoute, opts: { force?: boolean } = {}): Promise<void> {
    routeGeneration += 1;
    if (reassertTimer) { clearTimeout(reassertTimer); reassertTimer = null; }
    currentRoute = route;
    // ring11 - skip the bridge when the route is already applied. Each native
    // setAudioRoute re-runs overrideOutputAudioPort, and on iOS that perturbs a
    // live WebRTC render. The ring10 log shows 5 of them on a single call
    // (mount effect + 1200ms re-assert + call-state re-renders).
    if (!opts.force && appliedRoute === route) return;
    const b = bridge();
    if (b?.setAudioRoute) {
      try { await b.setAudioRoute({ route }); appliedRoute = route; return; } catch {}
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
    const generation = routeGeneration;
    reassertTimer = setTimeout(() => {
      reassertTimer = null;
      if (generation !== routeGeneration) return;
      // ring11 - this single re-assert is legitimate (CallKit may steal the route
      // ~1s after the media session activates), so it bypasses the de-dup. It is
      // now the ONLY forced re-assert during a call.
      void audioRouter.setRoute(route, { force: true });
    }, 1200);
    return route;
  },

  stopCallAudio(): void {
    routeGeneration += 1;
    if (reassertTimer) { clearTimeout(reassertTimer); reassertTimer = null; }
    // ring11 - the next call must be able to assert its route from scratch.
    appliedRoute = null;
  },
};
