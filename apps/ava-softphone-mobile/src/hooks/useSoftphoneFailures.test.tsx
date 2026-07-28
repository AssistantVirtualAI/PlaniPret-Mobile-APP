/**
 * Integration tests for SIP failure → user-facing message classification,
 * plus the "Retrying…" status that the UI surfaces during the 5 s / 15 s
 * back-off window.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useSoftphone } from './useSoftphone';

type Handler = (...a: any[]) => void;

function installFakeJsSIP() {
  const uaHandlers: Record<string, Handler[]> = {};
  const ua = {
    on: vi.fn((evt: string, cb: Handler) => {
      (uaHandlers[evt] = uaHandlers[evt] || []).push(cb);
    }),
    start: vi.fn(),
    stop: vi.fn(),
    call: vi.fn(),
    emit: (evt: string, ...a: any[]) => (uaHandlers[evt] || []).forEach((h) => h(...a)),
  };
  (window as any).JsSIP = {
    WebSocketInterface: vi.fn().mockImplementation(() => ({})),
    UA: vi.fn().mockImplementation(() => ua),
  };
  return ua;
}

const cfg = {
  extension: '300',
  password: 'pw',
  domain: 'lemtel.lemtel.tel',
  wssUrl: 'wss://node.lemtelcloud.net:7443',
  displayName: 'Test',
};

beforeEach(() => { delete (window as any).JsSIP; if (!(window as any).RTCPeerConnection) (window as any).RTCPeerConnection = vi.fn(); });
afterEach(() => { delete (window as any).JsSIP; });

describe('SIP failure classification → UI message', () => {
  it.each([
    { label: 'WSS connection failed',     emit: ['disconnected', { error: true, reason: 'WebSocket transport error' }],          match: /wss connection failed|websocket|network/i },
    { label: 'Registration timeout',      emit: ['registrationFailed', { cause: 'Request Timeout', response: { status_code: 408 } }], match: /timeout/i },
    { label: 'Authentication failed',     emit: ['registrationFailed', { cause: 'Forbidden', response: { status_code: 403 } }],        match: /authentication failed/i },
    { label: 'DNS resolution failed',     emit: ['registrationFailed', { cause: 'DNS lookup failed' }],                                match: /dns/i },
  ])('surfaces "$label" when JsSIP fires the matching event', async ({ emit, match }) => {
    const ua = installFakeJsSIP();
    const { result } = renderHook(() => useSoftphone(cfg));
    await waitFor(() => expect(ua.start).toHaveBeenCalled());
    act(() => (ua as any).emit(emit[0] as string, emit[1]));
    expect(result.current.sipError).toMatch(match);
  });
});

describe('Retrying… status during back-off', () => {
  it('shows "retrying" between attempts and clears on successful registration', async () => {
    vi.useFakeTimers();
    try {
      const ua = installFakeJsSIP();
      const { result } = renderHook(() => useSoftphone(cfg));
      await vi.waitFor(() => expect(ua.start).toHaveBeenCalled());

      // 1. Auth failure → status flips to 'retrying' immediately, error set.
      act(() => (ua as any).emit('registrationFailed', { cause: 'Forbidden', response: { status_code: 401 } }));
      expect(result.current.sipStatus).toBe('retrying');
      expect(result.current.sipError).toMatch(/authentication failed/i);

      // 2. Advance 5 s — retry fires, UA restarts, status returns to 'connecting'.
      await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
      expect(result.current.sipStatus).toBe('connecting');

      // 3. PBX accepts → 'registered' and error cleared.
      act(() => (ua as any).emit('registered'));
      expect(result.current.sipStatus).toBe('registered');
      expect(result.current.sipError).toBe('');
    } finally {
      vi.useRealTimers();
    }
  });
});
