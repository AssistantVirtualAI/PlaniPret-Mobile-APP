/**
 * WSS SIP failure surfacing (no WebRTC required for registration).
 */
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useSoftphone } from '../hooks/useSoftphone';
import { classifySipFailure } from '../lib/sip/jssipProvider';

const originalJsSIP = (window as any).JsSIP;

beforeEach(() => {
  const fakeUA = {
    on: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
    isConnected: vi.fn().mockReturnValue(false),
  };
  (window as any).JsSIP = {
    WebSocketInterface: vi.fn().mockImplementation(() => ({ url: 'wss://pbxnode.lemtel.tel:7443' })),
    UA: vi.fn().mockImplementation(() => fakeUA),
  };
});

afterEach(() => {
  (window as any).JsSIP = originalJsSIP;
});

const cfg = {
  extension: '300',
  password: 'pw',
  domain: 'lemtel.lemtel.tel',
  wssUrl: 'wss://pbxnode.lemtel.tel:7443',
};

describe('WSS transport', () => {
  it('does not block the softphone when WebRTC is unavailable', () => {
    const originalRTC = (window as any).RTCPeerConnection;
    delete (window as any).RTCPeerConnection;
    const { result } = renderHook(() => useSoftphone(cfg));
    expect(result.current.sipError).not.toMatch(/WebRTC not supported/i);
    (window as any).RTCPeerConnection = originalRTC;
  });
});

describe('classifySipFailure SSL/TLS handling', () => {
  it('flags SSL certificate failures with a specific user-facing message', () => {
    expect(classifySipFailure({ cause: 'SSL handshake failed' })).toMatch(/ssl certificate rejected|untrusted certificate/i);
    expect(classifySipFailure({ cause: 'TLS certificate error' })).toMatch(/ssl certificate rejected|untrusted certificate/i);
  });
  it('still classifies transport / DNS / auth / timeout reasons', () => {
    expect(classifySipFailure({ cause: 'WebSocket transport error' })).toMatch(/cannot reach phone server/i);
    expect(classifySipFailure({ cause: 'DNS lookup failed' })).toMatch(/dns/i);
    expect(classifySipFailure({ cause: 'Proxy Authentication Required', status_code: 407 })).toMatch(/authentication failed/i);
    expect(classifySipFailure({ cause: 'Request Timeout', status_code: 408 })).toMatch(/phone server not responding/i);
  });
});
