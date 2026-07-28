/**
 * Configuration parity tests — the mobile JsSIP UA must be set up with the
 * same critical flags as the desktop softphone over WSS on port 7443.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createSIPUA, buildWssFallbackList, type SIPConfig } from './jssipProvider';

const cfg: SIPConfig = {
  extension: '300',
  password: 'VirtualAI2026!',
  domain: 'lemtel.lemtel.tel',
  wssUrl: 'wss://pbxnode.lemtel.tel:7443',
  displayName: 'Mobile 300',
};

function installFakeJsSIP(socketProbe: string[]) {
  const ua: any = { on: vi.fn(), start: vi.fn(), stop: vi.fn() };
  (window as any).JsSIP = {
    WebSocketInterface: vi.fn().mockImplementation((url: string) => {
      socketProbe.push(url);
      return { url };
    }),
    UA: vi.fn().mockImplementation((opts: any) => {
      (ua as any).__opts = opts;
      return ua;
    }),
  };
  return ua;
}

beforeEach(() => { if (!(window as any).RTCPeerConnection) (window as any).RTCPeerConnection = vi.fn(); });
afterEach(() => { delete (window as any).JsSIP; delete (window as any).RTCPeerConnection; });

describe('buildWssFallbackList', () => {
  it('ignores non-WSS URLs and keeps the known WSS backups', () => {
    const list = buildWssFallbackList(cfg);
    expect(list.every((u) => u.startsWith('wss://'))).toBe(true);
    expect(list).toContain('wss://pbxnode.lemtel.tel:7443');
    expect(new Set(list).size).toBe(list.length); // no duplicates
  });

  it('honors caller-supplied WSS URLs before defaults', () => {
    const list = buildWssFallbackList({ ...cfg, wssUrls: ['wss://custom:7443'] });
    expect(list[0]).toBe('wss://pbxnode.lemtel.tel:7443');
    expect(list[1]).toBe('wss://node.lemtelcloud.net:7443');
    expect(list[2]).toBe('wss://custom:7443');
    expect(list).toContain('wss://pbxnode.lemtel.tel:7443');
  });
});

describe('createSIPUA WSS configuration', () => {
  let attempts: string[];
  let ua: any;

  beforeEach(() => {
    attempts = [];
    ua = installFakeJsSIP(attempts);
  });

  it('uses WSS sockets with the configured endpoint first', async () => {
    await createSIPUA(cfg, 200);
    expect(attempts[0]).toBe('wss://pbxnode.lemtel.tel:7443');
    expect(ua.__opts.sockets.length).toBeGreaterThan(0);
  });

  it('builds the URI as sip:<extension>@<domain>', async () => {
    await createSIPUA(cfg, 200);
    expect(ua.__opts.uri).toBe('sip:300@lemtel.lemtel.tel');
  });

  it('passes the same critical flags as the desktop provider', async () => {
    await createSIPUA(cfg, 200);
    const o = ua.__opts;
    expect(o.password).toBe('VirtualAI2026!');
    expect(o.display_name).toBe('Mobile 300');
    expect(o.register).toBe(true);
    expect(o.register_expires).toBe(300);
    expect(o.session_timers).toBe(false);
    expect(o.ws_ping_pong).toBe(true);
    expect(o.ws_ping_pong_interval).toBe(20);
    expect(o.user_agent).toMatch(/AVA Softphone/);
  });

  it('does not require WebRTC for the SIP/TLS transport', async () => {
    delete (window as any).RTCPeerConnection;
    await createSIPUA(cfg, 200);
    expect(ua.__opts.sockets.length).toBeGreaterThan(0);
  });
});
