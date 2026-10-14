// Phase 4.1 — Audio output router for /mplanipret.
// Uses the Capacitor SIP plugin when available (same bridge as Lemtel) and
// falls back to no-ops in the web preview.

import { nativeOwnsAor } from "../sip/aorArbitration";

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
// Route explicitly chosen by the user for the current call (null = automatic).
let userRoute: AudioRoute | null = null;
let callKitBound = false;
let enforceTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * iOS CallKit: a speaker tap made before `didActivate` is only memorised by
 * the native layer and was never re-applied, and CallKit can restore the
 * earpiece right after activation. Re-send the user's choice once the audio
 * session is live, and keep checking for a few seconds until iOS reports it.
 */
function enforceUserRoute(attempts = 8) {
  if (enforceTimer) { clearTimeout(enforceTimer); enforceTimer = null; }
  const wanted = userRoute;
  if (!wanted) return;
  const b = bridge();
  if (!b?.setAudioRoute) return;
  const generation = routeGeneration;
  const step = async (left: number) => {
    enforceTimer = null;
    if (generation !== routeGeneration || userRoute !== wanted) return;
    try { await b.setAudioRoute({ route: wanted }); } catch { /* ignore */ }
    await pause(250);
    const d = await audioRouter.refreshDevices();
    if (d.route === wanted || left <= 0) return;
    enforceTimer = setTimeout(() => { void step(left - 1); }, 500);
  };
  void step(attempts);
}

function bindCallKitActivation() {
  if (callKitBound || typeof window === "undefined") return;
  callKitBound = true;
  window.addEventListener("pp:callkit-audio-active", () => {
    // Laisser CallKit/PJSIP terminer l'ouverture du périphérique.
    setTimeout(() => enforceUserRoute(), 200);
  });
}

const pause = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

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

  /**
   * Ask the native owner for an audio route and return the route that iOS
   * actually applied. A successful Capacitor callback is not proof that
   * CallKit has accepted the override: it can restore its own route just
   * after activation. Keeping the physical route here prevents the call UI
   * from displaying “haut-parleur” while sound is still in the earpiece.
   */
  async setRoute(route: AudioRoute): Promise<AudioDevices> {
    bindCallKitActivation();
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
    // PpSipKeepAlive is the single owner of the audio session. Only fall back
    // to the PJSIP speaker toggle when that plugin is unavailable — calling
    // both made the two modules fight (quiet/muffled loudspeaker) and mapped
    // "bluetooth" to "earpiece".
    if (handled) {
      // CallKit/PJSIP may rewrite the route shortly after activation. Verify
      // twice before using the PJSIP compatibility path, then report the
      // actual route rather than an optimistic requested one.
      const generation = routeGeneration;
      let applied = await audioRouter.refreshDevices();
      if (generation === routeGeneration && applied.route !== route) {
        await pause(220);
        try { await b.setAudioRoute({ route }); } catch {}
        await pause(220);
        applied = await audioRouter.refreshDevices();
      }
      if (generation === routeGeneration && applied.route !== route) {
        const p = pjsip();
        if (p?.setSpeaker) {
          try { await p.setSpeaker({ enabled: route === "speaker" }); } catch {}
          await pause(260);
          applied = await audioRouter.refreshDevices();
        }
      }
      return applied;
    }
    {
      const p = pjsip();
      if (p?.setSpeaker) {
        try { await p.setSpeaker({ enabled: route === "speaker" }); handled = true; } catch {}
      }
    }

    if (handled) return audioRouter.refreshDevices();
    // Web fallback: try matching sinkId on every <audio> tag.
    try {
      document.querySelectorAll("audio").forEach((el: any) => {
        if (typeof el.setSinkId === "function") {
          el.setSinkId(route === "speaker" ? "default" : "").catch(() => {});
        }
      });
    } catch {}
    return audioRouter.refreshDevices();
  },

  /** User tap on speaker / earpiece / Bluetooth: remembered for the call and
   *  re-applied when CallKit activates or restores its own route. */
  async chooseRoute(route: AudioRoute): Promise<AudioDevices> {
    userRoute = route;
    let applied = await audioRouter.setRoute(route);
    if (applied.route !== route && nativeOwnsAor()) {
      enforceUserRoute();
      await pause(900);
      applied = await audioRouter.refreshDevices();
    }
    return applied;
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
  /**
   * Full audio-session reset. Called when a call is answered: the ringing /
   * media session left behind by CallKit or the WebView is half-configured and
   * the remote party ends up hearing nothing. The native plugin deactivates and
   * re-activates AVAudioSession in voiceChat mode, then re-applies the route.
   */
  async resetSession(): Promise<void> {
    // PJSIP ouvre RemoteIO après CXProvider.didActivate. Une désactivation ou
    // réactivation WebView ensuite retire l'entrée/sortie de l'appel natif et
    // explique les appels connectés mais silencieux. Le moteur natif garde
    // donc l'entière propriété de sa session CallKit.
    if (nativeOwnsAor()) {
      await audioRouter.refreshDevices();
      return;
    }
    const b = bridge();
    if (b?.resetAudioSession) {
      try { await b.resetAudioSession(); } catch {}
    }
    await audioRouter.refreshDevices();
  },

  async startCallAudio(): Promise<AudioRoute> {
    bindNativeEvents();
    bindCallKitActivation();
    // Sur iOS PJSIP/CallKit, ne pas rejouer les deux resets et les réassertions
    // de route prévus pour WebRTC. CallKit active le média et PJSIP raccorde
    // RTP <-> périphérique dans son callback didActivate.
    if (nativeOwnsAor()) {
      const d = await audioRouter.refreshDevices();
      currentRoute = d.route;
      return d.route;
    }
    await audioRouter.resetSession();
    const d = await audioRouter.refreshDevices();
    // Auto-detect: a connected Bluetooth headset always wins at call start.
    const route: AudioRoute = d.bluetooth ? "bluetooth" : "earpiece";
    currentRoute = route;
    const applied = await audioRouter.setRoute(route);
    // Some stacks (CallKit / AudioFocus) re-apply their own route ~1s after the

    // media session activates, so re-assert once — but never overwrite a change
    // the user made in the meantime (tap on « haut-parleur »).
    const generation = routeGeneration;
    reassertTimer = setTimeout(() => {
      reassertTimer = null;
      if (generation !== routeGeneration) return;
      void audioRouter.setRoute(currentRoute);
    }, 1200);
    // Second reset pass: NetSapiens/PJSIP can renegotiate media ~2.5 s after
    // answer, which silences the far end if the session was not re-armed.
    setTimeout(() => {
      if (generation !== routeGeneration) return;
      void audioRouter.resetSession().then(() => audioRouter.setRoute(currentRoute));
    }, 2500);

    return applied.route;
  },

  stopCallAudio(): void {
    routeGeneration += 1;
    userRoute = null;
    if (enforceTimer) { clearTimeout(enforceTimer); enforceTimer = null; }
    if (reassertTimer) { clearTimeout(reassertTimer); reassertTimer = null; }
  },
};
