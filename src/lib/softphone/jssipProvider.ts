// JsSIP UA lifecycle manager + event emitter.
// Used by useSoftphone hook; do not import directly into components.
import JsSIP from "jssip";
import { PC_CONFIG, instrumentPeerConnection, watchCallEstablishment, isSipDebugEnabled, sipDebug } from "./rtcConfig";

// SDP rewriter — forces audio-only PCMU/PCMA, removes DTLS/SRTP, drops video.
// Mirrors the desktop app fix that resolves FusionPBX 488 Not Acceptable Here.
function rewriteSdpForFusionPBX(sdp: string): string {
  let out = sdp;
  out = out.replace(/m=video[\s\S]*?(?=\r\nm=|$)/g, '');
  out = out.replace(/m=audio (\d+) [A-Z\/]+ [^\r\n]+/g, 'm=audio $1 RTP/AVP 0');
  out = out.replace(/^a=fingerprint:.*$/gm, '');
  out = out.replace(/^a=setup:.*$/gm, '');
  out = out.replace(/^a=dtls[-a-z]*:.*$/gm, '');
  out = out.replace(/^a=crypto:.*$/gm, '');
  out = out.replace(/^a=ice-options:.*$/gm, '');
  out = out.replace(/^a=rtpmap:(\d+) [^\r\n]+$/gm, (line, pt) =>
    pt === '0' ? line : ''
  );
  out = out.replace(/^a=fmtp:(\d+) [^\r\n]+$/gm, (line, pt) =>
    pt === '0' ? line : ''
  );
  out = out.replace(/^a=rtcp-fb:.*$/gm, '');
  out = out.replace(/^a=extmap:.*$/gm, '');
  out = out.replace(/\r?\n\r?\n+/g, '\r\n');
  return out;
}

const sdpModifier = (description: any) => {
  if (description?.sdp) {
    try { description.sdp = rewriteSdpForFusionPBX(description.sdp); }
    catch (e) { console.error('[SIP][SDP] rewrite error', e); }
  }
  return Promise.resolve(description);
};


export type SipStatus =
  | "idle"
  | "connecting"
  | "connected"
  | "registered"
  | "disconnected"
  | "error";

export type CallState =
  | "idle"
  | "ringing-out"
  | "ringing-in"
  | "active"
  | "held"
  | "ended";

export type LogLevel = "info" | "warn" | "error" | "debug";

export interface SipEvent {
  at: number;
  level: LogLevel;
  category: "sip" | "call" | "ws" | "config" | "env";
  message: string;
  detail?: any;
}

export interface SoftphoneSnapshot {
  status: SipStatus;
  callState: CallState;
  remoteIdentity: string;
  remoteNumber: string;
  errorCause?: string;
  lastCallError?: string;
  muted: boolean;
  onHold: boolean;
  direction: "in" | "out" | null;
  startedAt: number | null;
  events: SipEvent[];
  callEvents: SipEvent[];
  wssReachable: boolean | null;
  lastRegistrationAt: number | null;
  wssCheckedUrl?: string;
}

export interface SoftphoneConfig {
  extension: string;
  displayName: string;
  sipDomain: string;
  wssUrl: string;
  wssUrls?: string[];
  password: string;
  mock: boolean;
  passwordSource?: string;
  sipUri?: string;
  authUsername?: string;
}

type Listener = (snap: SoftphoneSnapshot) => void;

class JsSipProvider {
  private ua: any = null;
  private session: any = null;
  private config: SoftphoneConfig | null = null;
  private listeners = new Set<Listener>();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private mockTimers: ReturnType<typeof setTimeout>[] = [];
  private snap: SoftphoneSnapshot = {
    status: "idle",
    callState: "idle",
    remoteIdentity: "",
    remoteNumber: "",
    muted: false,
    onHold: false,
    direction: null,
    startedAt: null,
    events: [],
    lastRegistrationAt: null,
    callEvents: [],
    wssReachable: null,
  };
  audioEl: HTMLAudioElement | null = null;

  private clearMockTimers() {
    this.mockTimers.forEach((t) => clearTimeout(t));
    this.mockTimers = [];
  }

  subscribe(fn: Listener) {
    this.listeners.add(fn);
    fn(this.snap);
    return () => this.listeners.delete(fn);
  }

  private update(patch: Partial<SoftphoneSnapshot>) {
    this.snap = { ...this.snap, ...patch };
    this.listeners.forEach((l) => l(this.snap));
  }

