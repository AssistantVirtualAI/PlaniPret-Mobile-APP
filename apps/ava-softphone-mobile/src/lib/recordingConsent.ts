// Plays a short consent beep + spoken notice before a call is recorded.
// Required for Apple App Review (call-recording consent) and most jurisdictions.

const STORAGE_KEY = 'ava.recording.announceConsent';

export function getAnnounceConsent(): boolean {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === null ? true : v === '1';
  } catch {
    return true;
  }
}

export function setAnnounceConsent(enabled: boolean) {
  try {
    localStorage.setItem(STORAGE_KEY, enabled ? '1' : '0');
  } catch {}
}

export async function playRecordingConsent(lang: 'en' | 'fr' = 'fr'): Promise<void> {
  if (!getAnnounceConsent()) return;
  try {
    // Beep via WebAudio
    const Ctx: typeof AudioContext =
      (window as any).AudioContext || (window as any).webkitAudioContext;
    if (Ctx) {
      const ctx = new Ctx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = 880;
      gain.gain.value = 0.15;
      osc.connect(gain).connect(ctx.destination);
      osc.start();
      setTimeout(() => {
        try { osc.stop(); ctx.close(); } catch {}
      }, 280);
    }
    // Spoken notice via SpeechSynthesis (no extra perms, no network)
    const synth = (window as any).speechSynthesis as SpeechSynthesis | undefined;
    if (synth) {
      const msg = new SpeechSynthesisUtterance(
        lang === 'fr'
          ? 'Cet appel est enregistré.'
          : 'This call is being recorded.'
      );
      msg.lang = lang === 'fr' ? 'fr-CA' : 'en-US';
      msg.rate = 1;
      msg.volume = 0.9;
      setTimeout(() => synth.speak(msg), 320);
    }
  } catch {
    // Non-fatal: never block a call because the consent tone failed
  }
}
