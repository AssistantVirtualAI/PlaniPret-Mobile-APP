/**
 * Prépare un horaire pour Microsoft Graph sans convertir une heure locale
 * demandée par le courtier en UTC avant son envoi.
 */
export function graphWallTime(value: unknown, timezone: string): string | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;

  if (!/(Z|[+-]\d{2}:\d{2})$/i.test(raw)) {
    const local = raw.replace(" ", "T").replace(/\.\d+$/, "");
    return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/.test(local) ? local : null;
  }

  const instant = new Date(raw);
  if (Number.isNaN(instant.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant).reduce((out: Record<string, string>, part) => {
    if (part.type !== "literal") out[part.type] = part.value;
    return out;
  }, {});
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}`;
}

export function addWallMinutes(wall: string, minutes: number): string {
  const base = new Date(`${wall}Z`);
  return Number.isNaN(base.getTime())
    ? wall
    : new Date(base.getTime() + minutes * 60_000).toISOString().slice(0, 19);
}