  log(level: LogLevel, category: SipEvent["category"], message: string, detail?: any) {
    const ev: SipEvent = { at: Date.now(), level, category, message, detail };
    const events = [...this.snap.events, ev].slice(-50);
    this.update({ events });
    // Also echo to console for devtools visibility
    const fn = level === "error" ? "error" : level === "warn" ? "warn" : "log";
    // eslint-disable-next-line no-console
    (console as any)[fn](`[softphone:${category}] ${message}`, detail ?? "");
  }

  private logCall(level: LogLevel, message: string, detail?: any) {
    const ev: SipEvent = { at: Date.now(), level, category: "call", message, detail };
    const callEvents = [...this.snap.callEvents, ev].slice(-30);
    this.update({ callEvents });
    this.log(level, "call", message, detail);
  }

  getConfig() { return this.config; }
  getSnapshot() { return this.snap; }

  /** Probe a WSS URL with a short timeout; resolves true if socket opens. */
  async probeWss(url: string, timeoutMs = 5000): Promise<boolean> {
    return new Promise((resolve) => {
      let done = false;
      let ws: WebSocket | null = null;
      const finish = (ok: boolean, reason?: string) => {
        if (done) return;
        done = true;
        try { ws?.close(); } catch {}
        this.log(ok ? "info" : "error", "ws", `WSS probe ${ok ? "succeeded" : "failed"}: ${url}`, reason);
        resolve(ok);
      };
      try {
        ws = new WebSocket(url, "sip");
        ws.onopen = () => finish(true);
        ws.onerror = (e) => finish(false, "error event (CORS, mixed-content, or blocked)");
        ws.onclose = (e) => { if (!done) finish(false, `closed code=${e.code}`); };
        setTimeout(() => finish(false, "timeout"), timeoutMs);
      } catch (err: any) {
        finish(false, String(err?.message || err));
      }
    });
  }

  private checkEnv(cfg: SoftphoneConfig) {
    if (typeof window === "undefined") return;
    if (window.location.protocol === "http:" && cfg.wssUrl?.startsWith("wss://")) {
      // wss from http page is fine; the reverse (ws:// from https) is blocked.
    }
    if (window.location.protocol === "https:") {
      const insecure = [cfg.wssUrl, ...(cfg.wssUrls || [])].filter((u) => u?.startsWith("ws://"));
      if (insecure.length) this.log("error", "env", "Mixed content: ws:// URLs blocked on https page", insecure);
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      this.log("error", "env", "navigator.mediaDevices.getUserMedia unavailable (requires HTTPS or localhost)");
    }
    if (!("RTCPeerConnection" in window)) {
      this.log("error", "env", "WebRTC RTCPeerConnection not supported in this browser");
    }
  }

  private validateConfig(cfg: SoftphoneConfig): string | null {
    if (!cfg.extension) return "Missing extension";
    if (!cfg.sipDomain) return "Missing sipDomain";
    if (!cfg.password) return "Missing SIP password";
    if (!cfg.wssUrl && !(cfg.wssUrls && cfg.wssUrls.length)) return "Missing wssUrl";
    return null;
  }

  async restart() {
    this.log("info", "sip", "Manual restart requested");
    this.stop();
    if (this.config) await this.init(this.config);
  }

