import { describe, it, expect, beforeEach, vi } from 'vitest';

const KEY = 'lemtel.creds.v1';
const sample = { email: 'a@b.co', extension: '300', displayName: 'X' };

describe('creds.ts — web localStorage fallback (Preferences unavailable)', () => {
  beforeEach(() => {
    vi.resetModules();
    localStorage.clear();
    // Simulate missing/no-op native plugin: methods exist but throw.
    vi.doMock('@capacitor/preferences', () => ({
      Preferences: {
        get: vi.fn().mockRejectedValue(new Error('plugin unavailable')),
        set: vi.fn().mockRejectedValue(new Error('plugin unavailable')),
        remove: vi.fn().mockRejectedValue(new Error('plugin unavailable')),
      },
    }));
  });

  it('save/get/clear round-trips via localStorage when plugin throws', async () => {
    const { saveCredentials, getCredentials, clearCredentials } = await import('./creds');
    expect(await getCredentials()).toBeNull();
    await saveCredentials(sample as any);
    expect(localStorage.getItem(KEY)).toBe(JSON.stringify(sample));
    expect(await getCredentials()).toEqual(sample);
    await clearCredentials();
    expect(localStorage.getItem(KEY)).toBeNull();
    expect(await getCredentials()).toBeNull();
  });

  it('falls back to localStorage when Preferences API is entirely absent', async () => {
    vi.resetModules();
    vi.doMock('@capacitor/preferences', () => ({ Preferences: {} }));
    const { saveCredentials, getCredentials } = await import('./creds');
    await saveCredentials(sample as any);
    expect(localStorage.getItem(KEY)).toBe(JSON.stringify(sample));
    expect(await getCredentials()).toEqual(sample);
  });
});

describe('creds.ts — native Preferences storage', () => {
  let store: Record<string, string>;
  beforeEach(() => {
    vi.resetModules();
    localStorage.clear();
    store = {};
    vi.doMock('@capacitor/preferences', () => ({
      Preferences: {
        get: vi.fn(async ({ key }: { key: string }) => ({ value: store[key] ?? null })),
        set: vi.fn(async ({ key, value }: { key: string; value: string }) => {
          store[key] = value;
        }),
        remove: vi.fn(async ({ key }: { key: string }) => {
          delete store[key];
        }),
      },
    }));
  });

  it('writes through to Preferences, not localStorage', async () => {
    const { saveCredentials, getCredentials, clearCredentials } = await import('./creds');
    await saveCredentials(sample as any);
    expect(store[KEY]).toBe(JSON.stringify(sample));
    expect(localStorage.getItem(KEY)).toBeNull();
    expect(await getCredentials()).toEqual(sample);
    await clearCredentials();
    expect(store[KEY]).toBeUndefined();
    expect(await getCredentials()).toBeNull();
  });
});

describe('creds.ts — web runtime smoke (built app, no Capacitor)', () => {
  beforeEach(() => {
    vi.resetModules();
    localStorage.clear();
    // Realistic web build: plugin module resolves but methods are inert.
    vi.doMock('@capacitor/preferences', () => ({ Preferences: undefined as any }));
  });

  it('save/get/clear works against jsdom localStorage', async () => {
    const { saveCredentials, getCredentials, clearCredentials } = await import('./creds');
    await saveCredentials({ email: 'web@x.io', extension: '301' } as any);
    const got = await getCredentials();
    expect(got?.extension).toBe('301');
    await clearCredentials();
    expect(await getCredentials()).toBeNull();
  });
});
