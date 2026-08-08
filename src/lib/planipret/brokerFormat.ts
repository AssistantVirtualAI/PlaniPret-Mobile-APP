/** Small shared formatters for the Planiprêt broker portal. */

export function fmtDuration(seconds?: number | null): string {
  const s = Math.max(0, Math.round(seconds ?? 0));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}

export function fmtDateTime(value?: string | null, lang: "fr" | "en" = "fr"): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(lang === "en" ? "en-CA" : "fr-CA", {
    day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit",
  });
}

export function fmtDate(value?: string | null, lang: "fr" | "en" = "fr"): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(lang === "en" ? "en-CA" : "fr-CA", { day: "2-digit", month: "short" });
}

/** The other party on a call, whichever side the broker was on. */
export function callPeer(call: any): string {
  if (!call) return "—";
  if (call.direction === "inbound") return call.from_name || call.from_number || "—";
  return call.to_name || call.to_number || "—";
}

export function msgPeer(msg: any): string {
  if (!msg) return "—";
  return (msg.direction === "inbound" ? msg.from_number : msg.to_number) || "—";
}