  async init(cfg: SoftphoneConfig) {
    // Skip re-init when already running with identical credentials — prevents the
    // disconnect/reconnect loop caused by repeated mounts (route changes, StrictMode).
    const sig = `${cfg.extension}|${cfg.sipDomain}|${cfg.password}|${cfg.wssUrl}`;
    if (this.ua && (this as any).lastInitSig === sig && (this.snap.status === "registered" || this.snap.status === "connected" || this.snap.status === "connecting")) {
      this.log("info", "config", `SIP already initialized for ext ${cfg.extension} — skipping re-init`);
      return;
    }
    if (this.ua) this.stop();
    (this as any).lastInitSig = sig;
    this.config = cfg;
    this.update({ events: [], callEvents: [], wssReachable: null, errorCause: undefined, ...( { authBlocked: null } as any) });
    this.log("info", "config", `Initializing SIP for ext ${cfg.extension}@${cfg.sipDomain}`);

    if (cfg.mock || !cfg.password) {
      this.log("info", "sip", "Mock mode (no real registration)");
      this.update({ status: "registered" });
      return;
    }

    const invalid = this.validateConfig(cfg);
    if (invalid) {
      this.update({ status: "error", errorCause: invalid });
      this.log("error", "config", invalid);
      return;
    }

    this.checkEnv(cfg);

    if (!JsSIP) {
      this.update({ status: "error", errorCause: "JsSIP module failed to load" });
      this.log("error", "sip", "JsSIP module failed to load");
      return;
    }

    try {
      const fallbackUrls = Array.from(new Set([
        cfg.wssUrl,
        ...(cfg.wssUrls || []),
        'wss://pbxnode.lemtel.tel:7443',
        'wss://node.lemtelcloud.net:7443',
      ].filter(Boolean))) as string[];

      // Defer probe so it doesn't compete with the UA's own WS connection.
      // Skip entirely if UA registers in time — registration proves reachability.
      setTimeout(() => {
        if (this.snap.status === "registered" || this.snap.status === "connected") {
          this.update({ wssReachable: true, wssCheckedUrl: fallbackUrls[0] });
          return;
        }
        this.probeWss(fallbackUrls[0]).then((ok) => {
          this.update({ wssReachable: ok, wssCheckedUrl: fallbackUrls[0] });
        });
      }, 6000);

      const sockets = fallbackUrls.map((u) => new (JsSIP as any).WebSocketInterface(u));
      // q=1.0 matches the iOS PJSIP config so FusionPBX forks to both
      // the portal and the mobile app simultaneously (parallel forking).
      // register_expires 120 = same as mobile keep-alive interval.
      const ua = new (JsSIP as any).UA({
        sockets,
        uri: `sip:${cfg.extension}@${cfg.sipDomain}`,
        password: cfg.password,
        authorization_user: cfg.extension,
        realm: cfg.sipDomain,
        contact_uri: `sip:${cfg.extension}@${cfg.sipDomain};transport=wss;q=1.0`,
        register: true,
        session_timers: false,
        register_expires: 120,
        connection_recovery_min_interval: 2,
        connection_recovery_max_interval: 30,
        user_agent: "AVA Softphone 1.1",
      });

      ua.on("connecting", () => { this.log("info", "sip", "WebSocket connecting"); this.update({ status: "connecting" }); });
      ua.on("connected", () => { this.log("info", "sip", "WebSocket connected"); this.update({ status: "connected" }); });
      ua.on("disconnected", (e: any) => {
        this.log("warn", "sip", "WebSocket disconnected", { code: e?.code, reason: e?.reason });
        this.update({ status: "disconnected" });
        if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
        // Don't auto-reconnect if PBX rejected our credentials — would just spam 403s.
        if ((this.snap as any).authBlocked) return;
        this.reconnectTimer = setTimeout(() => { try { ua.start(); } catch {} }, 5000);
      });
      ua.on("registered", () => { this.log("info", "sip", "Registered"); this.update({ status: "registered", errorCause: undefined, wssReachable: true, lastRegistrationAt: Date.now(), ...( { authBlocked: null } as any) }); });
      ua.on("unregistered", (e: any) => this.log("warn", "sip", "Unregistered", { cause: e?.cause }));
      ua.on("registrationFailed", (e: any) => {
        const cause = e?.cause || e?.response?.reason_phrase || "registration failed";
        const code = e?.response?.status_code;
        this.log("error", "sip", `Registration failed: ${cause}`, { status: code });
        const patch: any = { status: "error", errorCause: cause };
        if (code === 401 || code === 403 || code === 407) {
          patch.authBlocked = { code, reason: cause, since: Date.now() };
          this.log("warn", "sip", `Auth blocked (${code}) — auto-reconnect disabled until credentials refresh`);
        }
        this.update(patch);
      });
      ua.on("newRTCSession", (e: any) => this.attachSession(e.session, e.originator));

      ua.start();
      this.ua = ua;
      this.update({ status: "connecting" });
    } catch (err: any) {
      const msg = String(err?.message || err);
      this.log("error", "sip", `UA init exception: ${msg}`);
      this.update({ status: "error", errorCause: msg });
    }
  }

