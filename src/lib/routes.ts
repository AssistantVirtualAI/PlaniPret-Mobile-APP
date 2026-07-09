/**
 * Centralized route path constants.
 * Import from here everywhere — do NOT hardcode `/mplanipret` or `/planipret/admin`
 * strings in components. This prevents accidental entanglement between the
 * Planiprêt mobile app and the Planiprêt admin portal.
 */

export const ROUTES = {
  // Public
  ROOT: "/",
  LOGIN: "/login",
  RESET_PASSWORD: "/reset-password",
  PORTALS: "/portals",

  // AVA core
  DASHBOARD: "/dashboard",

  // Planiprêt MOBILE app (broker-facing PWA / Capacitor)
  MPLANIPRET: "/mplanipret",
  MPLANIPRET_HOME: "/mplanipret/home",
  MPLANIPRET_CALLS: "/mplanipret/calls",
  MPLANIPRET_MESSAGES: "/mplanipret/messages",
  MPLANIPRET_VOICEMAIL: "/mplanipret/voicemail",
  MPLANIPRET_CONTACTS: "/mplanipret/contacts",
  MPLANIPRET_MORE: "/mplanipret/more",
  MPLANIPRET_PIPELINE: "/mplanipret/pipeline",
  MPLANIPRET_SEARCH: "/mplanipret/search",
  MPLANIPRET_STATS: "/mplanipret/stats",

  // Planiprêt ADMIN portal (back-office desktop)
  PLANIPRET_ADMIN: "/planipret/admin",
  PLANIPRET_ADMIN_OVERVIEW: "/planipret/admin/overview",
  PLANIPRET_ADMIN_USERS: "/planipret/admin/users",
  PLANIPRET_ADMIN_CALLS: "/planipret/admin/calls",
  PLANIPRET_ADMIN_INTEGRATIONS: "/planipret/admin/integrations",

  PLANIPRET_PRIVACY: "/planipret/privacy",
} as const;

export const loginWithRedirect = (target: string) =>
  `${ROUTES.LOGIN}?redirect=${encodeURIComponent(target)}`;

export const getSafeRedirect = (search: string): string | null => {
  const target = new URLSearchParams(search).get("redirect");
  if (!target || !target.startsWith("/") || target.startsWith("//") || target.includes("\\")) return null;
  if (target === ROUTES.LOGIN || target.startsWith(`${ROUTES.LOGIN}?`) || target === "/auth" || target === "/post-login") return null;
  return target;
};

/** Returns true if the path belongs to the Planiprêt MOBILE app. */
export const isMplanipretPath = (path: string) =>
  path === ROUTES.MPLANIPRET || path.startsWith(`${ROUTES.MPLANIPRET}/`);

/** Returns true if the path belongs to the Planiprêt ADMIN portal. */
export const isPlanipretAdminPath = (path: string) =>
  path.startsWith("/planipret/admin");
