/**
 * Server-side portal destination policy.
 * The mobile caller may suggest a portal path, but only an authenticated admin
 * may receive an admin destination. Every other profile is constrained to the
 * broker portal.
 */
export function resolvePlanipretPortalTarget(isAdmin, requestedPath) {
  const brokerHome = "/planipret/broker";
  const adminHome = "/planipret/admin";
  const target = typeof requestedPath === "string" ? requestedPath : "";

  if (isAdmin && /^\/planipret\/admin(\/|$)/.test(target)) return target;
  if (/^\/planipret\/broker(\/|$)/.test(target)) return target;
  return isAdmin ? adminHome : brokerHome;
}
