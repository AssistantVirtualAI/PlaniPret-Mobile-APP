// Incoming-call ringtone + vibration.
//
// Plays a classic two-tone ring (440/480Hz cadence 2s on / 4s off) via
// WebAudio and triggers a haptic pulse on each ring so the device still
// signals when set to vibrate. Uses the same AudioContext lifecycle as
// the ringback module — primed once on first user gesture.

import { Capacitor } from '@capacitor/core';
import { getRingVolume, isVibrationEnabled } from './ringPreferences';

let audioCtx: AudioContext | null = null;
let ringInterval: ReturnType<typeof setInterval> | null = null;
let active = false;

function ensureCtx(): AudioContext | null {
  if (audioCtx) return audioCtx;
  try {
    const Ctor: any = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (Ctor) audioCtx = new Ctor();
  } catch { /* ignore */ }
  return audioCtx;
}

async function vibratePulse() {
  if (!isVibrationEnabled()) return;
  if (!Capacitor.isNativePlatform()) {
    try { (navigator as any)?.vibrate?.([400, 200, 400]); } catch {}
    return;
  }
  try {
    const { Haptics } = await import('@capacitor/haptics');
    // Three short pulses ≈ phone ringing-in pattern.
    await Haptics.vibrate({ duration: 400 });
    setTimeout(() => Haptics.vibrate({ duration: 400 }).catch(() => {}), 700);
    setTimeout(() => Haptics.vibrate({ duration: 400 }).catch(() => {}), 1400);
  } catch {}
}

function playOnce() {
  // Always honor the vibration toggle even when audio is silent.
  void vibratePulse();
  const volume = getRingVolume();
  if (volume <= 0) return;
  const ctx = ensureCtx();
  if (!ctx) return;
  if (ctx.state === 'suspended') { void ctx.resume(); }
  try {
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gain = ctx.createGain();
    osc1.frequency.value = 440;
    osc2.frequency.value = 480;
    gain.gain.value = Math.min(0.35, 0.35 * volume);
    osc1.connect(gain); osc2.connect(gain); gain.connect(ctx.destination);
    const t0 = ctx.currentTime;
    osc1.start(t0); osc2.start(t0);
    osc1.stop(t0 + 2); osc2.stop(t0 + 2);
  } catch (e) {
    console.warn('[incomingRing] play failed', e);
  }
}

export function startIncomingRing(): void {
  if (active) return;
  active = true;
  playOnce();
  ringInterval = setInterval(playOnce, 6000);
  console.log('[incomingRing] started');
}

export function stopIncomingRing(): void {
  if (!active) return;
  active = false;
  if (ringInterval) { clearInterval(ringInterval); ringInterval = null; }
  console.log('[incomingRing] stopped');
}
