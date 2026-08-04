// Phase 4.1 — Audio output router for /mplanipret.
// Uses the Capacitor SIP plugin when available (same bridge as Lemtel) and
// falls back to no-ops in the web preview.

export type AudioRoute = "earpiece" | "speaker" | "bluetooth";

export interface AudioDevices {
  route: AudioRoute;
  bluetooth: boolean;
  bluetoothName: string;
  wired: boolean;
}

function bridge(): any {
  const plugins = (window as any)?.Capacitor?.Plugins;
  return plugins?.PpSipKeepAlive ?? plugins?.CapacitorSip ?? null;
}

function pjsip(): any {
  return (window as any)?.Capacitor?.Plugins?.PpPjsip ?? null;
}

let currentRoute: AudioRoute = "earpiece";
let devices: AudioDevices = { route: "earpiece", bluetooth: false, bluetoothName: "", wired: false };
let reassertTimer: ReturnType<typeof setTimeout> | null = null;
let routeGeneration = 0;
const listeners = new Set<(d: AudioDevices) => void>();
let bound = false;

function emit() {
  listeners.forEach((fn) => { try { fn({ ...devices }); } catch {} });
}

/** Subscribe to native route changes (headset plugged, Bluetooth connected…). */
function bindNativeEvents() {
  if (bound) return;
  const b = bridge();
  if (!b?.addListener) return;
  bound = true;
  try {
    b.addListener("audioRouteChanged", (d: any) => {
      devices = {
        route: (d?.route as AudioRoute) ?? devices.route,
        bluetooth: !!d?.bluetooth,
        bluetoothName: d?.bluetoothName ?? "",
        wired: !!d?.wired,
      };
      currentRoute = devices.route;
      emit();
    });
  } catch { bound = false; }
}

export const audioRouter = {
  subscribe(fn: (d: AudioDevices) => void) {
    bindNativeEvents();
    listeners.add(fn);
    fn({ ...devices });
    void audioRouter.refreshDevices();
    return () => { listeners.delete(fn); };
  },

  devices: () => ({ ...devices }),

  async refreshDevices(): Promise<AudioDevices> {
    const b = bridge();
    if (b?.getAudioDevices) {
      try {
        const d = await b.getAudioDevices();
        if (d?.ok !== false) {
          devices = {
            route: (d?.route as AudioRoute) ?? devices.route,
            bluetooth: !!d?.bluetooth,
            bluetoothName: d?.bluetoothName ?? "",
            wired: !!d?.wired,
          };
          currentRoute = devices.route;
          emit();
        }
      } catch {}
    }
    return { ...devices };
  },

  async setRoute(route: AudioRoute): Promise<void> {
    routeGeneration += 1;
    if (reassertTimer) { clearTimeout(reassertTimer); reassertTimer = null; }
    currentRoute = route;
    devices = { ...devices, route };
    emit();
    const b = bridge();
    let handled = false;
    if (b?.setAudioRoute) {
      try { await b.setAudioRoute({ route }); handled = true; } catch {}
    }
    // During a native PJSIP/CallKit call the engine also owns the output port.
    const p = pjsip();
    if (p?.setSpeaker) {
      try { await p.setSpeaker({ enabled: route === "speaker" }); handled = true; } catch {}
    }
    if (handled) return;
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
        if (r?.route) { currentRoute = r.route as AudioRoute; devices = { ...devices, route: currentRoute }; return currentRoute; }
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
    bindNativeEvents();
    const d = await audioRouter.refreshDevices();
    // Auto-detect: a connected Bluetooth headset always wins at call start.
    const route: AudioRoute = d.bluetooth ? "bluetooth" : "earpiece";
    currentRoute = route;
    await audioRouter.setRoute(route);
    // Some stacks (CallKit / AudioFocus) re-apply their own route ~1s after the
    // media session activates, so re-assert once.
    const generation = routeGeneration;
    reassertTimer = setTimeout(() => {
      reassertTimer = null;
      if (generation !== routeGeneration) return;
      void audioRouter.setRoute(route);
    }, 1200);
    return route;
  },

  stopCallAudio(): void {
    routeGeneration += 1;
    if (reassertTimer) { clearTimeout(reassertTimer); reassertTimer = null; }
  },
};
