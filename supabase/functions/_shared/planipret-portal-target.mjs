/**
 * Server-side portal destination policy.
 * Only clean, canonical paths under /planipret/broker or /planipret/admin are
 * kept. Admin paths require an authenticated admin. Anything ambiguous falls
 * back to the role's default destination and is never echoed back.
 */
const BROKER_HOME = "/planipret/broker";
const ADMIN_HOME = "/planipret/admin";

function isCleanUnder(path, root) {
  if (path !== root && !path.startsWith(root + "/")) return false;
  const rest = path.slice(root.length);
  if (rest === "") return true;
  const segments = rest.slice(1).split("/");
  return segments.every((s) => /^[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)*$/.test(s));
}

function isSafePath(path) {
  if (typeof path !== "string" || path.length === 0 || path.length > 512) return false;
  if (!path.startsWith("/")) return false;
  if (/[?#\\%\s]/.test(path)) return false;
  if (path.includes("//")) return false;
  return true;
}

export function resolvePlanipretPortalTarget(isAdmin, requestedPath) {
  const home = isAdmin === true ? ADMIN_HOME : BROKER_HOME;
  if (!isSafePath(requestedPath)) return home;
  if (isAdmin === true && isCleanUnder(requestedPath, ADMIN_HOME)) return requestedPath;
  if (isCleanUnder(requestedPath, BROKER_HOME)) return requestedPath;
  return home;
}
