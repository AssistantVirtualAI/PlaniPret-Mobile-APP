// Planipret mobile — dedicated JsSIP UA bound to the NS-API PBX.
//
// This is intentionally independent from the Lemtel `sipProvider` in
// `@/lib/softphone/jssipProvider` so /mplanipret talks only to the NS-API
// (NetSapiens) telephony backend. It re-uses the JsSIP browser library and
// wires the same media pipeline: NC-aware getUserMedia, RTCPeerConnection
// stats sampling, and ICE-restart support for Wi-Fi ↔ LTE handover.

import JsSIP from "jssip";
import { getPpSipReconnectConfig, ppSipBackoffDelay, PP_SIP_RECONNECT_FLOOR_MS } from "./ppSipReconnectConfig";
import { edgeOnlyWssUrls, isPortalWssUrl } from "./sipEdgePolicy";

// Let the SBC finish removing the previous Contact before a replacement UA
// REGISTERs the same AOR. Without this gap NetSapiens closes one WSS with 1001.
const PP_SIP_UA_SWAP_DELAY_MS = 800;
/** Must remain shorter than the native CallKit answer watchdog (32s). */
export const PP_PENDING_ANSWER_TIMEOUT_MS = 30_000;

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

function sipToken(value: string): string {
  return String(value || "pp")
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48) || "pp";
}

