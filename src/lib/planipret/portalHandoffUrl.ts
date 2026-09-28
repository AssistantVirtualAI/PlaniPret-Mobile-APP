// Origine de production : courtierai.planipret.com (proxifié vers avastatistic.ca).
// avastatistic.ca reste accepté pour les liens déjà émis.
const PORTAL_ORIGINS = ["https://courtierai.planipret.com", "https://avastatistic.ca"];
// Le lien mène directement au portail (courtier ou admin) ; l'ancienne page
// /planipret/portal-handoff reste acceptée pour les versions antérieures.
const HANDOFF_PATHS = ["/planipret/broker", "/planipret/admin", "/planipret/portal-handoff"];

/** Accepts only the production HTTPS portal handoff URL returned by the backend. */
export function validPortalHandoffUrl(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const url = new URL(value);
    if (!PORTAL_ORIGINS.includes(url.origin) || !HANDOFF_PATHS.includes(url.pathname)) return null;
    if (!url.searchParams.get("th") || !url.searchParams.get("em")) return null;
    return url.toString();
  } catch {
    return null;
  }
}
