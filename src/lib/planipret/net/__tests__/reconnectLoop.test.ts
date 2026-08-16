import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createReconnectLoop } from "../reconnectLoop";

describe("reconnectLoop — réseau instable (WebRTC/WebSocket)", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const opts = { random: () => 0.5 };

  it("reconnecte après des échecs successifs puis se stabilise", async () => {
    let fails = 3;
    const connect = vi.fn(async () => { if (fails-- > 0) throw new Error("net"); });
    const loop = createReconnectLoop({ connect, maxAttempts: 6, baseDelayMs: 100, ...opts });
    await loop.start();
    for (let i = 0; i < 6; i++) { await vi.advanceTimersByTimeAsync(2000); }
    expect(connect).toHaveBeenCalledTimes(4);
    expect(loop.state).toBe("connected");
  });

  it("abandonne après maxAttempts sans boucle infinie", async () => {
    const connect = vi.fn(async () => { throw new Error("net"); });
    const loop = createReconnectLoop({ connect, maxAttempts: 3, baseDelayMs: 50, ...opts });
    await loop.start();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(connect).toHaveBeenCalledTimes(3);
    expect(loop.state).toBe("failed");
  });

  it("ne retente pas sur un code fatal (1000 / 1008)", async () => {
    const connect = vi.fn(async () => {});
    const loop = createReconnectLoop({ connect, baseDelayMs: 50, ...opts });
    await loop.start();
    loop.notifyDisconnected(1008);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(connect).toHaveBeenCalledTimes(1);
    expect(loop.state).toBe("stopped");
  });

  it("retente sur une coupure réseau (1006) et applique un backoff croissant", async () => {
    const delays: number[] = [];
    let last = 0;
    const connect = vi.fn(async () => { throw new Error("net"); });
    const loop = createReconnectLoop({
      connect, maxAttempts: 4, baseDelayMs: 100, maxDelayMs: 5000, random: () => 0.5,
      setTimeoutFn: (fn, ms) => { delays.push(ms); last = ms; return setTimeout(fn, ms); },
    });
    await loop.start();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(delays.length).toBeGreaterThanOrEqual(2);
    expect(delays[1]).toBeGreaterThan(delays[0]);
    expect(last).toBeLessThanOrEqual(5000);
  });

  it("stop() annule tout timer en vol (pas de reconnexion fantôme)", async () => {
    const connect = vi.fn(async () => { throw new Error("net"); });
    const loop = createReconnectLoop({ connect, maxAttempts: 5, baseDelayMs: 100, ...opts });
    await loop.start();
    loop.stop();
    await vi.advanceTimersByTimeAsync(20_000);
    expect(connect).toHaveBeenCalledTimes(1);
    expect(loop.state).toBe("stopped");
  });

  it("une tentative périmée ne réécrit pas l'état (garde de génération)", async () => {
    let resolveFirst: () => void = () => {};
    const connect = vi.fn(() => new Promise<void>((res) => { resolveFirst = res; }));
    const loop = createReconnectLoop({ connect, baseDelayMs: 50, ...opts });
    void loop.start();
    loop.notifyDisconnected(1006); // invalide la tentative en cours
    resolveFirst();
    await vi.advanceTimersByTimeAsync(0);
    expect(loop.state).not.toBe("connected");
  });
});
