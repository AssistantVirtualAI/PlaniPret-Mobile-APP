// Shared helpers for lead scoring / DND / reminders / pipeline
export type LeadTemp = "hot" | "warm" | "cold" | null | undefined;

export const TEMP_COLORS = {
  hot: "#E84C4C",
  warm: "#F5A623",
  cold: "#2E9BDC",
} as const;

export const TEMP_EMOJI = {
  hot: "🔥",
  warm: "🌡️",
  cold: "❄️",
} as const;

export const TEMP_LABEL = {
  hot: "Chaud",
  warm: "Tiède",
  cold: "Froid",
} as const;

export function tempFromScore(score?: number | null): LeadTemp {
  if (score == null) return null;
  if (score >= 9) return "hot";
  if (score >= 6) return "warm";
  return "cold";
}

export function tempBorder(temp: LeadTemp): string {
  if (!temp) return "3px solid transparent";
  return `3px solid ${TEMP_COLORS[temp]}`;
}

export function callbackDelayToDate(d?: string | null): Date | null {
  if (!d) return null;
  const now = new Date();
  if (d === "now") return new Date(now.getTime() + 5 * 60 * 1000);
  if (d === "2h") return new Date(now.getTime() + 2 * 3600 * 1000);
  if (d === "tomorrow_9am") {
    const t = new Date(now); t.setDate(t.getDate() + 1); t.setHours(9, 0, 0, 0); return t;
  }
  if (d === "monday_9am") {
    const t = new Date(now);
    const day = t.getDay();
    const add = day === 1 ? 7 : (8 - day) % 7 || 7;
    t.setDate(t.getDate() + add); t.setHours(9, 0, 0, 0); return t;
  }
  return null;
}

export function delayLabel(d?: string | null): string {
  if (d === "now") return "Maintenant";
  if (d === "2h") return "Dans 2h";
  if (d === "tomorrow_9am") return "Demain 9h";
  if (d === "monday_9am") return "Lundi 9h";
  return "—";
}
