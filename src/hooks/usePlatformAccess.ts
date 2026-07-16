import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type PlatformKind = "web" | "desktop" | "mobile";

export interface PlatformAccess {
  loading: boolean;
  app: boolean;
  desktop: boolean;
  mobile: boolean;
  /** Returns true if the given platform is allowed. */
  allows: (p: PlatformKind) => boolean;
}

/**
 * Phase 0 platform/role guard.
 *
 * Reads pbx_softphone_users.{app_access_enabled, desktop_access_enabled,
 * mobile_access_enabled} for the current user. Defaults to allow when the
 * row is missing (mirrors the existing my_app_access_allowed SQL helper).
 */
export function usePlatformAccess(): PlatformAccess {
  const [state, setState] = useState<Omit<PlatformAccess, "allows">>({
    loading: true, app: true, desktop: true, mobile: true,
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        if (!cancelled) setState({ loading: false, app: false, desktop: false, mobile: false });
        return;
      }
      const { data } = await supabase
        .from("pbx_softphone_users")
        .select("app_access_enabled, desktop_access_enabled, mobile_access_enabled")
        .eq("portal_user_id", user.id);
      if (cancelled) return;
      if (!data || data.length === 0) {
        setState({ loading: false, app: true, desktop: true, mobile: true });
        return;
      }
      // Any softphone row enabling a platform is enough.
      const app     = data.some((r) => r.app_access_enabled !== false);
      const desktop = app && data.some((r) => r.desktop_access_enabled !== false);
      const mobile  = app && data.some((r) => r.mobile_access_enabled  !== false);
      setState({ loading: false, app, desktop, mobile });
    })();
    return () => { cancelled = true; };
  }, []);

  return {
    ...state,
    allows: (p) => p === "desktop" ? state.desktop : p === "mobile" ? state.mobile : state.app,
  };
}
