const PORTAL_ORIGIN = "https://avastatistic.ca";
const HANDOFF_PATH = "/planipret/portal-handoff";

/** Accepts only the production HTTPS portal handoff URL returned by the backend. */
export function validPortalHandoffUrl(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const url = new URL(value);
    if (url.origin !== PORTAL_ORIGIN || url.pathname !== HANDOFF_PATH) return null;
    if (!url.searchParams.get("th") || !url.searchParams.get("em")) return null;
    return url.toString();
  } catch {
    return null;
  }
}
