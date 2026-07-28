/**
 * End-to-end-style flow test for the mobile JsSIP softphone using WSS.
 *
 * Verifies:
 *   1. The JsSIP UA registers against the configured WSS endpoint.
 *   2. `sp.call()` places an outbound INVITE *directly via JsSIP* — i.e. it
 *      goes through the WSS transport and never asks the backend to perform a
 *      FusionPBX `originate-click-to-call`.
 *   3. Dialling never calls the backend `mobile-calls-start` fallback.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useSoftphone } from '../hooks/useSoftphone';

type Handler = (...a: any[]) => void;

function installFakeJsSIP() {
  const uaHandlers: Record<string, Handler[]> = {};
  const sockets: string[] = [];
  const ua: any = {
    on: vi.fn((evt: string, cb: Handler) => { (uaHandlers[evt] = uaHandlers[evt] || []).push(cb); }),
    start: vi.fn(),
    stop: vi.fn(),
    call: vi.fn(),
    emit: (evt: string, ...a: any[]) => (uaHandlers[evt] || []).forEach((h) => h(...a)),
    __sockets: sockets,
  };
  (window as any).JsSIP = {
    WebSocketInterface: vi.fn().mockImplementation((url: string) => { sockets.push(url); return { url }; }),
    UA: vi.fn().mockImplementation(() => ua),
  };
  return ua;
}

const cfg = {
  extension: '300',
  password: 'VirtualAI2026!',
  domain: 'lemtel.lemtel.tel',
  wssUrl: 'wss://pbxnode.lemtel.tel:7443',
  displayName: 'Mobile 300',
};

beforeEach(() => { delete (window as any).JsSIP; });
afterEach(() => { delete (window as any).JsSIP; });

describe('mobile softphone end-to-end flow', () => {
  it('registers on the configured WSS endpoint and places the call via JsSIP (no PBX originate)', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ ok: true, mode: 'tls' }), { status: 200 }),
    );

    const ua = installFakeJsSIP();
    const { result } = renderHook(() => useSoftphone(cfg));

    await waitFor(() => expect(ua.start).toHaveBeenCalled());
    // Primary WSS endpoint is wired in as the first socket.
    expect(ua.__sockets[0]).toBe('wss://pbxnode.lemtel.tel:7443');

    // PBX accepts REGISTER → status goes to 'registered'.
    act(() => ua.emit('registered'));
    expect(result.current.sipStatus).toBe('registered');

    // Place the outbound call.
    act(() => { result.current.call('15145550100'); });
    expect(ua.call).toHaveBeenCalledTimes(1);
    const [target] = (ua.call as any).mock.calls[0];
    expect(target).toBe('sip:15145550100@lemtel.lemtel.tel');

    // Make sure NO backend call hit any originate / mobile fallback endpoint.
    const originateCalls = fetchSpy.mock.calls.filter(([url]) =>
      typeof url === 'string' && /originate|click.to.call|mobile-calls-start/i.test(url),
    );
    expect(originateCalls).toHaveLength(0);

    fetchSpy.mockRestore();
  });
});
