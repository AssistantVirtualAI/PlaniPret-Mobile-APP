/**
 * Tests the TURN probe fallback behaviour.
 *
 * Strategy: mock global `RTCPeerConnection` with a stub that NEVER emits a
 * relay candidate. The probe should time out on Metered, time out again on
 * the fallback, and `ensureActivePcConfig()` should expose the fallback
 * server list. A second variant emits a relay candidate immediately on the
 * second (fallback) probe to assert the bascule wires up correctly.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

type Listener = (ev: any) => void;

function makeStubPC(opts: { emitRelay?: boolean }) {
  const listeners: Record<string, Listener[]> = {};
  let gatherState: RTCIceGatheringState = 'new';
  const pc: any = {
    iceGatheringState: gatherState,
    addEventListener(name: string, fn: Listener) { (listeners[name] ||= []).push(fn); },
    removeEventListener(name: string, fn: Listener) {
      listeners[name] = (listeners[name] || []).filter((l) => l !== fn);
    },
    addTransceiver: vi.fn(),
    close: vi.fn(),
    createOffer: vi.fn().mockResolvedValue({ type: 'offer', sdp: 'v=0\n' }),
    setLocalDescription: vi.fn().mockImplementation(async () => {
      // Simulate async gathering after setLocalDescription resolves.
      queueMicrotask(() => {
        if (opts.emitRelay) {
          const candidate = { type: 'relay', candidate: 'candidate:1 1 udp 9 1.2.3.4 5 typ relay' };
          (listeners['icecandidate'] || []).forEach((l) => l({ candidate }));
        }
        // Either way, eventually complete gathering (after the probe timeout).
      });
    }),
  };
  Object.defineProperty(pc, 'iceGatheringState', {
    get() { return gatherState; },
    set(v) { gatherState = v; },
  });
  return pc;
}

describe('rtcConfig — TURN probe fallback', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    // @ts-ignore
    delete (globalThis as any).RTCPeerConnection;
  });

  it('returns provider=fallback when neither probe yields a relay within timeout', async () => {
    (globalThis as any).RTCPeerConnection = vi.fn(() => makeStubPC({ emitRelay: false }));
    const mod = await import('./rtcConfig');
    mod.__resetActivePcConfig();

    const promise = mod.probeTurnEndpoints(5000);
    // Drain the two sequential 5s timeouts (metered, then fallback).
    await vi.advanceTimersByTimeAsync(5000);
    await vi.advanceTimersByTimeAsync(5000);
    const res = await promise;

    expect(res.provider).toBe('fallback');
    expect(res.relayFound).toBe(false);
    expect(res.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('ensureActivePcConfig falls back to FALLBACK_ICE_SERVERS when metered probe times out', async () => {
    // First PC (metered probe) never emits, second PC (fallback probe) emits relay.
    let callCount = 0;
    (globalThis as any).RTCPeerConnection = vi.fn(() => {
      callCount += 1;
      return makeStubPC({ emitRelay: callCount >= 2 });
    });
    const mod = await import('./rtcConfig');
    mod.__resetActivePcConfig();

    const events: any[] = [];
    const off = mod.onIceDiagnostic((e) => events.push(e));

    const promise = mod.ensureActivePcConfig();
    await vi.advanceTimersByTimeAsync(5000); // metered probe times out
    await vi.runOnlyPendingTimersAsync();    // fallback probe resolves on microtask
    const cfg = await promise;
    off();

    expect(mod.getActiveTurnProvider()).toBe('fallback');
    expect(cfg.iceServers).toBe(mod.FALLBACK_ICE_SERVERS);
    expect(events.some((e) => e.kind === 'probe-started')).toBe(true);
    expect(events.some((e) => e.kind === 'pc-config' && e.provider === 'fallback')).toBe(true);
  });

  it('telemetry sink receives probe_result and provider_selected', async () => {
    (globalThis as any).RTCPeerConnection = vi.fn(() => makeStubPC({ emitRelay: false }));
    const mod = await import('./rtcConfig');
    mod.__resetActivePcConfig();

    const calls: any[] = [];
    mod.setTelemetrySink((e) => calls.push(e));

    const promise = mod.ensureActivePcConfig();
    await vi.advanceTimersByTimeAsync(5000);
    await vi.advanceTimersByTimeAsync(5000);
    await promise;
    mod.setTelemetrySink(null);

    const names = calls.map((c) => c.name);
    expect(names).toContain('sip.turn.probe_started');
    expect(names).toContain('sip.turn.probe_result');
    expect(names).toContain('sip.turn.provider_selected');
    const probeResult = calls.find((c) => c.name === 'sip.turn.probe_result');
    expect(probeResult.meta.provider).toBe('fallback');
    expect(probeResult.meta.relayFound).toBe(false);
  });
});