  private attachSession(session: any, originator: string) {
    this.session = session;
    const incoming = originator === "remote";
    const remoteUri = session.remote_identity?.uri?.user || "";
    const remoteName = session.remote_identity?.display_name || remoteUri;

    this.logCall("info", `${incoming ? "Incoming" : "Outgoing"} INVITE: ${remoteName} <${remoteUri}>`);

    this.update({
      callState: incoming ? "ringing-in" : "ringing-out",
      remoteIdentity: remoteName,
      remoteNumber: remoteUri,
      direction: incoming ? "in" : "out",
      muted: false,
      onHold: false,
      lastCallError: undefined,
    });

    session.on("progress", () => {
      this.logCall("info", "Ringing (180 progress)");
      if (!incoming) this.update({ callState: "ringing-out" });
    });
    session.on("accepted", () => this.logCall("info", "Answered (200 OK)"));
    session.on("confirmed", () => {
      this.logCall("info", "Call confirmed (ACK)");
      this.update({ callState: "active", startedAt: Date.now() });
    });
    session.on("failed", (e: any) => {
      const cause = e?.cause || e?.message || "failed";
      this.logCall("error", `Call failed: ${cause}`, { status: e?.message?.status_code });
      this.update({ callState: "ended", errorCause: cause, lastCallError: cause });
      setTimeout(() => this.resetCall(), 2500);
    });
    session.on("ended", (e: any) => {
      this.logCall("info", `Call ended: ${e?.cause || "normal"}`);
      this.update({ callState: "ended" });
      setTimeout(() => this.resetCall(), 2500);
    });
    session.on("hold", () => this.update({ onHold: true, callState: "held" }));
    session.on("unhold", () => this.update({ onHold: false, callState: "active" }));
    session.on("muted", () => this.update({ muted: true }));
    session.on("unmuted", () => this.update({ muted: false }));

    const pc = session.connection;
    if (pc) {
      pc.addEventListener("track", (ev: any) => {
        if (this.audioEl && ev.streams[0]) {
          this.audioEl.srcObject = ev.streams[0];
          this.audioEl.play().catch(() => {});
        }
      });
      // Verbose ICE/SDP instrumentation routed through the snapshot logger.
      instrumentPeerConnection(pc, (event, detail, level = 'info') => {
        this.logCall(level, `[ice] ${event}`, detail);
      });
    }

    // Post-INVITE health-check: confirm SIP session reaches `confirmed`
    // AND ICE reaches connected/completed. Surface a clear error otherwise.
    watchCallEstablishment(session, pc, 15000).then((res) => {
      if (res.ok) {
        this.logCall('info', `[ice] call established (ice=${res.iceState})`);
        return;
      }
      const msg =
        res.reason === 'timeout-session' ? 'Call did not connect (no ACK within 15s)'
        : res.reason === 'timeout-ice'   ? `ICE did not connect (state=${res.iceState ?? '?'}) — likely STUN/TURN blocked`
        : res.reason === 'ice-failed'    ? 'ICE negotiation failed — media path blocked'
        : 'Call setup failed';
      this.logCall('error', `[ice] ${msg}`);
      this.update({ lastCallError: msg });
    });
  }

  private resetCall() {
    this.session = null;
    this.update({
      callState: "idle",
      remoteIdentity: "",
      remoteNumber: "",
      direction: null,
      startedAt: null,
      muted: false,
      onHold: false,
    });
  }

  async call(number: string) {
    if (!this.config) return;
    this.logCall("info", `Dialing ${number}`);
    this.update({
      callState: "ringing-out",
      remoteIdentity: number,
      remoteNumber: number,
      direction: "out",
      lastCallError: undefined,
    });
    if (this.config.mock || !this.ua) {
      this.clearMockTimers();
      this.mockTimers.push(
        setTimeout(() => {
          if (this.snap.callState === "ringing-out") {
            this.update({ callState: "active", startedAt: Date.now() });
          }
        }, 1500)
      );
      return;
    }
    const target = `sip:${number}@${this.config.sipDomain}`;
    try {
      // Pre-fetch a real audio stream — JsSIP otherwise generates an SDP
      // offer with no media line, which the server rejects with
      // "Bad Media Description".
      let mediaStream: MediaStream;
      try {
        mediaStream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
          video: false,
        });
        if (!mediaStream.getAudioTracks().length) throw new Error("no audio track");
      } catch (micErr: any) {
        const msg = `Microphone unavailable: ${micErr?.message || micErr}`;
        this.logCall("error", msg);
        this.update({ callState: "ended", lastCallError: msg, errorCause: msg });
        setTimeout(() => this.resetCall(), 1500);
        return;
      }

