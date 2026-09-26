/**
 * Ouvre le portail AVA Statistic du courtier depuis l'application mobile.
 *
 * Le courtier est déjà authentifié dans l'app : `pp-portal-handoff` émet pour
 * lui-même un lien magique à usage unique (5 min) vers son propre portail
 * (admin ou courtier). Le lien s'ouvre dans le navigateur système, la session
 * y est établie automatiquement — aucune ressaisie Microsoft.
 */
import { Capacitor } from "@capacitor/core";
import { supabase } from "@/integrations/supabase/client";
import { validPortalHandoffUrl } from "@/lib/planipret/portalHandoffUrl";

export type OpenPortalResult = { ok: true; portal: "admin" | "broker" } | { ok: false; error: string };

const ERRORS: Record<string, string> = {
  not_authenticated: "Session expirée. Reconnectez-vous à l'application.",
  no_planipret_profile: "Aucun profil Planiprêt associé à ce compte.",
  handoff_stamp_failed: "Connexion directe temporairement indisponible. Réessayez.",
};

export async function openBrokerPortal(path?: string): Promise<OpenPortalResult> {
  try {
    let { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) {
      const refreshed = await supabase.auth.refreshSession();
      session = refreshed.data.session;
    }
    if (!session?.access_token) return { ok: false, error: ERRORS.not_authenticated };

    const { data, error } = await supabase.functions.invoke("pp-portal-handoff", {
      body: path ? { path } : {},
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    const out = data as { ok?: boolean; url?: string; portal?: "admin" | "broker"; error?: string } | null;
    const url = validPortalHandoffUrl(out?.url);
    if (error || !out?.ok || !url) {
      const code = out?.error ?? error?.message ?? "unknown";
      return { ok: false, error: ERRORS[code] ?? "Lien du portail invalide. Réessayez." };
    }

    if (Capacitor.isNativePlatform()) {
      // iOS rend parfois la présentation « popover » comme une feuille blanche.
      // Une vue plein écran garantit que le portail et sa redirection de session
      // disposent d'une vraie surface de navigation.
      const { Browser } = await import("@capacitor/browser");
      // Safari may still be retained by a previous external flow (OAuth, help,
      // or a former portal opening). Close it first; Browser.open otherwise
      // rejects a valid HTTPS URL with “Unable to display URL” on iOS.
      await Browser.close().catch(() => undefined);
      await Browser.open({
        url,
        presentationStyle: "fullscreen",
      });
    } else {
      window.open(url, "_blank", "noopener,noreferrer");
    }
    return { ok: true, portal: out.portal ?? "broker" };
  } catch (e) {
    return { ok: false, error: (e as Error)?.message ?? "Ouverture du portail impossible." };
  }
}
