// Simple, reliable local ringback (440 + 480 Hz) used when the PBX does
// not send early media. Replaces the previous ramped/cadenced implementation
// which was fragile on iOS WKWebView and could leave the AudioContext stuck.

import { getRingVolume } from './ringPreferences';

let audioCtx: AudioContext | null = null;
let ringInterval: ReturnType<typeof setInterval> | null = null;


export function primeRingbackContext(): void {
  if (audioCtx) return;
  try {
    const Ctor: any = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (Ctor) audioCtx = new Ctor();
  } catch { /* ignore */ }
}

export function startRingback(): void {
  if (!audioCtx) primeRingbackContext();
  if (!audioCtx) { console.warn('[ringback] no AudioContext'); return; }
  if (audioCtx.state === 'suspended') { void audioCtx.resume(); }
  stopRingback();

  const playRing = () => {
    if (!audioCtx) return;
    try {
      const osc1 = audioCtx.createOscillator();
      const osc2 = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc1.frequency.value = 440;
      osc2.frequency.value = 480;
      const v = getRingVolume();
      gain.gain.value = Math.min(0.3, 0.25 * v);
      osc1.connect(gain); osc2.connect(gain); gain.connect(audioCtx.destination);
      osc1.start();
      osc2.start();
      osc1.stop(audioCtx.currentTime + 2);
      osc2.stop(audioCtx.currentTime + 2);
    } catch (e) {
      console.warn('[ringback] playRing failed', e);
    }
  };

  playRing();
  ringInterval = setInterval(playRing, 6000);
  console.log('[ringback] started');
}

export function stopRingback(_reason: string = 'manual'): void {
  if (ringInterval) { clearInterval(ringInterval); ringInterval = null; }
}

export function describeEndReason(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const r = String(raw).toLowerCase();
  if (r.includes('486') || r.includes('busy')) return 'Ligne occupée';
  if (r.includes('603') || r.includes('decline')) return 'Appel refusé';
  if (r.includes('480') || r.includes('unavailable')) return 'Destinataire indisponible';
  if (r.includes('408') || r.includes('timeout') || r.includes('request timeout')) return 'Pas de réponse';
  if (r.includes('487') || r.includes('cancel')) return 'Appel annulé';
  if (r.includes('404')) return 'Numéro introuvable';
  if (r.includes('403')) return 'Appel interdit';
  if (r.includes('remote_bye')) return 'Le correspondant a raccroché';
  if (r.includes('local_hangup')) return null;
  if (/\b5\d\d\b/.test(r)) return 'Erreur serveur PBX';
  return null;
}