      this.ua.call(target, {
        mediaStream,
        mediaConstraints: { audio: true, video: false },
        rtcOfferConstraints: { offerToReceiveAudio: true, offerToReceiveVideo: false },
        sessionDescriptionHandlerModifiers: [sdpModifier],
        pcConfig: PC_CONFIG,
        sessionTimersExpires: 120,
      });
      sipDebug('ua.call() pcConfig', PC_CONFIG);
    } catch (err: any) {
      const msg = String(err?.message || err);
      this.logCall("error", `ua.call() threw: ${msg}`);
      this.update({ callState: "ended", lastCallError: msg });
      setTimeout(() => this.resetCall(), 1500);
    }
  }

  answer() {
    if (this.session) {
      this.session.answer({
        mediaConstraints: { audio: true, video: false },
        rtcAnswerConstraints: { offerToReceiveAudio: true, offerToReceiveVideo: false },
        sessionDescriptionHandlerModifiers: [sdpModifier],
        pcConfig: PC_CONFIG,
      });
      sipDebug('session.answer() pcConfig', PC_CONFIG);
    } else if (this.config?.mock) {
      this.clearMockTimers();
      this.update({ callState: "active", startedAt: Date.now() });
    }
  }

  hangup() {
    if (this.session) {
      try { this.session.terminate(); } catch {}
    }
    if (this.config?.mock || !this.session) {
      this.clearMockTimers();
      this.update({ callState: "ended", startedAt: null });
      this.mockTimers.push(setTimeout(() => this.resetCall(), 800));
    }
  }

  mute() { this.session?.mute({ audio: true }); if (this.config?.mock) this.update({ muted: true }); }
  unmute() { this.session?.unmute({ audio: true }); if (this.config?.mock) this.update({ muted: false }); }

  hold() { this.session?.hold(); if (this.config?.mock) this.update({ onHold: true, callState: "held" }); }
  unhold() { this.session?.unhold(); if (this.config?.mock) this.update({ onHold: false, callState: "active" }); }

  sendDTMF(key: string) {
    this.session?.sendDTMF(key, { duration: 100, interToneGap: 70 });
  }

  transfer(target: string) {
    if (!this.session || !this.config) return;
    this.session.refer(`sip:${target}@${this.config.sipDomain}`);
  }

  simulateIncoming(number: string) {
    this.update({
      callState: "ringing-in",
      remoteIdentity: number,
      remoteNumber: number,
      direction: "in",
    });
  }

  stop() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.clearMockTimers();
    try { this.ua?.stop(); } catch {}
    this.ua = null;
    this.session = null;
    this.update({ status: "disconnected", callState: "idle", direction: null, startedAt: null });
  }

  /** Build a debug report with secrets masked. */
  buildDebugReport() {
    const cfg = this.config;
    const masked = cfg ? {
      extension: cfg.extension,
      displayName: cfg.displayName,
      sipDomain: cfg.sipDomain,
      wssUrl: cfg.wssUrl,
      wssUrls: cfg.wssUrls,
      mock: cfg.mock,
      password: cfg.password ? `*** (${cfg.password.length} chars)` : "(empty)",
    } : null;
    return {
      generatedAt: new Date().toISOString(),
      userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "",
      pageUrl: typeof window !== "undefined" ? window.location.href : "",
      pageProtocol: typeof window !== "undefined" ? window.location.protocol : "",
      snapshot: {
        status: this.snap.status,
        callState: this.snap.callState,
        errorCause: this.snap.errorCause,
        lastCallError: this.snap.lastCallError,
        wssReachable: this.snap.wssReachable,
        wssCheckedUrl: this.snap.wssCheckedUrl,
      },
      config: masked,
      events: this.snap.events,
      callEvents: this.snap.callEvents,
    };
  }

  // ---- Additive helpers used by /mplanipret quality controller.
  // Lemtel softphone must not depend on these; they are safe no-ops when idle.
  getActivePeerConnection(): RTCPeerConnection | null {
    return (this.session as any)?.connection ?? null;
  }
  hasActiveCall(): boolean {
    return !!this.session && (this.snap.callState === "active" || this.snap.callState === "held");
  }
  /** Trigger an ICE restart on the current call (seamless Wi-Fi ↔ LTE handover). */
  async iceRestart(): Promise<boolean> {
    const s = this.session;
    if (!s) return false;
    try {
      if (typeof s.renegotiate === "function") {
        s.renegotiate({ rtcOfferConstraints: { iceRestart: true } });
        this.logCall("info", "[ice] restart requested (renegotiate)");
        return true;
      }
      const pc: RTCPeerConnection | undefined = s.connection;
      if (pc && typeof pc.restartIce === "function") {
        pc.restartIce();
        this.logCall("info", "[ice] restart requested (pc.restartIce)");
        return true;
      }
    } catch (e: any) {
      this.logCall("error", `[ice] restart failed: ${e?.message || e}`);
    }
    return false;
  }
  /** Force re-registration (useful when network interface changes while idle). */
  async forceReregister(): Promise<void> {
    try {
      if (this.ua) {
        try { this.ua.unregister({ all: true }); } catch {}
        setTimeout(() => { try { this.ua?.register(); } catch {} }, 250);
        this.log("info", "sip", "Forced re-registration (network change)");
      }
    } catch (e: any) {
      this.log("warn", "sip", `forceReregister failed: ${e?.message || e}`);
    }
  }
}

export const sipProvider = new JsSipProvider();

