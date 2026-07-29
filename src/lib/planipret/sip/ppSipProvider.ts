// Planipret mobile — dedicated JsSIP UA bound to the NS-API PBX.
//
// This is intentionally independent from the Lemtel `sipProvider` in
// `@/lib/softphone/jssipProvider` so /mplanipret talks only to the NS-API
// (NetSapiens) telephony backend. It re-uses the JsSIP browser library and
// wires the same media pipeline: NC-aware getUserMedia, RTCPeerConnection
// stats sampling, and ICE-restart support for Wi-Fi ↔ LTE handover.

import JsSIP from "jssip";
import { getPpSipReconnectConfig, ppSipBackoffDelay } from "./ppSipReconnectConfig";

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


type Listener = (s: PpSipSnapshot) => void;

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

export interface PpSipEvent {
  time: number;
  level: "info" | "warn" | "error";
  event: string;
  detail?: string;
}

type EventsListener = (e: PpSipEvent[]) => void;

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
  private keepAliveTimer: ReturnType<typeof setInterval> | null = null;
  private regFailures = 0;
  private wsRetryTimer: ReturnType<typeof setTimeout> | null = null;
  private wsFailures = 0;
  private netWatchInstalled = false;

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
  }

  async init(cfg: PpSipConfig) {
    installSipParserGuard();
    const wssUrl = String(cfg.wssUrl ?? "").trim();
    if (!cfg.extension || !cfg.sipDomain || !wssUrl || wssUrl === "undefined" || !/^wss?:\/\//i.test(wssUrl) || !cfg.password) {
      this.update({ status: "error", errorCause: "invalid_config" });
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
        register: true,
        session_timers: false,
        // Match the native keep-alive REGISTER expiry so NetSapiens does not
        // expire one contact while the other still shows "registered" locally.
        register_expires: getPpSipReconnectConfig().registerExpiresSec,
        connection_recovery_min_interval: Math.max(1, Math.round(getPpSipReconnectConfig().socketBackoffMinMs / 1000)),
        connection_recovery_max_interval: Math.max(2, Math.round(getPpSipReconnectConfig().socketBackoffMaxMs / 1000)),
        user_agent: "Planipret Softphone 1.0",
      });

      ua.on("connecting", () => { this.connectingSince = Date.now(); this.update({ status: "connecting" }); });
      ua.on("connected", () => {
        this.wsFailures = 0;
        if (this.wsRetryTimer) { clearTimeout(this.wsRetryTimer); this.wsRetryTimer = null; }
        this.startKeepAlive();
        this.update({ status: "connected" });
      });
      ua.on("disconnected", (e: any) => {
        this.log("warn", "ws disconnected", e);
        this.stopKeepAlive();
        this.update({ status: "disconnected", errorCause: e?.reason || "ws_disconnected" });
        // JsSIP retries the socket via connection_recovery_*, but on mobile the
        // OS often kills the socket while the recovery timer is suspended, so we
        // drive our own exponential-backoff reconnect + re-REGISTER loop.
        this.scheduleSocketReconnect(String(e?.reason || "ws_disconnected"));
      });
      ua.on("registered", () => {
        this.regFailures = 0;
        this.wsFailures = 0;
        if (this.wsRetryTimer) { clearTimeout(this.wsRetryTimer); this.wsRetryTimer = null; }
        this.startKeepAlive();
        if (this.regRetryTimer) { clearTimeout(this.regRetryTimer); this.regRetryTimer = null; }
        return this.update({ status: "registered", errorCause: undefined, lastRegistrationAt: Date.now() });
      });
      ua.on("unregistered", () => {
        this.log("warn", "unregistered - forcing re-register");
        this.update({ status: "connected", errorCause: "re_registering" });
        // NetSapiens sometimes returns 401/403 mid-session on stale nonce;
        // trigger an immediate re-REGISTER instead of leaving the UA idle.
        setTimeout(() => { try { this.ua?.register(); } catch {} }, getPpSipReconnectConfig().reRegisterDelayMs);
      });
      ua.on("registrationFailed", (e: any) => {
        const cause = e?.cause || e?.response?.reason_phrase || "registration_failed";
        this.log("error", `registration failed: ${cause}`);
        this.update({ status: "error", errorCause: cause });
        // Retry with exponential backoff and a single pending timer — stacking
        // retries hammered NetSapiens and kept the socket in a failed state.
        const rc = getPpSipReconnectConfig();
        this.regFailures = Math.min(this.regFailures + 1, rc.socketBackoffMaxAttempts);
        if (this.regRetryTimer) clearTimeout(this.regRetryTimer);
        this.regRetryTimer = setTimeout(() => {
          this.regRetryTimer = null;
          try { this.ua?.register(); } catch {}
        }, Math.min(rc.registerRetryMaxMs, rc.registerRetryBaseMs * this.regFailures));
      });
      ua.on("newRTCSession", (e: any) => this.attachSession(e.session, e.originator));

      ua.start();
      this.ua = ua;
      this.installNetworkWatch();
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

    // If the user tapped "Répondre" on the native background notification
    // before JsSIP had a chance to receive the INVITE, auto-answer as soon as
    // the session arrives (within a 30s intent window).
    if (incoming) {
      try {
        const pending = (typeof window !== "undefined") ? (window as any).__ppPendingAnswer : null;
        if (pending && (Date.now() - (pending.ts || 0)) < 30_000) {
          (window as any).__ppPendingAnswer = null;
          setTimeout(() => { try { this.answer(); } catch {} }, 250);
        }
      } catch {}
    }


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


  async call(number: string) {
    if (!this.cfg || !this.ua) throw new Error("softphone_not_registered");
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
      if (!this.ua) return;
      // Only cycle the registration when we actually hold one. Calling
      // unregister({all:true}) while the UA is still connecting aborted the
      // in-flight REGISTER and produced "Connection Error".
      if (this.snap.status === "registered") {
        // NEVER unregister({all:true}) here: it wipes EVERY contact bound to the
        // AoR — including the native background keep-alive registration — which
        // left the extension unregistered and sent inbound calls straight to
        // voicemail. A plain re-REGISTER refreshes only this contact.
        try { this.ua.register(); } catch {}
        return;
      }
      if (this.snap.status === "connecting" && Date.now() - this.connectingSince < 20_000) return;
      try { this.ua.register(); } catch {}
    } catch {}
  }

  /** Exponential-backoff reconnect: restart the socket, then re-REGISTER, and
   *  keep retrying (1s → 30s cap) until the UA reports `registered` again. */
  private scheduleSocketReconnect(reason: string) {
    if (this.wsRetryTimer) return;
    const rc = getPpSipReconnectConfig();
    this.wsFailures = Math.min(this.wsFailures + 1, rc.socketBackoffMaxAttempts);
    const delay = ppSipBackoffDelay(this.wsFailures, rc.socketBackoffMinMs, rc.socketBackoffMaxMs);
    this.log("warn", `sip reconnect scheduled in ${delay}ms (${reason})`);
    this.wsRetryTimer = setTimeout(() => {
      this.wsRetryTimer = null;
      const ua = this.ua;
      if (!ua) return;
      const online = typeof navigator === "undefined" || navigator.onLine !== false;
      if (!online) { this.log("warn", "sip reconnect deferred: offline"); this.scheduleSocketReconnect("offline"); return; }
      try {
        if (ua.isConnected?.()) { ua.register(); } else { ua.start(); }
        this.log("info", "sip reconnect attempt sent");
      } catch (e: any) {
        this.log("error", `sip reconnect failed: ${e?.message || e}`);
      }
      setTimeout(() => {
        if (this.ua && this.snap.status !== "registered") this.scheduleSocketReconnect("still_unregistered");
      }, rc.socketVerifyDelayMs);
    }, delay);
  }

  /** Reconnect immediately when the device regains connectivity. */
  private installNetworkWatch() {
    if (this.netWatchInstalled || typeof window === "undefined") return;
    this.netWatchInstalled = true;
    window.addEventListener("online", () => {
      this.log("info", "network online → sip reconnect");
      this.wsFailures = 0;
      if (this.wsRetryTimer) { clearTimeout(this.wsRetryTimer); this.wsRetryTimer = null; }
      this.scheduleSocketReconnect("network_online");
    });
    window.addEventListener("offline", () => this.log("warn", "network offline"));
  }

  /** NetSapiens closes idle WebSockets with code 1001 after ~60s.
   *  A periodic in-dialog OPTIONS ping keeps the socket alive. */
  private startKeepAlive() {
    this.stopKeepAlive();
    this.keepAliveTimer = setInterval(() => {
      const ua = this.ua;
      if (!ua) return;
      try {
        if (!ua.isConnected?.()) { try { ua.start(); } catch {} return; }
        ua.sendRequest((JsSIP as any).C.OPTIONS, `sip:${ua.configuration?.uri?.host ?? ""}`, {});
      } catch { /* ping failures are non-fatal */ }
    }, getPpSipReconnectConfig().keepAliveMs);
  }

  private stopKeepAlive() {
    if (this.keepAliveTimer) { clearInterval(this.keepAliveTimer); this.keepAliveTimer = null; }
  }

  /**
   * Background handoff: remove THIS WebView contact from NetSapiens before the
   * OS suspends the WebSocket. A suspended socket keeps a dead contact bound to
   * the extension, NS forks the inbound call to it, the fork fails instantly and
   * the caller lands in voicemail. Removing it lets the native keep-alive
   * registration (or the VoIP push) take the call instead.
   */
  async releaseForBackground(): Promise<void> {
    if (this.hasActiveCall() || this.snap.callState === "ringing-in" || this.snap.callState === "ringing-out") return;
    try { this.ua?.unregister({ all: false }); } catch { /* noop */ }
    await new Promise((r) => setTimeout(r, 250));
    this.stop();
  }

  stop() {
    this.stopKeepAlive();
    if (this.wsRetryTimer) { clearTimeout(this.wsRetryTimer); this.wsRetryTimer = null; }
    if (this.regRetryTimer) { clearTimeout(this.regRetryTimer); this.regRetryTimer = null; }
    try { this.ua?.stop(); } catch {}
    this.ua = null;
    this.session = null;
    this.update({ status: "disconnected", callState: "idle", direction: null, startedAt: null });
  }
}

export const ppSipProvider = new PpSipProvider();
