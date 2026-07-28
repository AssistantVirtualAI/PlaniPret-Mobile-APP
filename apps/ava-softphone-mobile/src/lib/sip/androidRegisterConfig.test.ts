import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    getPlatform: () => 'android',
    isNativePlatform: () => true,
  },
}));

describe('Android JsSIP REGISTER config', () => {
  beforeEach(() => {
    vi.resetModules();
    (window as any).JsSIP = {
      WebSocketInterface: vi.fn().mockImplementation((url: string) => ({ url })),
      UA: vi.fn().mockImplementation((opts: any) => ({ __opts: opts, on: vi.fn(), start: vi.fn(), stop: vi.fn() })),
    };
  });

  afterEach(() => {
    delete (window as any).JsSIP;
    vi.restoreAllMocks();
  });

  it('keeps Via on WSS and never enables hack_via_tcp on Android', async () => {
    const { createSIPUA } = await import('./jssipProvider');
    const ua = await createSIPUA({
      extension: '300',
      password: 'pw',
      domain: 'lemtel.lemtel.tel',
      wssUrl: 'wss://credential.example.com:7443',
    }, 200);

    expect((ua as any).__opts.hack_via_tcp).toBe(false);
    expect((ua as any).__opts.hack_wss_in_transport).toBe(true);
    expect((ua as any).__opts.contact_uri).toContain('transport=wss');
  });
});