// User-configurable ring/ringback preferences.
//
// Stored in localStorage so they persist across launches. Both the incoming
// ringtone module and the outgoing ringback module read `getRingVolume()` /
// `isVibrationEnabled()` on every play tick so changes take effect live.

const VOL_KEY = 'ava:ring:volume';        // 0..1
const VIB_KEY = 'ava:ring:vibration';     // '1' | '0'

export interface RingPreferences {
  /** 0..1 — multiplier applied to oscillator gain (default 0.6). */
  volume: number;
  /** Whether the device should vibrate on incoming calls (default true). */
  vibration: boolean;
}

const DEFAULTS: RingPreferences = { volume: 0.6, vibration: true };

const listeners = new Set<(p: RingPreferences) => void>();

function read(): RingPreferences {
  try {
    const v = localStorage.getItem(VOL_KEY);
    const vib = localStorage.getItem(VIB_KEY);
    return {
      volume: v != null ? clamp01(parseFloat(v)) : DEFAULTS.volume,
      vibration: vib != null ? vib === '1' : DEFAULTS.vibration,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return DEFAULTS.volume;
  return Math.max(0, Math.min(1, n));
}

export function getRingPreferences(): RingPreferences { return read(); }
export function getRingVolume(): number { return read().volume; }
export function isVibrationEnabled(): boolean { return read().vibration; }

export function setRingVolume(v: number): void {
  const next = clamp01(v);
  try { localStorage.setItem(VOL_KEY, String(next)); } catch {}
  emit();
}

export function setVibrationEnabled(on: boolean): void {
  try { localStorage.setItem(VIB_KEY, on ? '1' : '0'); } catch {}
  emit();
}

export function onRingPreferencesChange(cb: (p: RingPreferences) => void): () => void {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

function emit(): void {
  const snap = read();
  listeners.forEach((l) => { try { l(snap); } catch {} });
}
