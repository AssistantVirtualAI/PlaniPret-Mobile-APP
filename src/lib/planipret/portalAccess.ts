/**
 * Strict Microsoft-only access control for the Planiprêt portals.
 *
 * Rules enforced here (client side gate; the database RLS remains the source
 * of truth for data):
 *  - a valid Supabase session is required (verified with getUser()),
 *  - the session MUST come from a Microsoft sign-in (identity provider or the
 *    Microsoft claims stamped by `pp-ms-auth-callback`),
 *  - the account must be an @planipret address (or a platform super admin),
 *  - the Microsoft claims decide which portal the user belongs to.
 */
import { supabase } from "@/integrations/supabase/client";
/** Local copy of the portal domain rule (portal component is web-only). */
export function isPlanipretEmail(email?: string | null): boolean {
  return !!email && email.trim().toLowerCase().endsWith("@planipret.com");
}

export type PortalKind = "admin" | "broker";

export type PortalAccess =
  | { state: "anon"; reason?: string }
  | { state: "denied"; reason: string }
  | { state: "ready"; portal: PortalKind; email: string; userId: string; isAdmin: boolean };

/** True when the current session was established through Microsoft 365. */
export function isMicrosoftUser(user: any): boolean {
  if (!user) return false;
  const identities: any[] = Array.isArray(user.identities) ? user.identities : [];
  if (identities.some((i) => ["azure", "microsoft", "azuread"].includes(String(i?.provider).toLowerCase()))) return true;
  const app = user.app_metadata ?? {};
  const providers = [app.provider, ...(Array.isArray(app.providers) ? app.providers : [])]
    .filter(Boolean)
    .map((p: string) => String(p).toLowerCase());
  if (providers.some((p) => ["azure", "microsoft", "azuread"].includes(p))) return true;
  // `pp-ms-auth-callback` mints a magic-link session and stamps the origin.
  const meta = user.user_metadata ?? {};
  const stamped = String(meta.auth_provider ?? meta.provider ?? app.auth_provider ?? "").toLowerCase();
  if (["microsoft", "azure", "ms365"].includes(stamped)) return true;
  return Boolean(meta.ms_oid || meta.ms_tenant_id || meta.microsoft_id || app.ms_oid);
}

/**
 * Maps the Microsoft claims / Planiprêt role of the signed-in user to the
 * portal they should land on.
 */
export async function resolvePortalAccess(): Promise<PortalAccess> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { state: "anon" };

  const email = user.email ?? "";

  let microsoft = isMicrosoftUser(user);
  if (!microsoft) {
    // Repli : le profil Planiprêt garde la trace de la connexion Microsoft
    // (sessions émises par `pp-ms-auth-callback` avant l'estampille).
    try {
      const { data: prof } = await supabase
        .from("planipret_profiles")
        .select("auth_method, ms365_email")
        .eq("user_id", user.id)
        .maybeSingle();
      const method = String((prof as any)?.auth_method ?? "").toLowerCase();
      microsoft = method === "microsoft" || Boolean((prof as any)?.ms365_email);
    } catch { /* ignore */ }
  }
  if (!microsoft) {
    return { state: "denied", reason: "not-microsoft" };
  }


  let isSuper = false;
  try {
    const { data } = await supabase.rpc("is_super_admin", { _user_id: user.id });
    isSuper = data === true;
  } catch { /* ignore */ }

  if (!isPlanipretEmail(email) && !isSuper) {
    return { state: "denied", reason: "domain" };
  }

  let isAdmin = isSuper;
  if (!isAdmin) {
    try {
      const { data } = await supabase.rpc("is_planipret_admin", { _user_id: user.id });
      isAdmin = data === true;
    } catch { /* ignore */ }
  }
  if (!isAdmin) {
    try {
      const { data: profile } = await supabase
        .from("planipret_profiles")
        .select("role")
        .eq("user_id", user.id)
        .maybeSingle();
      const role = String((profile as any)?.role ?? "").toLowerCase();
      if (role.includes("admin")) isAdmin = true;
    } catch { /* ignore */ }
  }

  return { state: "ready", portal: isAdmin ? "admin" : "broker", email, userId: user.id, isAdmin };
}

/** Default landing path for a portal kind. */
export function portalHome(portal: PortalKind): string {
  return portal === "admin" ? "/planipret/admin/overview" : "/planipret/broker/overview";
}

/**
 * Resolves the portal path to redirect to after a Microsoft sign-in when the
 * callback could not determine the intended destination.
 */
export async function resolvePortalRedirect(fallback = "/planipret/auth-error"): Promise<string> {
  try {
    const access = await resolvePortalAccess();
    if (access.state === "ready") return portalHome(access.portal);
  } catch { /* ignore */ }
  return fallback;
}
