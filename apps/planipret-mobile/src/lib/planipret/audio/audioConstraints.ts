// Phase 4.1 — WebRTC audio constraints for noise cancellation modes.
// Scoped to /mplanipret; does not affect Lemtel softphone.

export type NCMode = "standard" | "office" | "phone";

export function getAudioConstraints(mode: NCMode = "standard"): MediaStreamConstraints {
  const base: any = {
    echoCancellation: { ideal: true },
    noiseSuppression: { ideal: true },
    autoGainControl: { ideal: true },
    channelCount: { ideal: 1 },
    sampleSize: { ideal: 16 },
    latency: { ideal: 0.01 },
    suppressLocalAudioPlayback: { ideal: true },
  };
  if (mode === "phone") {
    base.sampleRate = { ideal: 8000 };
  } else {
    base.sampleRate = { ideal: 16000 };
  }
  return { audio: base, video: false };
}

export const NC_MODE_LABELS: Record<NCMode, { fr: string; en: string; desc_fr: string; desc_en: string }> = {
  standard: {
    fr: "Standard", en: "Standard",
    desc_fr: "Bonne qualité par défaut", desc_en: "Good default quality",
  },
  office: {
    fr: "Bureau", en: "Office",
    desc_fr: "Filtre clavier, climatisation, bruit ambiant", desc_en: "Filters keyboard, AC, background chatter",
  },
  phone: {
    fr: "Téléphone", en: "Phone",
    desc_fr: "Optimisé pour réseau mobile / LTE", desc_en: "Optimised for cellular / LTE",
  },
};
