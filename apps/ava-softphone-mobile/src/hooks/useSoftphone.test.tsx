import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useSoftphone } from './useSoftphone';

type Handler = (...args: any[]) => void;

function makeFakeSession(direction: 'incoming' | 'outgoing' = 'incoming', user = '5145551234') {
  const handlers: Record<string, Handler[]> = {};
  return {
    direction,
    remote_identity: { uri: { user } },
    on(evt: string, cb: Handler) {
      (handlers[evt] = handlers[evt] || []).push(cb);
    },
    emit(evt: string, ...args: any[]) {
      (handlers[evt] || []).forEach((h) => h(...args));
    },
    terminate: vi.fn(),
    answer: vi.fn(),
  };
}

function installFakeJsSIP() {
  const uaHandlers: Record<string, Handler[]> = {};
  const ua = {
    on: vi.fn((evt: string, cb: Handler) => {
      (uaHandlers[evt] = uaHandlers[evt] || []).push(cb);
    }),
    start: vi.fn(),
    stop: vi.fn(),
    call: vi.fn(),
    emit: (evt: string, ...args: any[]) =>
      (uaHandlers[evt] || []).forEach((h) => h(...args)),
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
  domain: 'lemtel.tel',
  wssUrl: 'wss://sip.example.com:7443',
  displayName: 'Test',
};

describe('useSoftphone', () => {
  beforeEach(() => {
    delete (window as any).JsSIP;
  });
  afterEach(() => {
    delete (window as any).JsSIP;
  });

  it.skip('reports error when JsSIP never loads (short timeout)', async () => {
    const { result } = renderHook(() => useSoftphone(cfg, { jsSipTimeoutMs: 50 }));
    expect(result.current.sipStatus).toBe('connecting');
    // After the load failure the hook surfaces the error message and
    // schedules a back-off retry, so status becomes 'retrying'.
    await waitFor(() => expect(result.current.sipStatus).toBe('retrying'), { timeout: 1500 });
    expect(result.current.sipError).toMatch(/library failed to load/i);
  });

  it('transitions to registered on UA "registered" event', async () => {
    const ua = installFakeJsSIP();
    const { result } = renderHook(() => useSoftphone(cfg));
    await waitFor(() => expect(ua.start).toHaveBeenCalled());
    act(() => ua.emit('registered'));
    expect(result.current.sipStatus).toBe('registered');
    expect(result.current.sipError).toBe('');
  });

  it('transitions to retrying on registrationFailed and surfaces the cause', async () => {
    const ua = installFakeJsSIP();
    const { result } = renderHook(() => useSoftphone(cfg));
    await waitFor(() => expect(ua.start).toHaveBeenCalled());
    act(() => ua.emit('registrationFailed', { cause: 'Forbidden' }));
    expect(result.current.sipStatus).toBe('retrying');
    expect(result.current.sipError).toBe('Forbidden');
  });

  it('handles incoming call: ringing -> active -> ended', async () => {
    const ua = installFakeJsSIP();
    const { result } = renderHook(() => useSoftphone(cfg));
    await waitFor(() => expect(ua.start).toHaveBeenCalled());

    const session = makeFakeSession('incoming', '5145559999');
    act(() => ua.emit('newRTCSession', { session }));
    expect(result.current.callState).toBe('ringing');
    expect(result.current.activeCallNumber).toBe('5145559999');

    act(() => session.emit('confirmed'));
    expect(result.current.callState).toBe('active');

    act(() => session.emit('ended'));
    expect(result.current.callState).toBe('ended');
    // Transition back to idle happens after a 2s setTimeout; assert it eventually clears.
    await waitFor(() => expect(result.current.callState).toBe('idle'), { timeout: 3000 });
    expect(result.current.activeCallNumber).toBe('');
  });
});
