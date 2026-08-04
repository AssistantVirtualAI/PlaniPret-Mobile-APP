/** @vitest-environment jsdom */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

/**
 * Invariant natif : sur Capacitor (iOS/Android), JsSIP ne doit JAMAIS être
 * initialisé et aucune socket WSS ne doit être ouverte pour l'AOR mobile
 * `113M`. Toute régression ici re-provoque le vol d'AOR (`pp-ua=web-113`)
 * qui détourne les INVITE entrants loin du moteur natif PJSIP.
 */

const created: { sockets: string[]; uas: FakeUA[] } = { sockets: [], uas: [] };

class FakeWebSocketInterface {
  constructor(public url: string) { created.sockets.push(url); }
}

class FakeUA {
  handlers: Record<string, ((e?: any) => void)[]> = {};
  registerCalls = 0;
  startCalls = 0;
  stopped = false;
  constructor(public config: any) { created.uas.push(this); }
  on(evt: string, cb: (e?: any) => void) { (this.handlers[evt] ||= []).push(cb); }
  emit(evt: string, payload?: any) { (this.handlers[evt] || []).forEach((cb) => cb(payload)); }
  start() { this.startCalls += 1; }
  stop() { this.stopped = true; }
  register() { this.registerCalls += 1; }
  unregister() {}
  isConnected() { return false; }
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

// Plateforme native simulée.
vi.mock("@capacitor/core", () => ({
  Capacitor: {
    isNativePlatform: () => true,
    getPlatform: () => "ios",
    isPluginAvailable: () => true,
  },
  registerPlugin: () => new Proxy({}, { get: () => async () => ({}) }),
  WebPlugin: class {},
}));

const MOBILE_CFG = {
  extension: "113",
  sipUsername: "113M",
  sipDomain: "planipret.ca",
  wssUrl: "wss://core1.cluster1.ucstack.io:9002",
  password: "secret",
};

describe("ppSipProvider — garde plateforme native", () => {
  let provider: typeof import("../ppSipProvider").ppSipProvider;
  let wsSpy: ReturnType<typeof vi.spyOn> | null = null;
  const openedWebSockets: string[] = [];

  beforeEach(async () => {
    vi.resetModules();
    created.sockets = [];
    created.uas = [];
    openedWebSockets.length = 0;
    if (typeof globalThis.WebSocket === "function") {
      wsSpy = vi.spyOn(globalThis, "WebSocket" as any).mockImplementation(((url: string) => {
        openedWebSockets.push(String(url));
        return { close() {}, addEventListener() {}, removeEventListener() {}, send() {} } as any;
      }) as any);
    }
    ({ ppSipProvider: provider } = await import("../ppSipProvider"));
  });

  afterEach(() => {
    wsSpy?.mockRestore();
    wsSpy = null;
    provider?.stop?.();
  });

  it("n'initialise jamais JsSIP sur Capacitor natif", async () => {
    await provider.init({ ...MOBILE_CFG });

    expect(created.uas).toHaveLength(0);
    expect(created.sockets).toHaveLength(0);
    expect(provider.getSnapshot().status).toBe("error");
    expect(provider.getSnapshot().errorCause).toBe("native_sip_unavailable");
  });

  it("n'ouvre aucune socket WSS pour l'AOR 113M, même sur init répétés", async () => {
    for (let i = 0; i < 3; i += 1) {
      await provider.init({ ...MOBILE_CFG });
    }

    expect(created.uas).toHaveLength(0);
    expect(created.sockets.filter((u) => /^wss?:/i.test(u))).toHaveLength(0);
    expect(openedWebSockets.filter((u) => /^wss?:/i.test(u))).toHaveLength(0);
  });

  it("ne déclenche aucun REGISTER JsSIP pour 113M", async () => {
    await provider.init({ ...MOBILE_CFG });
    expect(created.uas.reduce((n, ua) => n + ua.registerCalls + ua.startCalls, 0)).toBe(0);
  });
});
