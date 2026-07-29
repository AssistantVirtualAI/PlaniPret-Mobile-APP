// Planipret mobile — dedicated JsSIP UA bound to the NS-API PBX.
//
// This is intentionally independent from the Lemtel `sipProvider` in
// `@/lib/softphone/jssipProvider` so /mplanipret talks only to the NS-API
// (NetSapiens) telephony backend. It re-uses the JsSIP browser library and
// wires the same media pipeline: NC-aware getUserMedia, RTCPeerConnection
// stats sampling, and ICE-restart support for Wi-Fi ↔ LTE handover.

import JsSIP from "jssip";
import { getPpSipReconnectConfig, ppSipBackoffDelay, PP_SIP_RECONNECT_FLOOR_MS } from "./ppSipReconnectConfig";

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

/** Reconnect instrumentation: lets us prove the backoff never falls back to 1000ms. */
export interface PpSipReconnectMetrics {
  /** Current consecutive-failure counter used for the exponential backoff. */
  attempt: number;
  /** Delay actually scheduled for the next reconnect (ms). */
  currentDelayMs: number;
  /** Delay computed by the backoff formula before the floor is applied (ms). */
  rawBackoffMs: number;
  /** Where currentDelayMs came from: the backoff curve, the hard floor, or the max cap. */
  delaySource: "none" | "backoff" | "floor" | "cap";
  /** Hard floor applied on top of the configured backoff (ms). */
  floorMs: number;
  /** Smallest delay ever scheduled in this session — must stay >= floorMs. */
  minDelayObservedMs: number | null;
  /** Reason reported for the last disconnect / failed reconnect. */
  lastFailureReason: string | null;
  lastScheduledAt: number | null;
  lastAttemptAt: number | null;
  totalAttempts: number;
  /** Count of attempts that would have been scheduled below the floor (source of a 1000ms). */
  subThresholdHits: number;
  /** Total WebSocket interfaces instantiated in this session (must stay 1 per UA). */
  socketsCreated: number;
  /** Number of times the UA was fully rebuilt by the watchdog. */
  uaRebuilds: number;
  /** Which mechanism currently owns recovery: JsSIP's connection_recovery or our watchdog. */
  recoveryOwner: PpSipRecoveryOwner;
  /** Rolling log of every recovery decision (most recent last, capped). */
  history: PpSipReconnectEvent[];
}

export type PpSipRecoveryOwner = "none" | "jssip" | "watchdog";

export interface PpSipReconnectEvent {
  at: number;
  phase: "defer" | "schedule" | "attempt" | "socket" | "recovered" | "blocked";
  owner: PpSipRecoveryOwner;
  attempt: number;
  delayMs: number;
  source: PpSipReconnectMetrics["delaySource"];
  reason: string;
}



