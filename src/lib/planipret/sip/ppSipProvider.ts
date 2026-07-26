// Planipret mobile — dedicated JsSIP UA bound to the NS-API PBX.
//
// This is intentionally independent from the Lemtel `sipProvider` in
// `@/lib/softphone/jssipProvider` so /mplanipret talks only to the NS-API
// (NetSapiens) telephony backend. It re-uses the JsSIP browser library and
// wires the same media pipeline: NC-aware getUserMedia, RTCPeerConnection
// stats sampling, and ICE-restart support for Wi-Fi ↔ LTE handover.

import JsSIP from "jssip";

// Détection plateforme iOS native (Capacitor)
// Sur iOS natif, JsSIP ne doit PAS ouvrir de WebSocket SIP en parallèle avec
// le plugin natif PpSipKeepAlive — NS ne supporte qu'une seule connexion
// WebSocket par device et ferme la connexion native (code 1001) sinon.
function isIosNative(): boolean {
  try {
    const cap = (typeof window !== "undefined") ? (window as any).Capacitor : null;
    return !!cap?.isNativePlatform?.() && cap?.getPlatform?.() === "ios";
  } catch { return false; }
}

export type PpSipStatus = "idle" | "connecting" | "connected" | "registered" | "disconnected" | "error";
export type PpCallState = "idle" | "ringing-out" | "ringing-in" | "active" | "held" | "ended";

export interface PpSipConfig {
  extension: string;
  sipUsername: string;
  sipDomain: string;
  sipProxy?: string;
  wssUrl: string;
  wssUrls?: string[];
  password: string;
  displayName?: string;
}

export interface PpSipSnapshot {
  status: PpSipStatus;
  callState: PpCallState;
  remoteIdentity: string;
  remoteNumber: string;
  direction: "in" | "out" | null;
  callId: string;
  muted: boolean;
  onHold: boolean;
  startedAt: number | null;
  errorCause?: string;
  lastRegistrationAt: number | null;
}


export interface PpSipEvent {
  time: number;
  level: "info" | "warn" | "error";
  event: string;
  detail?: string;
}

type Listener = (s: PpSipSnapshot) => void;
type EventsListener = (e: PpSipEvent[]) => void;

let sipParserGuardInstalled = false;

function isKnownJsSipParserCrash(value: unknown): boolean {
  const text = String(value instanceof Error ? value.message : value ?? "");
  return /multi_header\.length|multi_header/i.test(text);
}

function installSipParserGuard() {
  if (sipParserGuardInstalled || typeof window === "undefined") return;
  sipParserGuardInstalled = true;
  window.addEventListener("error", (event) => {
    if (!isKnownJsSipParserCrash(event.message) && !isKnownJsSipParserCrash((event as any).error)) return;
    console.warn("[pp-sip] ignored malformed SIP parser frame", event.message);
    event.preventDefault();
  });
  window.addEventListener("unhandledrejection", (event) => {
    if (!isKnownJsSipParserCrash(event.reason)) return;
    console.warn("[pp-sip] ignored malformed SIP parser rejection", event.reason);
    event.preventDefault();
  });
}

class PpSipProvider {
  private ua: any = null;
  private session: any = null;
  private cfg: PpSipConfig | null = null;
  private listeners = new Set<Listener>();
  private eventListeners = new Set<EventsListener>();
  private events: PpSipEvent[] = [];
  private snap: PpSipSnapshot = {
    status: "idle",
    callState: "idle",
    remoteIdentity: "",
    remoteNumber: "",
    direction: null,
    callId: "",
    muted: false,
    onHold: false,
    startedAt: null,
    lastRegistrationAt: null,
  };