function buildContactUri(cfg: PpSipConfig): string {
  // Device AORs are case-sensitive in this NetSapiens tenant (`113M`, not
  // `113m`). Do not pass the Contact user through sipToken(), which lowercases.
  const user = String(cfg.sipUsername || cfg.extension || "pp")
    .replace(/[^a-zA-Z0-9_.!~*'()%+-]/g, "-")
    .slice(0, 64) || "pp";
  const ext = sipToken(cfg.extension || cfg.sipUsername);
  const domain = String(cfg.sipDomain || "").trim().toLowerCase();
  // NS-API v2 documents the registration URI as sip:[device]@[domain]. The
  // edge SBC belongs only in the WSS transport URL, never in the SIP AOR.
  const host = /^[a-z0-9.-]+$/.test(domain) ? domain : "planipret.ca";
  return `sip:${user}@${host};transport=wss;pp-ua=web-${ext}`;
}

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
  private reconnectVerifyTimer: ReturnType<typeof setTimeout> | null = null;
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
  private pendingAnswer: { callId: string; expiresAt: number } | null = null;
  private pendingDecline: { callId: string; expiresAt: number } | null = null;
  private answerInFlight: Promise<boolean> | null = null;

  getReconnectMetrics(): PpSipReconnectMetrics {
    return { ...this.reconnectMetrics, recoveryOwner: this.recoveryOwner, history: [...this.reconnectMetrics.history] };
  }
  /** Full incident export (metrics + config + snapshot) for support/debug. */
  getReconnectReport() {
    return {
      exportedAt: new Date().toISOString(),
      guardVersion: "v5",
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
    // JsSIP's own connection_recovery owns the first retry window; our watchdog
    // only verifies later. Opening our own socket immediately is what recreated
    // the NetSapiens 1001 reconnect loop.
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
        // Hand the lease over cleanly so blocked watchdog recoveries cannot get
        // stuck behind a stale JsSIP owner.
        this.releaseRecovery("jssip_timeout");
        this.scheduleSocketReconnect(reason);
      } else {
        this.releaseRecovery("jssip_recovered");
      }
    }, delay);
  }

  private guardedRegister(reason: string, options: { priority?: boolean } = {}): boolean {
    const ua = this.ua;
    if (!ua?.isConnected?.()) {
      // An inbound call cannot wait for the backoff curve: rebuild now.
      if (options.priority) this.hardRebuild(`${reason}_transport_down`);
      else this.scheduleSocketReconnect(`${reason}_transport_down`);
      return false;
    }
    const now = Date.now();
    const minGap = Math.max(5000, getPpSipReconnectConfig().reRegisterDelayMs);
    // Inbound-call recovery must never be swallowed by the debounce: that is
    // exactly what left the extension unregistered while the caller waited.
    if (options.priority) {
      try {
        this.lastRegisterAttemptAt = now;
        ua.register();
        this.log("info", `priority REGISTER sent (${reason})`);
        return true;
      } catch { return false; }
    }
    if (now - this.lastRegisterAttemptAt < minGap) {
      this.log("warn", `explicit REGISTER suppressed (${now - this.lastRegisterAttemptAt}ms < ${minGap}ms)`);
      this.pushHistory("blocked", "register_debounce");
      this.emitMetrics();
      return false;
    }
    try {
      // Debounce only application-triggered refreshes. Never wrap ua.register():
      // JsSIP calls it once before transport connection and again after WSS is
      // ready. Suppressing the second internal call left foreground resume stuck
      // until the app was force-quit.
      this.lastRegisterAttemptAt = now;
      ua.register();
      return true;
    } catch {
      return false;
    }
  }


  async init(cfg: PpSipConfig) {
    if (ppSipInitInFlight) return;
    installSipParserGuard();
    const rawWssUrl = String(cfg.wssUrl ?? "").trim();
    if (!cfg.extension || !cfg.sipDomain || !rawWssUrl || rawWssUrl === "undefined" || !/^wss?:\/\//i.test(rawWssUrl) || !cfg.password) {
      this.update({ status: "error", errorCause: "invalid_config" });
      return;
    }
    // Registrations must live on a call-processing core node (core1/core2);
    // the portal server accepts REGISTER but does not deliver inbound calls.
    const edgeUrls = edgeOnlyWssUrls([rawWssUrl, ...(cfg.wssUrls || [])]);
    if (isPortalWssUrl(rawWssUrl)) {
      this.log("warn", `portal WSS target rejected (${rawWssUrl}) -> using core ${edgeUrls[0]}`);
    }
    const wssUrl = edgeUrls[0];
    const cleanCfg = { ...cfg, wssUrl, wssUrls: edgeUrls };
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
      // A dead transport must never be protected by the startup debounce.
      // Foreground resume after a 1001 needs to rebuild immediately instead of
      // logging "duplicate init ignored" while no reachable Contact exists.
      const tooSoon = this.snap.status !== "disconnected"
        && this.snap.status !== "error"
        && Date.now() - this.lastStartAt < 15_000;
      if (busyConnecting || tooSoon) {
        this.log("warn", `duplicate init ignored while SIP is ${this.snap.status || "starting"}`);
        return;
      }
      if (this.snap.status === "connected") {
        this.guardedRegister("duplicate_init_connected");
        return;
      }
    }
    if (this.ua) {
      // Foreground resume can rebuild the UA at the same instant CallKit queues
      // an answer. Preserve that intent until the re-forked INVITE arrives.
      this.stop({ preserveCallIntent: true });
      await new Promise((resolve) => setTimeout(resolve, PP_SIP_UA_SWAP_DELAY_MS));
    }
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
      this.log("info", "reconnect guard active v5", {
        floorMs: PP_SIP_RECONNECT_FLOOR_MS,
        backoffMinMs: reconnectConfig.socketBackoffMinMs,
        verifyDelayMs: reconnectConfig.socketVerifyDelayMs,
        registerExpiresSec: reconnectConfig.registerExpiresSec,
        socketsCreated: this.reconnectMetrics.socketsCreated,
      });

      const ua = new (JsSIP as any).UA({
        sockets,
        uri: `sip:${cleanCfg.sipUsername}@${cleanCfg.sipDomain}`,
        contact_uri: buildContactUri(cleanCfg),
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

      try {
        const transport = (ua as any)?._transport;
        if (transport && typeof transport._reconnect === "function") {
          transport._reconnect = () => {
            this.log("warn", "JsSIP built-in recovery suppressed; watchdog owns reconnect");
          };
        }
      } catch { /* private JsSIP API guard */ }

      const isCurrentUa = () => this.ua === ua;
      ua.on("connecting", () => {
        if (!isCurrentUa()) return;
        this.connectingSince = Date.now();
        this.update({ status: "connecting" });
      });
      ua.on("connected", () => {
        if (!isCurrentUa()) return;
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
        // ua.stop() may emit `disconnected` after the replacement UA has already
        // REGISTERed. Never let that stale event mark the new core1 transport as
        // disconnected or start another rebuild (the observed post-REGISTER 1001 loop).
        if (!isCurrentUa()) {
          this.log("warn", "stale UA disconnect ignored", { code: e?.code, reason: e?.reason });
          return;
        }
        this.log("warn", "ws disconnected", e);
        this.lastWsDisconnectedAt = Date.now();
        this.stopKeepAlive();
        this.update({ status: "disconnected", errorCause: e?.reason || "ws_disconnected" });
        this.scheduleSocketReconnect(String(e?.reason || "ws_disconnected"));
      });
      ua.on("registered", () => {
        if (!isCurrentUa()) return;
        this.regFailures = 0;
        this.wsFailures = 0;
        this.reconnectMetrics.attempt = 0;
        this.reconnectMetrics.currentDelayMs = 0;
        this.reconnectMetrics.delaySource = "none";
        if (this.wsRetryTimer) { clearTimeout(this.wsRetryTimer); this.wsRetryTimer = null; }
        if (this.wsWatchdogTimer) { clearTimeout(this.wsWatchdogTimer); this.wsWatchdogTimer = null; }
        if (this.reconnectVerifyTimer) { clearTimeout(this.reconnectVerifyTimer); this.reconnectVerifyTimer = null; }
        this.releaseRecovery("registered");
        this.emitMetrics();

        this.logGrantedExpires();
        this.startKeepAlive();
        if (this.regRetryTimer) { clearTimeout(this.regRetryTimer); this.regRetryTimer = null; }
        return this.update({ status: "registered", errorCause: undefined, lastRegistrationAt: Date.now() });
      });
      ua.on("unregistered", () => {
        if (!isCurrentUa()) return;
        const rc = getPpSipReconnectConfig();
        const recentlyDisconnected = Date.now() - this.lastWsDisconnectedAt < rc.socketVerifyDelayMs;
        // When the transport is already down, the socket reconnect loop owns
        // recovery — re-registering here only yields "Connection Error".
        if (!this.ua?.isConnected?.() || recentlyDisconnected || this.snap.status === "disconnected") {
          this.log("warn", "unregistered ignored; transport recovery owns reconnect");
          this.scheduleSocketReconnect("unregistered_transport_down");
          return;
        }
        this.log("warn", "unregistered on live transport - scheduling guarded re-register");
        this.update({ status: "connected", errorCause: "re_registering" });
        // NetSapiens sometimes returns 401/403 mid-session on stale nonce;
        // trigger an immediate re-REGISTER instead of leaving the UA idle.
        setTimeout(() => {
          try {
            if (this.ua?.isConnected?.()) {
              this.guardedRegister("unregistered_live_transport");
            } else {
              this.scheduleSocketReconnect("guarded_reregister_transport_down");
            }
          } catch {}
        }, Math.max(PP_SIP_RECONNECT_FLOOR_MS, rc.reRegisterDelayMs));
      });
      ua.on("registrationFailed", (e: any) => {
        if (!isCurrentUa()) return;
        const cause = e?.cause || e?.response?.reason_phrase || "registration_failed";
        this.log("error", `registration failed: ${cause}`);
        this.update({ status: "error", errorCause: cause });
        if (!this.ua?.isConnected?.() || /connection error/i.test(String(cause))) {
          if (this.regRetryTimer) { clearTimeout(this.regRetryTimer); this.regRetryTimer = null; }
          this.scheduleSocketReconnect(`registration_failed:${cause}`);
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
              this.guardedRegister("registration_retry");
            } else {
              this.scheduleSocketReconnect("registration_retry_transport_down");
            }
          } catch {}
        }, Math.max(PP_SIP_RECONNECT_FLOOR_MS, Math.min(rc.registerRetryMaxMs, rc.registerRetryBaseMs * this.regFailures)));
      });
      ua.on("newRTCSession", (e: any) => {
        if (!isCurrentUa()) return;
        this.attachSession(e.session, e.originator);
      });

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
      this.log("info", "incoming INVITE attached", { sipCallId: callId, from: remoteUri });
      try {
        // NOTE: the VoIP push callId (NetSapiens `1-XXXXXXXX-...`) and the SIP
        // Call-ID are two different identifier spaces — never compare them.
        // Any incoming INVITE within the 30s answer-intent window is answered.
        const decline = this.pendingDecline;
        if (decline && decline.expiresAt > Date.now()) {
          this.pendingDecline = null;
          this.pendingAnswer = null;
          this.log("info", "pending decline intent active → rejecting INVITE", { sipCallId: callId });
          setTimeout(() => {
            try { session.terminate({ status_code: 603, reason_phrase: "Decline" }); } catch {}
          }, 50);
        } else if (decline) {
          this.pendingDecline = null;
        }
        const pending = this.pendingAnswer;
        if (!decline && pending && pending.expiresAt > Date.now()) {
          this.pendingAnswer = null;
          this.log("info", "pending answer intent active → auto-answering INVITE", {
            pushCallId: pending.callId || null, sipCallId: callId,
          });
          // Arbitration belongs to the hook (mobile vs widget). Never answer
          // directly here or a late INVITE can bypass pp_claim_call.
          setTimeout(() => {
            try { window.dispatchEvent(new CustomEvent("pp:sip-pending-answer-ready", { detail: { callId } })); } catch {}
          }, 50);

        } else if (pending) {
          this.log("warn", "answer intent expired before INVITE arrived");
          this.pendingAnswer = null;
        }
      } catch {}
    }



    session.on("progress", () => { if (!incoming) this.update({ callState: "ringing-out" }); });
    session.on("confirmed", () => this.update({ callState: "active", startedAt: Date.now() }));
    session.on("failed", (e: any) => {
      if (this.pendingAnswer?.callId === callId) this.pendingAnswer = null;
      this.update({ callState: "ended", errorCause: e?.cause || "failed" });
      setTimeout(() => this.resetCall(), 2000);
    });
    session.on("ended", () => {
      if (this.pendingAnswer?.callId === callId) this.pendingAnswer = null;
      this.update({ callState: "ended" });
      setTimeout(() => this.resetCall(), 2000);
    });
    session.on("hold", () => this.update({ onHold: true, callState: "held" }));
    session.on("unhold", () => this.update({ onHold: false, callState: "active" }));
    session.on("muted", () => this.update({ muted: true }));
    session.on("unmuted", () => this.update({ muted: false }));

    // --- Remote audio wiring -------------------------------------------
    // The peer connection may not exist yet (incoming calls create it on
    // answer), so listen for JsSIP's "peerconnection" event as well.
    const wire = (pc: RTCPeerConnection | undefined | null) => {
      if (!pc || (pc as any).__ppAudioWired) return;
      (pc as any).__ppAudioWired = true;
      const attach = () => this.attachRemoteAudio(pc);
      pc.addEventListener("track", attach);
      (pc as any).addEventListener?.("addstream", attach);
      attach();
    };
    wire(session.connection);
    session.on("peerconnection", (e: any) => wire(e?.peerconnection || session.connection));
    session.on("accepted", () => this.attachRemoteAudio(session.connection));
    session.on("confirmed", () => this.attachRemoteAudio(session.connection));
  }

  /** Hidden, always-available audio sink so remote audio never depends on a screen being mounted. */
  private ensureAudioEl(): HTMLAudioElement | null {
    if (this.audioEl) return this.audioEl;
    if (typeof document === "undefined") return null;
    const el = document.createElement("audio");
    el.autoplay = true;
    (el as any).playsInline = true;
    el.setAttribute("playsinline", "true");
    el.style.display = "none";
    document.body.appendChild(el);
    this.audioEl = el;
    return el;
  }

  private attachRemoteAudio(pc: RTCPeerConnection | undefined | null) {
    try {
      if (!pc) return;
      const el = this.ensureAudioEl();
      if (!el) return;
      let stream: MediaStream | null = null;
      const receivers = pc.getReceivers?.() ?? [];
      const tracks = receivers.map((r) => r.track).filter((t) => t && t.kind === "audio") as MediaStreamTrack[];
      if (tracks.length) stream = new MediaStream(tracks);
      else {
        const remotes = (pc as any).getRemoteStreams?.();
        if (remotes?.length) stream = remotes[0];
      }
      if (!stream) return;
      if (el.srcObject !== stream) el.srcObject = stream;
      el.muted = false;
      el.volume = 1;
      const p = el.play();
      if (p?.catch) p.catch(() => { setTimeout(() => el.play().catch(() => {}), 300); });
      this.log("info", `remote audio attached (${stream.getAudioTracks().length} track(s))`);
    } catch (e: any) {
      this.log("error", `attachRemoteAudio failed: ${e?.message || e}`);
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

  async requestAnswer(callId?: string): Promise<boolean> {
    if (await this.answer(callId)) return true;
    this.pendingAnswer = { callId: String(callId ?? ""), expiresAt: Date.now() + PP_PENDING_ANSWER_TIMEOUT_MS };
    this.log("info", "answer intent queued until matching INVITE", { callId: callId ?? "" });
    // No INVITE can ever arrive on a dead socket — make sure one exists.
    void this.wakeForIncoming(callId);
    return false;
  }

  requestDecline(callId?: string): boolean {
    if (this.session && this.snap.callState === "ringing-in") {
      try {
        this.session.terminate({ status_code: 603, reason_phrase: "Decline" });
        return true;
      } catch { /* queue below */ }
    }
    this.pendingAnswer = null;
    this.pendingDecline = { callId: String(callId ?? ""), expiresAt: Date.now() + 30_000 };
    this.log("info", "decline intent queued until incoming INVITE", { callId: callId ?? "" });
    return false;
  }

  /**
   * Answering MUST provide its own microphone stream: when the app was woken by
   * a VoIP push, JsSIP's internal getUserMedia races the iOS audio session and
   * silently fails, so no 200 OK is ever sent (the caller keeps hearing the
   * greeting while the UI says "answered").
   */
  async answer(_expectedCallId?: string): Promise<boolean> {
    if (this.answerInFlight) return this.answerInFlight;
    const run = this.answerOnce(_expectedCallId);
    this.answerInFlight = run;
    void run.finally(() => { if (this.answerInFlight === run) this.answerInFlight = null; });
    return run;
  }

  private async answerOnce(_expectedCallId?: string): Promise<boolean> {
    const session = this.session;
    if (!session || this.snap.callState !== "ringing-in") return false;
    // Never reject on a Call-ID mismatch: the VoIP push id and the SIP Call-ID
    // belong to different identifier spaces on NetSapiens.

    let mediaStream: MediaStream | undefined;
    try {
      mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        video: false,
      });
    } catch (e: any) {
      this.log("error", `answer: microphone unavailable (${e?.name || e?.message || e})`);
      mediaStream = undefined;
    }

    try {
      session.answer({
        ...(mediaStream ? { mediaStream } : {}),
        mediaConstraints: { audio: true, video: false },
        rtcAnswerConstraints: { offerToReceiveAudio: true, offerToReceiveVideo: false },
      });
      this.pendingAnswer = null;
      this.log("info", "200 OK sent (answer)", { withStream: !!mediaStream });
      return true;
    } catch (error) {
      this.log("error", "answer failed", error);
      return false;
    }
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
  /**
   * VoIP push wake path. After an iOS suspension the JS status often still says
   * `registered` while the WSS is dead (observed: 1001 close + POSIX 57), so the
   * PBX has zero contacts and the INVITE never reaches us. Trust nothing here:
   * rebuild the transport and wait for a REAL `registered` event.
   */
  async wakeForIncoming(callId?: string): Promise<boolean> {
    const cfg = this.cfg;
    if (!cfg) return false;
    if (this.snap.callState === "ringing-in") return true;
    const live = !!this.ua?.isConnected?.();
    this.log("info", "push wake → transport check", {
      callId: callId ?? "", status: this.snap.status, socketLive: live,
    });
    if (live) this.guardedRegister("push_wake", { priority: true });
    else this.hardRebuild("push_wake");

    let ok = await this.waitForRegistered(12_000);
    if (!ok && this.getSnapshot().callState !== "ringing-in") {
      this.log("warn", "push wake: still unregistered → hard rebuild retry");
      this.hardRebuild("push_wake_retry");
      ok = await this.waitForRegistered(12_000);
    }
    // The answer window only makes sense once the socket can carry an INVITE.
    if (this.pendingAnswer) this.pendingAnswer.expiresAt = Date.now() + PP_PENDING_ANSWER_TIMEOUT_MS;
    this.log(ok ? "info" : "warn", `push wake → ${ok ? "registered" : "NOT registered"}`);
    return ok;
  }

  private waitForRegistered(timeoutMs: number): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;
    return new Promise((resolve) => {
      const tick = () => {
        const cur = this.getSnapshot();
        if (cur.status === "registered" || cur.callState === "ringing-in") return resolve(true);
        if (Date.now() >= deadline) return resolve(false);
        setTimeout(tick, 250);
      };
      tick();
    });
  }

  /** Destroy the (possibly zombie) UA and rebuild immediately, bypassing every
   *  debounce/backoff guard. Answer intent is preserved on purpose. */
  private hardRebuild(reason: string) {
    const cfg = this.cfg;
    if (!cfg) return;
    const ua = this.ua;
    this.ua = null;
    try { ua?.stop(); } catch {}
    if (this.wsRetryTimer) { clearTimeout(this.wsRetryTimer); this.wsRetryTimer = null; }
    if (this.wsWatchdogTimer) { clearTimeout(this.wsWatchdogTimer); this.wsWatchdogTimer = null; }
    if (this.reconnectVerifyTimer) { clearTimeout(this.reconnectVerifyTimer); this.reconnectVerifyTimer = null; }
    this.releaseRecovery(`hard_rebuild:${reason}`);
    this.wsFailures = 0;
    this.lastRegisterAttemptAt = 0;
    this.lastStartAt = 0;
    this.lastSig = "";
    this.connectingSince = 0;
    this.reconnectMetrics.uaRebuilds += 1;
    this.pushHistory("socket", `hard_rebuild:${reason}`);
    this.emitMetrics();
    this.update({ status: "connecting" });
    this.log("warn", `hard transport rebuild (${reason})`);
    setTimeout(() => { void this.init(cfg); }, PP_SIP_UA_SWAP_DELAY_MS);
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
      if (this.snap.status === "registered") {
        // NEVER unregister({all:true}) here: it wipes EVERY contact bound to the
        // AoR — including the native background keep-alive registration — which
        // left the extension unregistered and sent inbound calls straight to
        // voicemail. A plain re-REGISTER refreshes only this contact.
        this.guardedRegister("force_registered_refresh");
        return;
      }
      this.guardedRegister("force_reregister");
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
          this.guardedRegister("watchdog_connected");
        } else {
          const cfg = this.cfg;
          if (cfg) {
            this.log("warn", "sip reconnect rebuilding UA after JsSIP recovery window");
            // Detach ownership before stop(): JsSIP may emit disconnected either
            // synchronously or later. In both cases the old UA event is stale.
            this.ua = null;
            try { ua.stop(); } catch {}
            this.session = null;
            this.reconnectMetrics.uaRebuilds += 1;
            this.pushHistory("socket", "ua_rebuild");
            setTimeout(() => { void this.init(cfg); }, PP_SIP_UA_SWAP_DELAY_MS);
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
      if (this.reconnectVerifyTimer) clearTimeout(this.reconnectVerifyTimer);
      this.reconnectVerifyTimer = setTimeout(() => {
        this.reconnectVerifyTimer = null;
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
  /**
   * NetSapiens frequently overrides the requested REGISTER expiry (default 60s)
   * in the 200 OK Contact header. JsSIP re-registers on the granted value, so we
   * only surface it and make sure the OPTIONS keep-alive stays well below it.
   */
  private grantedExpiresSec = 0;

  private logGrantedExpires() {
    try {
      const granted = Number((this.ua as any)?._registrator?._expires ?? 0);
      if (!Number.isFinite(granted) || granted <= 0) return;
      this.grantedExpiresSec = granted;
      const asked = getPpSipReconnectConfig().registerExpiresSec;
      if (granted < asked) {
        this.log("warn", `PBX granted a shorter REGISTER expiry (${granted}s < ${asked}s requested)`);
      } else {
        this.log("info", `REGISTER expiry granted: ${granted}s`);
      }
    } catch { /* private JsSIP API guard */ }
  }

  private startKeepAlive() {
    this.stopKeepAlive();
    let period = getPpSipReconnectConfig().keepAliveMs;
    // Stay comfortably inside the expiry the PBX actually granted.
    if (this.grantedExpiresSec > 0) period = Math.min(period, Math.max(15000, (this.grantedExpiresSec * 1000) / 3));
    if (!Number.isFinite(period) || period <= 0) return;
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
    }, period);
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
    // Never drop the registration while an inbound call is being answered.
    if (this.pendingAnswer && this.pendingAnswer.expiresAt > Date.now()) {
      this.log("warn", "background release skipped: answer intent in flight");
      return;
    }
    try { this.ua?.unregister({ all: false }); } catch { /* noop */ }
    await new Promise((r) => setTimeout(r, 250));
    this.stop();
  }

  stop(options: { preserveCallIntent?: boolean } = {}) {
    this.stopKeepAlive();
    if (this.wsRetryTimer) { clearTimeout(this.wsRetryTimer); this.wsRetryTimer = null; }
    if (this.wsWatchdogTimer) { clearTimeout(this.wsWatchdogTimer); this.wsWatchdogTimer = null; }
    if (this.reconnectVerifyTimer) { clearTimeout(this.reconnectVerifyTimer); this.reconnectVerifyTimer = null; }
    if (this.regRetryTimer) { clearTimeout(this.regRetryTimer); this.regRetryTimer = null; }
    this.releaseRecovery("stop");
    try { this.ua?.stop(); } catch {}
    this.ua = null;
    this.session = null;
    if (!options.preserveCallIntent) {
      this.pendingAnswer = null;
      this.pendingDecline = null;
    }
    this.update({ status: "disconnected", callState: "idle", direction: null, startedAt: null });
  }

}

export const ppSipProvider = new PpSipProvider();
