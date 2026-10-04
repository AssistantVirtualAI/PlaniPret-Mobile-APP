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

function withTimeout<T>(p: Promise<T>, ms: number, code: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(code)), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}

export async function openBrokerPortal(path?: string): Promise<OpenPortalResult> {
  try {
    let session = (await withTimeout(supabase.auth.getSession(), 4000, "timeout").catch(() => ({ data: { session: null } }))).data.session;
    if (!session?.access_token) {
      const refreshed = await withTimeout(supabase.auth.refreshSession(), 6000, "timeout").catch(() => ({ data: { session: null } }));
      session = refreshed.data.session;
    }
    if (!session?.access_token) return { ok: false, error: ERRORS.not_authenticated };

    const { data, error } = await withTimeout(supabase.functions.invoke("pp-portal-handoff", {
      body: path ? { path } : {},
      headers: { Authorization: `Bearer ${session.access_token}` },
    }), 15000, "timeout");
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
      await withTimeout(Browser.close(), 800, "timeout").catch(() => undefined);
      // iOS silently ignores a presentation started while the previous Safari
      // sheet is still dismissing (open() resolves but nothing appears).
      await new Promise((r) => setTimeout(r, 700));
      try {
        await withTimeout(Browser.open({ url, presentationStyle: "fullscreen" }), 8000, "timeout");
      } catch {
        window.open(url, "_system");
      }
    } else {
      window.open(url, "_blank", "noopener,noreferrer");
    }
    return { ok: true, portal: out.portal ?? "broker" };
  } catch (e) {
    const m = (e as Error)?.message;
    return { ok: false, error: m === "timeout" ? "Le portail ne répond pas. Réessayez." : m ?? "Ouverture du portail impossible." };
  }
}