  audioEl: HTMLAudioElement | null = null;
  private lastSig = "";
  private lastStartAt = 0;
  private connectingSince = 0;
  private regRetryTimer: ReturnType<typeof setTimeout> | null = null;
  private regFailures = 0;

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    fn(this.snap);
    return () => { this.listeners.delete(fn); };
  }
  getSnapshot(): PpSipSnapshot { return this.snap; }
  getConfig(): PpSipConfig | null { return this.cfg; }

  getEvents(): PpSipEvent[] { return this.events; }
  subscribeEvents(fn: EventsListener): () => void {
    this.eventListeners.add(fn);
    fn(this.events);
    return () => { this.eventListeners.delete(fn); };
  }
  clearEvents() {
    this.events = [];
    this.eventListeners.forEach((l) => { try { l(this.events); } catch {} });
  }

  private update(patch: Partial<PpSipSnapshot>) {
    this.snap = { ...this.snap, ...patch };
    this.listeners.forEach((l) => { try { l(this.snap); } catch {} });
  }

  private log(level: "info" | "warn" | "error", msg: string, detail?: any) {
    const fn = level === "error" ? "error" : level === "warn" ? "warn" : "log";
    // eslint-disable-next-line no-console
    (console as any)[fn](`[pp-sip] ${msg}`, detail ?? "");
    const detailStr = detail === undefined || detail === null || detail === ""
      ? undefined
      : typeof detail === "string" ? detail : (() => { try { return JSON.stringify(detail); } catch { return String(detail); } })();
    this.events = [...this.events, { time: Date.now(), level, event: msg, detail: detailStr }].slice(-200);
    this.eventListeners.forEach((l) => { try { l(this.events); } catch {} });
  }

  // Indique si JsSIP est en mode "call-only" (iOS natif): pas de WS permanent,
  // JsSIP s'active uniquement pour les appels entrants/sortants.
  private iosCallOnlyMode = false;

  async init(cfg: PpSipConfig) {
    installSipParserGuard();
    const wssUrl = String(cfg.wssUrl ?? "").trim();
    if (!cfg.extension || !cfg.sipDomain || !wssUrl || wssUrl === "undefined" || !/^wss?:\/\//i.test(wssUrl) || !cfg.password) {
      this.update({ status: "error", errorCause: "invalid_config" });
      return;
    }

    // Sur iOS natif: le plugin PpSipKeepAlive gère l'enregistrement SIP.
    // JsSIP ne doit PAS ouvrir de WebSocket SIP en parallèle — NS ferme
    // la connexion native (code 1001) dès que JsSIP ouvre la sienne.
    // On stocke la config et on met le statut à "registered" (le plugin natif
    // est enregistré), mais on ne démarre pas JsSIP maintenant.
    if (isIosNative()) {
      this.iosCallOnlyMode = true;
      this.cfg = { ...cfg, wssUrl };
      this.lastSig = `${cfg.extension}|${cfg.sipDomain}|${wssUrl}|${cfg.password}`;
      // Marquer comme "registered" pour que le watchdog ne force pas de reconnexion
      this.update({ status: "registered", errorCause: undefined, lastRegistrationAt: Date.now() });
      return;
    }
    const cleanCfg = { ...cfg, wssUrl };
    const sig = `${cleanCfg.extension}|${cleanCfg.sipDomain}|${cleanCfg.wssUrl}|${cleanCfg.password}`;
    if (this.ua && sig === this.lastSig && (this.snap.status === "registered" || this.snap.status === "connected")) {
      return;
    }
    // Never tear down a UA that is still in its initial connect/REGISTER
    // handshake — doing so closed the WebSocket (code 1001) before NetSapiens
    // could answer, which surfaced as an endless "registration failed:
    // Connection Error" loop on iOS.
    if (this.ua && sig === this.lastSig) {
      const busyConnecting = this.snap.status === "connecting" && Date.now() - this.connectingSince < 20_000;
      const tooSoon = Date.now() - this.lastStartAt < 15_000;
      if (busyConnecting || tooSoon) {
        try { this.ua.register(); } catch {}
        return;
      }
    }
    if (this.ua) this.stop();
    this.cfg = cleanCfg;
    this.lastSig = sig;
    this.connectingSince = Date.now();
    this.lastStartAt = Date.now();
    this.regFailures = 0;
    this.update({ status: "connecting", errorCause: undefined });

    try {
      const urls = Array.from(new Set([cleanCfg.wssUrl, ...(cleanCfg.wssUrls || [])]
        .map((u) => String(u ?? "").trim())
        .filter((u) => /^wss?:\/\//i.test(u)))) as string[];
      if (!urls.length) throw new Error("No valid SIP WSS URL");
      const sockets = urls.map((u) => new (JsSIP as any).WebSocketInterface(u));
      const ua = new (JsSIP as any).UA({
        sockets,
        uri: `sip:${cleanCfg.sipUsername}@${cleanCfg.sipDomain}`,
        password: cleanCfg.password,
        authorization_user: cleanCfg.sipUsername,
        realm: cleanCfg.sipDomain,
        // contact_uri intentionally omitted — JsSIP auto-generates a routable
        // contact with the real WebSocket IP:port so NetSapiens can deliver
        // incoming INVITEs. A hardcoded domain-based contact_uri causes NS to
        // register the device but fail to route calls → immediate voicemail.
        //
        // use_preloaded_route: true — CRITICAL for iOS WebKit:
        // On iOS, JsSIP cannot determine the real IP of the WebSocket from the
        // WKWebView sandbox, so it generates a contact like:
        //   sip:random@1ifhb6v6fhq2.invalid;transport=ws
        // NetSapiens cannot route INVITEs to a .invalid address.
        // With use_preloaded_route=true, JsSIP adds a Route header pointing to
        // the established WebSocket (sip:core1.cluster1.ucstack.io:9002;transport=ws;lr)
        // in every outgoing request. NS then routes INVITEs back via that same
        // WebSocket path, bypassing the unroutable .invalid contact entirely.
        use_preloaded_route: true,
        register: true,
        session_timers: false,
        // Match the native keep-alive REGISTER expiry so NetSapiens does not
        // expire one contact while the other still shows "registered" locally.
        register_expires: 1800,
        connection_recovery_min_interval: 2,
        connection_recovery_max_interval: 30,
        user_agent: "Planipret Softphone 1.0",
      });

      ua.on("connecting", () => { this.connectingSince = Date.now(); this.update({ status: "connecting" }); });
      ua.on("connected", () => this.update({ status: "connected" }));
      ua.on("disconnected", (e: any) => {
        this.log("warn", "ws disconnected", e);
        this.update({ status: "disconnected", errorCause: e?.reason || "ws_disconnected" });
        // JsSIP retries the socket via connection_recovery_*; no manual work needed.
      });
      ua.on("registered", () => {
        this.regFailures = 0;
        if (this.regRetryTimer) { clearTimeout(this.regRetryTimer); this.regRetryTimer = null; }
        return this.update({ status: "registered", errorCause: undefined, lastRegistrationAt: Date.now() });
      });
      ua.on("unregistered", () => {
        this.log("warn", "unregistered - forcing re-register");
        this.update({ status: "connected", errorCause: "re_registering" });
        // NetSapiens sometimes returns 401/403 mid-session on stale nonce;
        // trigger an immediate re-REGISTER instead of leaving the UA idle.
        setTimeout(() => { try { this.ua?.register(); } catch {} }, 1500);
      });
      ua.on("registrationFailed", (e: any) => {
        const cause = e?.cause || e?.response?.reason_phrase || "registration_failed";
        this.log("error", `registration failed: ${cause}`);
        this.update({ status: "error", errorCause: cause });
        // Retry with exponential backoff and a single pending timer — stacking
        // retries hammered NetSapiens and kept the socket in a failed state.
        this.regFailures = Math.min(this.regFailures + 1, 6);
        if (this.regRetryTimer) clearTimeout(this.regRetryTimer);
        this.regRetryTimer = setTimeout(() => {
          this.regRetryTimer = null;
          try { this.ua?.register(); } catch {}
        }, Math.min(60_000, 5_000 * this.regFailures));
      });
      ua.on("newRTCSession", (e: any) => this.attachSession(e.session, e.originator));

      ua.start();
      this.ua = ua;
    } catch (err: any) {
      const msg = String(err?.message || err);
      this.log("error", `UA init failed: ${msg}`);
      this.update({ status: "error", errorCause: msg });
    }
  }

  private attachSession(session: any, originator: string) {
    this.session = session;
    const incoming = originator === "remote";
    const remoteUri = session.remote_identity?.uri?.user || "";
    const remoteName = session.remote_identity?.display_name || remoteUri;
    // SIP Call-ID is the shared identifier between mobile and widget for the
    // same call — used to coordinate collision handling via Supabase.
    const callId: string = session?.request?.call_id
      || session?.request?.getHeader?.("Call-ID")
      || session?.id
      || "";
    this.update({
      callState: incoming ? "ringing-in" : "ringing-out",
      remoteIdentity: remoteName,
      remoteNumber: remoteUri,
      direction: incoming ? "in" : "out",
      callId,
      muted: false,
      onHold: false,
    });

    session.on("progress", () => { if (!incoming) this.update({ callState: "ringing-out" }); });
    session.on("confirmed", () => this.update({ callState: "active", startedAt: Date.now() }));
    session.on("failed", (e: any) => {
      this.update({ callState: "ended", errorCause: e?.cause || "failed" });
      setTimeout(() => this.resetCall(), 2000);
    });
    session.on("ended", () => {
      this.update({ callState: "ended" });
      setTimeout(() => this.resetCall(), 2000);
    });
    session.on("hold", () => this.update({ onHold: true, callState: "held" }));
    session.on("unhold", () => this.update({ onHold: false, callState: "active" }));
    session.on("muted", () => this.update({ muted: true }));
    session.on("unmuted", () => this.update({ muted: false }));

    const pc: RTCPeerConnection | undefined = session.connection;
    if (pc) {
      pc.addEventListener("track", (ev: any) => {
        if (this.audioEl && ev.streams[0]) {
          this.audioEl.srcObject = ev.streams[0];
          this.audioEl.play().catch(() => {});
        }
      });
    }
  }

  private resetCall() {
    this.session = null;
    this.update({
      callState: "idle",
      remoteIdentity: "",
      remoteNumber: "",
      direction: null,
      callId: "",
      startedAt: null,
      muted: false,
      onHold: false,
    });
  }


  // Active JsSIP pour un appel sortant sur iOS (mode call-only).
  // Ouvre le WS, attend l'enregistrement, puis passe l'appel.
  private async activateForCall(): Promise<void> {
    if (!this.iosCallOnlyMode || !this.cfg) return;
    if (this.ua && (this.snap.status === "registered" || this.snap.status === "connected")) return;
    // Démarrer JsSIP normalement (le plugin natif sera temporairement en compétition
    // mais JsSIP a besoin du WS pour l'INVITE/ICE)
    const cfg = this.cfg;
    const wssUrl = cfg.wssUrl;
    const sig = `${cfg.extension}|${cfg.sipDomain}|${wssUrl}|${cfg.password}`;
    this.lastSig = sig;
    this.connectingSince = Date.now();
    this.lastStartAt = Date.now();
    this.regFailures = 0;
    this.update({ status: "connecting", errorCause: undefined });
    try {
      const urls = Array.from(new Set([wssUrl, ...(cfg.wssUrls || [])]
        .map((u) => String(u ?? "").trim())
        .filter((u) => /^wss?:\/\//i.test(u)))) as string[];
      const sockets = urls.map((u) => new (JsSIP as any).WebSocketInterface(u));
      const ua = new (JsSIP as any).UA({
        sockets,
        uri: `sip:${cfg.sipUsername}@${cfg.sipDomain}`,
        password: cfg.password,
        authorization_user: cfg.sipUsername,
        realm: cfg.sipDomain,
        use_preloaded_route: true,
        register: true,
        session_timers: false,
        register_expires: 60, // courte durée pour les appels
        connection_recovery_min_interval: 2,
        connection_recovery_max_interval: 10,
        user_agent: "Planipret Softphone 1.0",
      });
      ua.on("connecting", () => { this.connectingSince = Date.now(); this.update({ status: "connecting" }); });
      ua.on("connected", () => this.update({ status: "connected" }));
      ua.on("disconnected", (e: any) => { this.log("warn", "ws disconnected", e); this.update({ status: "disconnected" }); });
      ua.on("registered", () => { this.regFailures = 0; this.update({ status: "registered", errorCause: undefined, lastRegistrationAt: Date.now() }); });
      ua.on("unregistered", () => { this.log("warn", "unregistered"); });
      ua.on("registrationFailed", (e: any) => { this.log("error", `registration failed: ${e?.cause || "?"}`); this.update({ status: "error" }); });
      ua.on("newRTCSession", (e: any) => this.attachSession(e.session, e.originator));
      ua.start();
      this.ua = ua;
      // Attendre l'enregistrement (max 8s)
      await new Promise<void>((resolve) => {
        const t = setTimeout(() => resolve(), 8000);
        const unsub = this.subscribe((s) => {
          if (s.status === "registered" || s.status === "connected") {
            clearTimeout(t); unsub(); resolve();
          }
        });
      });
    } catch (err: any) {
      this.log("error", `activateForCall failed: ${err?.message || err}`);
      this.update({ status: "error", errorCause: String(err?.message || err) });
    }
  }

  async call(number: string) {
    if (!this.cfg) throw new Error("softphone_not_registered");
    // Sur iOS natif: activer JsSIP à la demande pour l'appel sortant
    if (this.iosCallOnlyMode) await this.activateForCall();
    if (!this.ua) throw new Error("softphone_not_registered");
    this.update({ callState: "ringing-out", remoteIdentity: number, remoteNumber: number, direction: "out", errorCause: undefined });
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        video: false,
      });
      const target = `sip:${number}@${this.cfg.sipDomain}`;
      const session = this.ua.call(target, {
        mediaStream,
        mediaConstraints: { audio: true, video: false },
        rtcOfferConstraints: { offerToReceiveAudio: true, offerToReceiveVideo: false },
      });
      if (!session) throw new Error("call_session_not_created");
    } catch (err: any) {
      const msg = String(err?.message || err);
      this.log("error", `call failed: ${msg}`);
      this.update({ callState: "ended", errorCause: msg });
      setTimeout(() => this.resetCall(), 1500);
      throw err;
    }
  }

  answer() {
    if (!this.session) return;
    this.session.answer({
      mediaConstraints: { audio: true, video: false },
      rtcAnswerConstraints: { offerToReceiveAudio: true, offerToReceiveVideo: false },
    });
  }
  hangup() { try { this.session?.terminate(); } catch {} }
  mute() { this.session?.mute({ audio: true }); }
  unmute() { this.session?.unmute({ audio: true }); }
  hold() { this.session?.hold(); }
  unhold() { this.session?.unhold(); }
  sendDTMF(k: string) { this.session?.sendDTMF(k, { duration: 100, interToneGap: 70 }); }
  transfer(target: string) {
    if (!this.session || !this.cfg) return;
    this.session.refer(`sip:${target}@${this.cfg.sipDomain}`);
  }

  // ---- Quality/handover helpers used by the audio & network modules ----
  getActivePeerConnection(): RTCPeerConnection | null {
    return (this.session as any)?.connection ?? null;
  }
  hasActiveCall(): boolean {
    return !!this.session && (this.snap.callState === "active" || this.snap.callState === "held");
  }
  async iceRestart(): Promise<boolean> {
    const s = this.session;
    if (!s) return false;
    try {
      if (typeof s.renegotiate === "function") {
        s.renegotiate({ rtcOfferConstraints: { iceRestart: true } });
        return true;
      }
      const pc: RTCPeerConnection | undefined = s.connection;
      if (pc && typeof pc.restartIce === "function") { pc.restartIce(); return true; }
    } catch (e: any) {
      this.log("error", `ice restart failed: ${e?.message || e}`);
    }
    return false;
  }
  async forceReregister() {
    try {
      // Sur iOS natif: le plugin PpSipKeepAlive gère le re-register
      // Ne pas interférer avec le WS natif
      if (this.iosCallOnlyMode) {
        // Mettre à jour lastRegistrationAt pour que le watchdog reste calme
        this.update({ status: "registered", errorCause: undefined, lastRegistrationAt: Date.now() });
        return;
      }
      if (!this.ua) return;
      // Never interrupt a connecting handshake — that was the cause of the
      // endless "ws disconnected code:1001 → registration failed: Connection Error" loop.
      if (this.snap.status === "connecting" && Date.now() - this.connectingSince < 20_000) return;
      // Simply send a fresh REGISTER. JsSIP will include the current WebSocket
      // IP:port in the Contact header automatically, so NetSapiens will update
      // its routing table without needing unregister({all:true}).
      // NOTE: unregister({all:true}) was intentionally removed — it closes the
      // WebSocket mid-handshake and causes code:1001 → Connection Error loops.
      try { this.ua.register(); } catch {}
    } catch {}
  }

  stop() {
    if (this.regRetryTimer) { clearTimeout(this.regRetryTimer); this.regRetryTimer = null; }
    try { this.ua?.stop(); } catch {}
    this.ua = null;
    this.session = null;
    this.iosCallOnlyMode = false;
    this.update({ status: "disconnected", callState: "idle", direction: null, startedAt: null });
  }

  // Appelé par le plugin natif quand un INVITE entrant arrive via PushKit.
  // Active JsSIP pour recevoir l'appel.
  async activateForIncomingCall(): Promise<void> {
    if (!this.iosCallOnlyMode) return;
    await this.activateForCall();
  }
}

export const ppSipProvider = new PpSipProvider();
