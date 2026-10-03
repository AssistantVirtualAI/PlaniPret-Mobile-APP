/** Localized, human-readable recurrence for a Maestro task. Returns null when unknown. */
const UNITS = {
  day: { fr1: "Chaque jour", frN: (n: number) => `Tous les ${n} jours`, en1: "Every day", enN: (n: number) => `Every ${n} days` },
  week: { fr1: "Chaque semaine", frN: (n: number) => `Toutes les ${n} semaines`, en1: "Every week", enN: (n: number) => `Every ${n} weeks` },
  month: { fr1: "Chaque mois", frN: (n: number) => `Tous les ${n} mois`, en1: "Every month", enN: (n: number) => `Every ${n} months` },
  year: { fr1: "Chaque année", frN: (n: number) => `Tous les ${n} ans`, en1: "Every year", enN: (n: number) => `Every ${n} years` },
} as const;

export function recurrenceLabel(
  task: { is_recurring?: boolean; recurring_pattern?: string | null; recurring_value?: number | null },
  lang: "fr" | "en",
): string | null {
  if (!task?.is_recurring) return null;
  const p = String(task.recurring_pattern ?? "").trim().toLowerCase() as keyof typeof UNITS;
  const u = UNITS[p];
  if (!u) return null;
  if (task.recurring_value == null) return null;
  const raw = Number(task.recurring_value);
  if (!Number.isInteger(raw) || raw < 1) return null;
  if (raw === 1) return lang === "en" ? u.en1 : u.fr1;
  return lang === "en" ? u.enN(raw) : u.frN(raw);
}
