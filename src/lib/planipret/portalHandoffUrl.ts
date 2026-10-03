// Origine de production : courtierai.planipret.com (proxifié vers avastatistic.ca).
// avastatistic.ca reste accepté pour les liens déjà émis.
const PORTAL_ORIGINS = ["https://courtierai.planipret.com", "https://avastatistic.ca"];
// Le lien mène directement au portail (courtier ou admin) ; l'ancienne page
// /planipret/portal-handoff reste acceptée pour les versions antérieures.
const HANDOFF_ROOTS = ["/planipret/broker", "/planipret/admin"];
const LEGACY_PATH = "/planipret/portal-handoff";
// Strict prefix: exact root or root + "/..." (rejects /planipret/brokerage, /planipret/broker-elevated, /planipret/administer).
// The role check stays server-side in pp-portal-handoff.
function allowedPath(p: string): boolean {
  if (p === LEGACY_PATH) return true;
  if (p.includes("..") || p.includes("//")) return false;
  return HANDOFF_ROOTS.some((r) => p === r || p.startsWith(r + "/"));
}

/** Accepts only the production HTTPS portal handoff URL returned by the backend. */
export function validPortalHandoffUrl(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const url = new URL(value);
    if (!PORTAL_ORIGINS.includes(url.origin) || url.protocol !== "https:" || !allowedPath(url.pathname)) return null;
    if (!url.searchParams.get("th") || !url.searchParams.get("em")) return null;
    return url.toString();
  } catch {
    return null;
  }
}
