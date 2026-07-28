// Lemtel mobile — user preferences for audio capture (noise cancellation)
// and network handover (Wi-Fi ↔ LTE). Values are persisted in localStorage
// under the `ava.*` namespace and consumed by useSoftphone.ts (capture
// constraints) and nativeAutoReconnect.ts (handover behaviour).

export type NCMode = 'standard' | 'office' | 'phone';

const K = {
  ncEnabled: 'ava.nc_enabled',
  ncMode: 'ava.nc_mode',
  autoHandover: 'ava.autoHandover',
  preferWifi: 'ava.preferWifi',
  backgroundCalls: 'ava.backgroundCalls',
} as const;

function readBool(key: string, dflt: boolean): boolean {
  try {
    const v = localStorage.getItem(key);
    if (v === null) return dflt;
    return v === 'on' || v === '1' || v === 'true';
  } catch { return dflt; }
}
function writeBool(key: string, v: boolean) {
  try { localStorage.setItem(key, v ? 'on' : 'off'); } catch {}
}

export const audioPrefs = {
  ncEnabled: () => readBool(K.ncEnabled, true),
  setNcEnabled: (v: boolean) => writeBool(K.ncEnabled, v),

  ncMode: (): NCMode => {
    try { return (localStorage.getItem(K.ncMode) as NCMode) || 'standard'; }
    catch { return 'standard'; }
  },
  setNcMode: (m: NCMode) => { try { localStorage.setItem(K.ncMode, m); } catch {} },

  autoHandover: () => readBool(K.autoHandover, true),
  setAutoHandover: (v: boolean) => writeBool(K.autoHandover, v),

  preferWifi: () => readBool(K.preferWifi, true),
  setPreferWifi: (v: boolean) => writeBool(K.preferWifi, v),

  backgroundCalls: () => readBool(K.backgroundCalls, true),
  setBackgroundCalls: (v: boolean) => writeBool(K.backgroundCalls, v),
};

/**
 * Build getUserMedia constraints based on the current NC preference and mode.
 * When NC is disabled we hand the raw mic stream to the SIP stack. Modes:
 *  - standard: 16 kHz mono, WebRTC AEC/NS/AGC on.
 *  - office:   same as standard + Chromium hints for keyboard/highpass.
 *  - phone:    8 kHz mono, tuned for weak cellular links.
 */
export function getAudioConstraints(): MediaStreamConstraints {
  const enabled = audioPrefs.ncEnabled();
  const mode = audioPrefs.ncMode();
  if (!enabled) {
    return {
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        channelCount: 1,
      } as any,
      video: false,
    };
  }
  const base: any = {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
    channelCount: 1,
    sampleSize: 16,
    sampleRate: mode === 'phone' ? 8000 : 16000,
    googEchoCancellation: true,
    googNoiseSuppression: true,
    googAutoGainControl: true,
  };
  if (mode === 'office') {
    base.googHighpassFilter = true;
    base.googTypingNoiseDetection = true;
    base.googNoiseSuppression2 = true;
  }
  return { audio: base, video: false };
}
