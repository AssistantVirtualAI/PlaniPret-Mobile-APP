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

export type OpenPortalResult = { ok: true; portal: "admin" | "broker" } | { ok: false; error: string };

const ERRORS: Record<string, string> = {
  not_authenticated: "Session expirée. Reconnectez-vous à l'application.",
  no_planipret_profile: "Aucun profil Planiprêt associé à ce compte.",
};

export async function openBrokerPortal(path?: string): Promise<OpenPortalResult> {
  try {
    const { data, error } = await supabase.functions.invoke("pp-portal-handoff", {
      body: path ? { path } : {},
    });
    const out = data as { ok?: boolean; url?: string; portal?: "admin" | "broker"; error?: string } | null;
    if (error || !out?.ok || !out.url) {
      const code = out?.error ?? error?.message ?? "unknown";
      return { ok: false, error: ERRORS[code] ?? "Ouverture du portail impossible. Réessayez." };
    }

    if (Capacitor.isNativePlatform()) {
      // Navigateur système (in-app browser) : garde l'app mobile en arrière-plan.
      const { Browser } = await import("@capacitor/browser");
      await Browser.open({ url: out.url, presentationStyle: "popover" });
    } else {
      window.open(out.url, "_blank", "noopener,noreferrer");
    }
    return { ok: true, portal: out.portal ?? "broker" };
  } catch (e) {
    return { ok: false, error: (e as Error)?.message ?? "Ouverture du portail impossible." };
  }
}