let sipParserGuardInstalled = false;
let ppSipInitInFlight = false;

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
  private wsWatchdogTimer: ReturnType<typeof setTimeout> | null = null;
  private wsFailures = 0;
  private lastWsDisconnectedAt = 0;
  private lastRegisterAttemptAt = 0;
  private netWatchInstalled = false;
  /** Reconnect instrumentation — surfaced via getReconnectMetrics(). */
  private reconnectMetrics: PpSipReconnectMetrics = {
    attempt: 0,
    currentDelayMs: 0,
    rawBackoffMs: 0,
    delaySource: "none",
    floorMs: 0,
    minDelayObservedMs: null,
    lastFailureReason: null,
    lastScheduledAt: null,
    lastAttemptAt: null,
    totalAttempts: 0,
    subThresholdHits: 0,
    socketsCreated: 0,
    uaRebuilds: 0,
    recoveryOwner: "none",
    history: [],
  };
  private metricsListeners = new Set<(m: PpSipReconnectMetrics) => void>();
  /** Single-owner recovery guard: only one mechanism may drive a reconnect. */
  private recoveryOwner: PpSipRecoveryOwner = "none";
  private recoveryOwnerSince = 0;

  getReconnectMetrics(): PpSipReconnectMetrics {
    return { ...this.reconnectMetrics, recoveryOwner: this.recoveryOwner, history: [...this.reconnectMetrics.history] };
  }
  /** Full incident export (metrics + config + snapshot) for support/debug. */
  getReconnectReport() {
    return {
      exportedAt: new Date().toISOString(),
      guardVersion: "v4",
      status: this.snap.status,
      extension: this.cfg?.extension ?? null,
      wssUrl: this.cfg?.wssUrl ?? null,
      config: getPpSipReconnectConfig(),
      floorMs: PP_SIP_RECONNECT_FLOOR_MS,
      metrics: this.getReconnectMetrics(),
    };
  }
  exportReconnectMetrics(): string { return JSON.stringify(this.getReconnectReport(), null, 2); }
  resetReconnectMetrics() {
    this.reconnectMetrics = {
      ...this.reconnectMetrics,
      attempt: 0, currentDelayMs: 0, rawBackoffMs: 0, delaySource: "none",
      minDelayObservedMs: null, lastFailureReason: null, lastScheduledAt: null,
      lastAttemptAt: null, totalAttempts: 0, subThresholdHits: 0,
      socketsCreated: 0, uaRebuilds: 0, history: [],
    };
    this.emitMetrics();
  }
  subscribeReconnectMetrics(fn: (m: PpSipReconnectMetrics) => void): () => void {
    this.metricsListeners.add(fn);
    fn(this.getReconnectMetrics());
    return () => { this.metricsListeners.delete(fn); };
  }
  private emitMetrics() {
    const m = this.getReconnectMetrics();
    this.metricsListeners.forEach((fn) => { try { fn(m); } catch { /* noop */ } });
  }
  private pushHistory(phase: PpSipReconnectEvent["phase"], reason: string, delayMs = 0) {
    const h = this.reconnectMetrics.history;
    h.push({
      at: Date.now(),
      phase,
      owner: this.recoveryOwner,
      attempt: this.reconnectMetrics.attempt,
      delayMs,
      source: this.reconnectMetrics.delaySource,
      reason,
    });
    if (h.length > 200) h.splice(0, h.length - 200);
  }

  /** Acquire the exclusive recovery lease. Returns false when another
   *  mechanism (JsSIP connection_recovery or our watchdog) already owns it. */
  private acquireRecovery(owner: Exclude<PpSipRecoveryOwner, "none">, reason: string): boolean {
    if (this.recoveryOwner !== "none" && this.recoveryOwner !== owner) {
      this.pushHistory("blocked", `${reason} (owned by ${this.recoveryOwner})`);
      this.log("warn", `recovery blocked: ${owner} wanted ${reason}, ${this.recoveryOwner} owns it`);
      this.emitMetrics();
      return false;
    }
    if (this.recoveryOwner === owner) {
      // Same owner re-entering: only allowed if it has no pending timer.
      if (owner === "jssip" ? !!this.wsWatchdogTimer : !!this.wsRetryTimer) {
        this.pushHistory("blocked", `${reason} (duplicate ${owner} request)`);
        return false;
      }
    }
    this.recoveryOwner = owner;
    this.recoveryOwnerSince = Date.now();
    this.reconnectMetrics.recoveryOwner = owner;
    return true;
  }

  private releaseRecovery(reason: string) {
    if (this.recoveryOwner === "none") return;
    this.recoveryOwner = "none";
    this.recoveryOwnerSince = 0;
    this.reconnectMetrics.recoveryOwner = "none";
    this.pushHistory("recovered", reason);
    this.emitMetrics();
  }



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

  private deferTransportRecovery(reason: string, delayMs?: number) {
    if (this.wsWatchdogTimer || this.wsRetryTimer) return;
    // JsSIP's own connection_recovery owns this window; our watchdog only
    // arms a verification timer behind the same exclusive lease.
    if (!this.acquireRecovery("jssip", `defer:${reason}`)) return;
    const rc = getPpSipReconnectConfig();
    const delay = Math.max(PP_SIP_RECONNECT_FLOOR_MS, delayMs ?? rc.socketVerifyDelayMs);
    this.reconnectMetrics.lastFailureReason = reason;
    this.reconnectMetrics.currentDelayMs = delay;
    this.reconnectMetrics.rawBackoffMs = delay;
    this.reconnectMetrics.delaySource = delay <= PP_SIP_RECONNECT_FLOOR_MS ? "floor" : "backoff";
    this.reconnectMetrics.floorMs = PP_SIP_RECONNECT_FLOOR_MS;
    this.reconnectMetrics.minDelayObservedMs = this.reconnectMetrics.minDelayObservedMs === null
      ? delay
      : Math.min(this.reconnectMetrics.minDelayObservedMs, delay);
    this.reconnectMetrics.lastScheduledAt = Date.now();
    this.pushHistory("defer", reason, delay);
    this.emitMetrics();
    this.log("warn", `sip transport recovery deferred ${delay}ms (reason=${reason})`);
    this.wsWatchdogTimer = setTimeout(() => {
      this.wsWatchdogTimer = null;
      if (this.ua && this.snap.status !== "registered" && this.snap.status !== "connected") {
        // Hand the lease over from JsSIP to our watchdog.
        this.recoveryOwner = "none";
        this.scheduleSocketReconnect(reason);
      } else {
        this.releaseRecovery("jssip_recovered");
      }
    }, delay);
  }


  async init(cfg: PpSipConfig) {
    if (ppSipInitInFlight) return;
    installSipParserGuard();
    const wssUrl = String(cfg.wssUrl ?? "").trim();
    if (!cfg.extension || !cfg.sipDomain || !wssUrl || wssUrl === "undefined" || !/^wss?:\/\//i.test(wssUrl) || !cfg.password) {
      this.update({ status: "error", errorCause: "invalid_config" });
      return;
    }
    const cleanCfg = { ...cfg, wssUrl };
    const sig = `${cleanCfg.extension}|${cleanCfg.sipDomain}|${cleanCfg.wssUrl}|${cleanCfg.password}`;
    if (this.ua && sig === this.lastSig && this.snap.status === "registered") {
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
        this.log("warn", `duplicate init ignored while SIP is ${this.snap.status || "starting"}`);
        return;
      }
      if (this.snap.status === "connected") {
        if (Date.now() - this.lastRegisterAttemptAt >= PP_SIP_RECONNECT_FLOOR_MS) {
          this.lastRegisterAttemptAt = Date.now();
          try { this.ua.register(); } catch {}
        }
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
      ppSipInitInFlight = true;
      const urls = Array.from(new Set([cleanCfg.wssUrl, ...(cleanCfg.wssUrls || [])]
        .map((u) => String(u ?? "").trim())
        .filter((u) => /^wss?:\/\//i.test(u)))) as string[];
      if (!urls.length) throw new Error("No valid SIP WSS URL");
      const sockets = urls.map((u) => new (JsSIP as any).WebSocketInterface(u));
      this.reconnectMetrics.socketsCreated += sockets.length;
      this.pushHistory("socket", `sockets_created:${urls.join(",")}`);
      const reconnectConfig = getPpSipReconnectConfig();
      this.log("info", "reconnect guard active v4", {
        floorMs: PP_SIP_RECONNECT_FLOOR_MS,
        backoffMinMs: reconnectConfig.socketBackoffMinMs,
        verifyDelayMs: reconnectConfig.socketVerifyDelayMs,
        registerExpiresSec: reconnectConfig.registerExpiresSec,
        socketsCreated: this.reconnectMetrics.socketsCreated,
      });

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
        register_expires: reconnectConfig.registerExpiresSec,
        connection_recovery_min_interval: Math.max(3, Math.ceil(reconnectConfig.socketBackoffMinMs / 1000)),
        connection_recovery_max_interval: Math.max(3, Math.ceil(reconnectConfig.socketBackoffMaxMs / 1000)),
        user_agent: "Planipret Softphone 1.0",
      });

      ua.on("connecting", () => { this.connectingSince = Date.now(); this.update({ status: "connecting" }); });
      ua.on("connected", () => {
        // Do not reset wsFailures until REGISTER succeeds. NetSapiens can accept
        // the TCP/WSS connection and still close it before REGISTER 200 OK; if we
        // reset here every drop becomes attempt #1 forever.
        if (this.wsRetryTimer) { clearTimeout(this.wsRetryTimer); this.wsRetryTimer = null; }
        if (this.wsWatchdogTimer) { clearTimeout(this.wsWatchdogTimer); this.wsWatchdogTimer = null; }
        // Do NOT ping here: sending an un-authenticated OPTIONS before the
        // REGISTER 200 OK makes NetSapiens close the socket with code 1001,
        // which produced the endless connect -> 1001 -> "Connection Error" loop.
        this.update({ status: "connected" });
      });
      ua.on("disconnected", (e: any) => {
        this.log("warn", "ws disconnected", e);
        this.lastWsDisconnectedAt = Date.now();
        this.stopKeepAlive();
        this.update({ status: "disconnected", errorCause: e?.reason || "ws_disconnected" });
        // JsSIP already owns the first retry via connection_recovery_* (>= 3s).
        // Scheduling our own reconnect here opened a SECOND WebSocket for the
        // same AoR: NetSapiens then closed the older socket with code 1001,
        // which restarted the whole cycle forever. We only act as a watchdog if
        // JsSIP has not recovered after socketVerifyDelayMs.
        this.deferTransportRecovery(String(e?.reason || "ws_disconnected"));
      });
      ua.on("registered", () => {
        this.regFailures = 0;
        this.wsFailures = 0;
        this.reconnectMetrics.attempt = 0;
        this.reconnectMetrics.currentDelayMs = 0;
        this.reconnectMetrics.delaySource = "none";
        if (this.wsRetryTimer) { clearTimeout(this.wsRetryTimer); this.wsRetryTimer = null; }
        if (this.wsWatchdogTimer) { clearTimeout(this.wsWatchdogTimer); this.wsWatchdogTimer = null; }
        this.releaseRecovery("registered");
        this.emitMetrics();

        this.startKeepAlive();
        if (this.regRetryTimer) { clearTimeout(this.regRetryTimer); this.regRetryTimer = null; }
        return this.update({ status: "registered", errorCause: undefined, lastRegistrationAt: Date.now() });
      });
      ua.on("unregistered", () => {
        const rc = getPpSipReconnectConfig();
        const recentlyDisconnected = Date.now() - this.lastWsDisconnectedAt < rc.socketVerifyDelayMs;
        // When the transport is already down, the socket reconnect loop owns
        // recovery — re-registering here only yields "Connection Error".
        if (!this.ua?.isConnected?.() || recentlyDisconnected || this.snap.status === "disconnected") {
          this.log("warn", "unregistered ignored; transport recovery owns reconnect");
          // Deferred: never open a competing socket while JsSIP recovery runs.
          this.deferTransportRecovery("unregistered_transport_down");
          return;
        }
        this.log("warn", "unregistered on live transport - scheduling guarded re-register");
        this.update({ status: "connected", errorCause: "re_registering" });
        // NetSapiens sometimes returns 401/403 mid-session on stale nonce;
        // trigger an immediate re-REGISTER instead of leaving the UA idle.
        setTimeout(() => {
          try {
            if (this.ua?.isConnected?.()) {
              this.lastRegisterAttemptAt = Date.now();
              this.ua.register();
            } else {
              this.scheduleSocketReconnect("guarded_reregister_transport_down");
            }
          } catch {}
        }, Math.max(PP_SIP_RECONNECT_FLOOR_MS, rc.reRegisterDelayMs));
      });
      ua.on("registrationFailed", (e: any) => {
        const cause = e?.cause || e?.response?.reason_phrase || "registration_failed";
        this.log("error", `registration failed: ${cause}`);
        this.update({ status: "error", errorCause: cause });
        if (!this.ua?.isConnected?.() || /connection error/i.test(String(cause))) {
          if (this.regRetryTimer) { clearTimeout(this.regRetryTimer); this.regRetryTimer = null; }
          // Connection Error is emitted by the failed REGISTER transaction while
          // JsSIP's transport recovery is already scheduled. Starting our own
          // reconnect here races that recovery and creates the duplicate WSS
          // socket that NetSapiens closes with 1001. Wait for the recovery
          // window, then rebuild the UA only if it is still not registered.
          this.deferTransportRecovery(`registration_failed:${cause}`);
          return;
        }
        // Retry with exponential backoff and a single pending timer — stacking
        // retries hammered NetSapiens and kept the socket in a failed state.
        const rc = getPpSipReconnectConfig();
        this.regFailures = Math.min(this.regFailures + 1, rc.socketBackoffMaxAttempts);
        if (this.regRetryTimer) clearTimeout(this.regRetryTimer);
        this.regRetryTimer = setTimeout(() => {
          this.regRetryTimer = null;
          try {
            if (this.ua?.isConnected?.()) {
              this.lastRegisterAttemptAt = Date.now();
              this.ua.register();
            } else {
              this.scheduleSocketReconnect("registration_retry_transport_down");
            }
          } catch {}
        }, Math.max(PP_SIP_RECONNECT_FLOOR_MS, Math.min(rc.registerRetryMaxMs, rc.registerRetryBaseMs * this.regFailures)));
      });
      ua.on("newRTCSession", (e: any) => this.attachSession(e.session, e.originator));

      this.ua = ua;
      ua.start();
      this.installNetworkWatch();
    } catch (err: any) {
      const msg = String(err?.message || err);
      this.log("error", `UA init failed: ${msg}`);
      this.update({ status: "error", errorCause: msg });
    } finally {
      ppSipInitInFlight = false;
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
      const ua = this.ua;
      if (!ua) return;
      // Only cycle the registration when we actually hold one. Calling
      // unregister({all:true}) while the UA is still connecting aborted the
      // in-flight REGISTER and produced "Connection Error".
      if (this.snap.status === "connecting" && Date.now() - this.connectingSince < 20_000) return;
      if (!ua.isConnected?.() || this.snap.status === "disconnected" || this.snap.status === "error") {
        this.scheduleSocketReconnect("force_reregister_transport_down");
        return;
      }
      if (Date.now() - this.lastRegisterAttemptAt < PP_SIP_RECONNECT_FLOOR_MS) return;
      this.lastRegisterAttemptAt = Date.now();
      if (this.snap.status === "registered") {
        // NEVER unregister({all:true}) here: it wipes EVERY contact bound to the
        // AoR — including the native background keep-alive registration — which
        // left the extension unregistered and sent inbound calls straight to
        // voicemail. A plain re-REGISTER refreshes only this contact.
        try { ua.register(); } catch {}
        return;
      }
      try { ua.register(); } catch {}
    } catch {}
  }

  /** Exponential-backoff reconnect: restart the socket, then re-REGISTER, and
   *  keep retrying (floor → cap) until the UA reports `registered` again.
   *  Every scheduling decision is recorded in `reconnectMetrics` so we can prove
   *  the delay never regresses to 1000ms. */
  private scheduleSocketReconnect(reason: string) {
    if (this.wsRetryTimer) return;
    // Exclusive lease: if JsSIP's connection_recovery currently owns recovery,
    // we must not open a competing socket.
    if (!this.acquireRecovery("watchdog", `schedule:${reason}`)) return;
    if (this.wsWatchdogTimer) { clearTimeout(this.wsWatchdogTimer); this.wsWatchdogTimer = null; }
    const rc = getPpSipReconnectConfig();
    const floorMs = Math.max(PP_SIP_RECONNECT_FLOOR_MS, rc.socketBackoffMinMs);
    this.wsFailures = Math.min(this.wsFailures + 1, rc.socketBackoffMaxAttempts);
    const configuredMin = Math.max(1, Number(rc.socketBackoffMinMs) || 1);
    const configuredMax = Math.max(configuredMin, Number(rc.socketBackoffMaxMs) || configuredMin);
    const raw = Math.min(configuredMax, configuredMin * 2 ** (Math.max(1, this.wsFailures) - 1));
    const delay = Math.max(floorMs, ppSipBackoffDelay(this.wsFailures, rc.socketBackoffMinMs, rc.socketBackoffMaxMs), raw);
    const source: PpSipReconnectMetrics["delaySource"] =
      raw < floorMs ? "floor" : (raw >= rc.socketBackoffMaxMs ? "cap" : "backoff");

    const m = this.reconnectMetrics;
    m.attempt = this.wsFailures;
    m.currentDelayMs = delay;
    m.rawBackoffMs = raw;
    m.delaySource = source;
    m.floorMs = floorMs;
    m.minDelayObservedMs = m.minDelayObservedMs === null ? delay : Math.min(m.minDelayObservedMs, delay);
    m.lastFailureReason = reason;
    m.lastScheduledAt = Date.now();
    m.totalAttempts += 1;
    if (raw < floorMs) m.subThresholdHits += 1;
    this.pushHistory("schedule", reason, delay);
    this.emitMetrics();


    if (raw < floorMs) {
      // This is the only path that could ever produce a ~1000ms delay: the
      // configured socketBackoffMinMs is below the floor. Make it loud.
      this.log("warn", `sip backoff below floor (raw=${raw}ms cfgMin=${rc.socketBackoffMinMs}ms) → clamped to ${floorMs}ms`);
    }
    this.log("warn", `sip reconnect #${m.attempt} in ${delay}ms (src=${source}, raw=${raw}ms, floor=${floorMs}ms, reason=${reason})`);

    this.wsRetryTimer = setTimeout(() => {
      this.wsRetryTimer = null;
      const ua = this.ua;
      if (!ua) { this.releaseRecovery("no_ua"); return; }
      this.reconnectMetrics.lastAttemptAt = Date.now();
      this.pushHistory("attempt", reason, delay);
      const online = typeof navigator === "undefined" || navigator.onLine !== false;
      if (!online) {
        this.log("warn", "sip reconnect deferred: offline");
        this.emitMetrics();
        this.scheduleSocketReconnect("offline");
        return;
      }
      try {
        if (ua.isConnected?.()) {
          this.lastRegisterAttemptAt = Date.now();
          ua.register();
        } else {
          const cfg = this.cfg;
          if (cfg) {
            this.log("warn", "sip reconnect rebuilding UA after JsSIP recovery window");
            try { ua.stop(); } catch {}
            this.ua = null;
            this.session = null;
            this.reconnectMetrics.uaRebuilds += 1;
            this.pushHistory("socket", "ua_rebuild");
            void this.init(cfg);
          } else {
            ua.start();
          }
        }
        this.log("info", `sip reconnect attempt #${this.reconnectMetrics.attempt} sent`);
      } catch (e: any) {
        this.reconnectMetrics.lastFailureReason = `attempt_error:${e?.message || e}`;
        this.log("error", `sip reconnect failed: ${e?.message || e}`);
      }
      this.emitMetrics();
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
      if (this.wsWatchdogTimer) { clearTimeout(this.wsWatchdogTimer); this.wsWatchdogTimer = null; }
      this.releaseRecovery("network_online");
      this.scheduleSocketReconnect("network_online");
    });

    window.addEventListener("offline", () => this.log("warn", "network offline"));
  }

  /** NetSapiens closes idle WebSockets with code 1001 after ~60s.
   *  A periodic in-dialog OPTIONS ping keeps the socket alive. */
  private startKeepAlive() {
    this.stopKeepAlive();
    const sendPing = () => {
      const ua = this.ua;
      if (!ua) return;
      // Only ping once the REGISTER succeeded — an OPTIONS sent before the
      // registration completes is rejected and the server drops the socket.
      if (this.snap.status !== "registered") return;
      try {
        // Never call ua.start() from the ping: it races the reconnect loop and
        // opens a duplicate socket (→ 1001 on the previous one).
        if (!ua.isConnected?.()) return;
        const target = `sip:${this.cfg?.sipDomain ?? ua.configuration?.uri?.host ?? ""}`;
        if (typeof ua.sendOptions === "function") ua.sendOptions(target, undefined, {});
        else if (typeof ua.sendRequest === "function") ua.sendRequest((JsSIP as any).C.OPTIONS, target, {});
      } catch { /* ping failures are non-fatal */ }
    };
    this.keepAliveTimer = setInterval(() => {
      sendPing();
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
    if (this.wsWatchdogTimer) { clearTimeout(this.wsWatchdogTimer); this.wsWatchdogTimer = null; }
    if (this.regRetryTimer) { clearTimeout(this.regRetryTimer); this.regRetryTimer = null; }
    this.releaseRecovery("stop");
    try { this.ua?.stop(); } catch {}
    this.ua = null;
    this.session = null;
    this.update({ status: "disconnected", callState: "idle", direction: null, startedAt: null });
  }

}

export const ppSipProvider = new PpSipProvider();
