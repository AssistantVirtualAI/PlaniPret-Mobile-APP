// Planipret mobile — in-app ringtone presets for inbound SIP calls.
// Distinct from the native phone ringtone: rendered with Web Audio so no assets
// are required. Selection persisted in localStorage under `pp_ringtone`.

export type RingStep = {
  /** Frequencies played simultaneously (Hz). Empty array = silence. */
  freqs: number[];
  /** Duration of the step in ms. */
  ms: number;
  /** Oscillator shape. */
  type?: OscillatorType;
};

export type RingtonePreset = {
  id: string;
  label: { fr: string; en: string };
  /** Sequence played once per cycle. */
  steps: RingStep[];
  /** Gap before the sequence repeats (ms). */
  gapMs: number;
  volume: number;
};

export const RINGTONE_PRESETS: RingtonePreset[] = [
  {
    id: "classic",
    label: { fr: "Classique (440/480)", en: "Classic (440/480)" },
    steps: [{ freqs: [440, 480], ms: 2000 }],
    gapMs: 4000,
    volume: 0.16,
  },
  {
    id: "digital",
    label: { fr: "Numérique", en: "Digital" },
    steps: [
      { freqs: [880], ms: 160 },
      { freqs: [], ms: 90 },
      { freqs: [1174], ms: 160 },
      { freqs: [], ms: 90 },
      { freqs: [880], ms: 160 },
    ],
    gapMs: 1400,
    volume: 0.14,
  },
  {
    id: "chime",
    label: { fr: "Carillon", en: "Chime" },
    steps: [
      { freqs: [659], ms: 260, type: "triangle" },
      { freqs: [784], ms: 260, type: "triangle" },
      { freqs: [988], ms: 420, type: "triangle" },
    ],
    gapMs: 1600,
    volume: 0.15,
  },
  {
    id: "marimba",
    label: { fr: "Marimba", en: "Marimba" },
    steps: [
      { freqs: [523], ms: 180, type: "sine" },
      { freqs: [659], ms: 180, type: "sine" },
      { freqs: [784], ms: 180, type: "sine" },
      { freqs: [1046], ms: 300, type: "sine" },
    ],
    gapMs: 1200,
    volume: 0.15,
  },
  {
    id: "pulse",
    label: { fr: "Pulsation", en: "Pulse" },
    steps: [
      { freqs: [600], ms: 120, type: "square" },
      { freqs: [], ms: 120 },
      { freqs: [600], ms: 120, type: "square" },
      { freqs: [], ms: 120 },
      { freqs: [600], ms: 120, type: "square" },
    ],
    gapMs: 1500,
    volume: 0.1,
  },
  {
    id: "office",
    label: { fr: "Bureau (double)", en: "Office (double)" },
    steps: [
      { freqs: [440, 480], ms: 800 },
      { freqs: [], ms: 300 },
      { freqs: [440, 480], ms: 800 },
    ],
    gapMs: 2600,
    volume: 0.16,
  },
  {
    id: "silent",
    label: { fr: "Silencieux (vibration)", en: "Silent (vibrate only)" },
    steps: [],
    gapMs: 2000,
    volume: 0,
  },
];

export const RINGTONE_KEY = "pp_ringtone";
export const RINGTONE_VOLUME_KEY = "pp_ringtone_volume";
export const RINGTONE_VIBRATE_KEY = "pp_ringtone_vibrate";
export const DEFAULT_RINGTONE_ID = "classic";

export function getRingtonePreset(id?: string | null): RingtonePreset {
  return (
    RINGTONE_PRESETS.find((p) => p.id === id) ??
    RINGTONE_PRESETS.find((p) => p.id === DEFAULT_RINGTONE_ID)!
  );
}

export function getSelectedRingtone(): RingtonePreset {
  try {
    return getRingtonePreset(localStorage.getItem(RINGTONE_KEY));
  } catch {
    return getRingtonePreset(DEFAULT_RINGTONE_ID);
  }
}

export function getRingtoneVolume(): number {
  try {
    const v = Number(localStorage.getItem(RINGTONE_VOLUME_KEY));
    return Number.isFinite(v) && v > 0 && v <= 1 ? v : 1;
  } catch {
    return 1;
  }
}

export function isVibrateEnabled(): boolean {
  try {
    return localStorage.getItem(RINGTONE_VIBRATE_KEY) !== "0";
  } catch {
    return true;
  }
}

/**
 * Plays a ringtone preset in a loop. Returns a stop() function.
 * Safe to call in browsers without Web Audio (no-op).
 */
export function playRingtonePreset(
  preset: RingtonePreset,
  opts: { loop?: boolean; volumeScale?: number } = {},
): () => void {
  const Ctx = (window.AudioContext || (window as any).webkitAudioContext) as
    | typeof AudioContext
    | undefined;
  const scale = opts.volumeScale ?? 1;
  if (!Ctx || preset.steps.length === 0 || preset.volume <= 0 || scale <= 0) return () => {};

  let ctx: AudioContext;
  try {
    ctx = new Ctx();
  } catch {
    return () => {};
  }
  ctx.resume?.().catch(() => {});

  let killed = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const cycle = () => {
    if (killed) return;
    let t = ctx.currentTime + 0.02;
    for (const step of preset.steps) {
      const dur = step.ms / 1000;
      if (step.freqs.length) {
        const g = ctx.createGain();
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(preset.volume * scale, t + 0.02);
        g.gain.setValueAtTime(preset.volume * scale, t + Math.max(dur - 0.04, 0.02));
        g.gain.linearRampToValueAtTime(0, t + dur);
        g.connect(ctx.destination);
        for (const f of step.freqs) {
          const o = ctx.createOscillator();
          o.type = step.type ?? "sine";
          o.frequency.value = f;
          o.connect(g);
          o.start(t);
          o.stop(t + dur);
        }
      }
      t += dur;
    }
    const totalMs = preset.steps.reduce((s, x) => s + x.ms, 0) + preset.gapMs;
    if (opts.loop !== false) timer = setTimeout(cycle, totalMs);
  };

  cycle();

  return () => {
    killed = true;
    if (timer) clearTimeout(timer);
    try {
      ctx.close();
    } catch {
      /* noop */
    }
  };
}

/** Plays the user's selected ringtone (respecting volume + vibration prefs). */
export function startSelectedRingtone(): () => void {
  const preset = getSelectedRingtone();
  const stopAudio = playRingtonePreset(preset, { volumeScale: getRingtoneVolume() });
  let vibTimer: ReturnType<typeof setInterval> | null = null;
  if (isVibrateEnabled()) {
    const buzz = () => {
      try {
        (navigator as any).vibrate?.([400, 200, 400]);
      } catch {
        /* noop */
      }
    };
    buzz();
    vibTimer = setInterval(buzz, 3000);
  }
  return () => {
    stopAudio();
    if (vibTimer) clearInterval(vibTimer);
    try {
      (navigator as any).vibrate?.(0);
    } catch {
      /* noop */
    }
  };
}
