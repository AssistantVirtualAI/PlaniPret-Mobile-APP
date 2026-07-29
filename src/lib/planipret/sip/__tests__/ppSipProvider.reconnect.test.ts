import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

/* ------------------------------------------------------------------ *
 * Fake JsSIP: counts WebSocket interfaces + live UAs so we can prove
 * a ws_disconnected never opens two sockets at once and never
 * re-schedules a reconnect at 1000ms.
 * ------------------------------------------------------------------ */
const created: { sockets: string[]; uas: FakeUA[] } = { sockets: [], uas: [] };

class FakeWebSocketInterface {
  constructor(public url: string) { created.sockets.push(url); }
}

class FakeUA {
  handlers: Record<string, ((e?: any) => void)[]> = {};
  connected = false;
  stopped = false;
  registerCalls = 0;
  startCalls = 0;
  constructor(public config: any) { created.uas.push(this); }
  on(evt: string, cb: (e?: any) => void) { (this.handlers[evt] ||= []).push(cb); }
  emit(evt: string, payload?: any) { (this.handlers[evt] || []).forEach((cb) => cb(payload)); }
  start() { this.startCalls += 1; }
  stop() { this.stopped = true; this.connected = false; }
  register() { this.registerCalls += 1; }
  unregister() {}
  isConnected() { return this.connected; }
  sendOptions() {}
}

vi.mock("jssip", () => ({
  default: {
    WebSocketInterface: FakeWebSocketInterface,
    UA: FakeUA,
    C: { OPTIONS: "OPTIONS" },
    debug: { enable: () => {}, disable: () => {} },
  },
}));

const CFG = {
  extension: "113",
  sipUsername: "113",
  sipDomain: "pbx.example.com",
  wssUrl: "wss://pbx.example.com:9002",
  password: "secret",
};

const liveUAs = () => created.uas.filter((u) => !u.stopped);

describe("ppSipProvider — transport recovery guard", () => {
  let scheduledDelays: number[] = [];
  let realSetTimeout: typeof setTimeout;
  let provider: typeof import("../ppSipProvider").ppSipProvider;

  beforeEach(async () => {
    vi.resetModules();
    created.sockets = [];
    created.uas = [];
    scheduledDelays = [];
    vi.useFakeTimers();
    realSetTimeout = globalThis.setTimeout;
    const st = globalThis.setTimeout;
    // Record every timer delay the provider schedules.
    globalThis.setTimeout = ((fn: any, ms?: number, ...rest: any[]) => {
      if (typeof ms === "number") scheduledDelays.push(ms);
      return (st as any)(fn, ms, ...rest);
    }) as any;
    ({ ppSipProvider: provider } = await import("../ppSipProvider"));
    provider.resetReconnectMetrics();
  });

  afterEach(() => {
    provider.stop();
    globalThis.setTimeout = realSetTimeout;
    vi.useRealTimers();
  });

  async function bootRegistered() {
    await provider.init({ ...CFG });
    const ua = created.uas[0];
    ua.connected = true;
    ua.emit("connected");
    ua.emit("registered");
    return ua;
  }

  it("registers with a single WebSocket", async () => {
    await bootRegistered();
    expect(created.sockets).toHaveLength(1);
    expect(liveUAs()).toHaveLength(1);
    expect(provider.getSnapshot().status).toBe("registered");
  });

  it("never opens two concurrent WebSockets after ws_disconnected", async () => {
    const ua = await bootRegistered();

    ua.connected = false;
    ua.emit("disconnected", { reason: "ws_disconnected", code: 1001 });
    // Repeated drops / unregistered storms must not stack recoveries.
    ua.emit("disconnected", { reason: "ws_disconnected", code: 1001 });
    ua.emit("unregistered");

    // JsSIP owns the first recovery window.
    expect(provider.getReconnectMetrics().recoveryOwner).toBe("jssip");
    expect(created.sockets).toHaveLength(1);

    // Drive far past the verification window: the watchdog may rebuild the UA,
    // but never while another UA socket is still alive.
    for (let i = 0; i < 12; i += 1) {
      await vi.advanceTimersByTimeAsync(5_000);
      expect(liveUAs().length).toBeLessThanOrEqual(1);
    }
  });

  it("never re-schedules a reconnect at 1000ms", async () => {
    const ua = await bootRegistered();
    scheduledDelays = [];

    ua.connected = false;
    ua.emit("disconnected", { reason: "ws_disconnected", code: 1001 });
    for (let i = 0; i < 10; i += 1) await vi.advanceTimersByTimeAsync(5_000);

    const m = provider.getReconnectMetrics();
    expect(m.subThresholdHits).toBe(0);
    expect(m.minDelayObservedMs === null || m.minDelayObservedMs >= 3000).toBe(true);
    // No recovery timer may ever be armed at the legacy 1000ms cadence.
    const recoveryDelays = scheduledDelays.filter((d) => d >= 500 && d < 3000);
    expect(recoveryDelays).toEqual([]);
  });

  it("exports an analyzable incident report", async () => {
    const ua = await bootRegistered();
    ua.connected = false;
    ua.emit("disconnected", { reason: "ws_disconnected", code: 1001 });
    await vi.advanceTimersByTimeAsync(15_000);

    const report = JSON.parse(provider.exportReconnectMetrics());
    expect(report.guardVersion).toBe("v4");
    expect(report.metrics.socketsCreated).toBeGreaterThanOrEqual(1);
    expect(report.metrics.lastFailureReason).toContain("ws_disconnected");
    expect(Array.isArray(report.metrics.history)).toBe(true);
    expect(report.metrics.history.some((h: any) => h.phase === "defer")).toBe(true);
    expect(["none", "jssip", "watchdog"]).toContain(report.metrics.recoveryOwner);
  });
});
