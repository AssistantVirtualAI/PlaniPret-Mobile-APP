/**
 * Ouvre le portail AVA Statistic du courtier depuis l'application mobile.
 *
 * Le courtier est déjà authentifié dans l'app : `pp-portal-handoff` émet pour
 * lui-même un lien magique à usage unique (5 min) vers son propre portail
 * (admin ou courtier). Le lien s'ouvre dans le navigateur système, la session
 * y est établie automatiquement — aucune ressaisie Microsoft.
 */
import { Capacitor, registerPlugin } from "@capacitor/core";
import { supabase } from "@/integrations/supabase/client";
import { validPortalHandoffUrl } from "@/lib/planipret/portalHandoffUrl";
import { tr } from "@/lib/i18n/tr";

export type OpenPortalResult = { ok: true; portal: "admin" | "broker" } | { ok: false; error: string };

type PortalExternalPlugin = {
  open(options: { url: string }): Promise<{ ok: boolean }>;
};

// Le Browser Capacitor confirme parfois l'appel sans présenter sa feuille sur
// certains iPhone/Android. Le plugin Planiprêt utilise donc directement le
// navigateur système, après la même validation stricte effectuée ci-dessous.
const PortalExternal = registerPlugin<PortalExternalPlugin>("PpPortalExternal");

const errorText = (code: string): string | undefined => ({
  not_authenticated: tr("Session expirée. Reconnectez-vous à l'application.", "Session expired. Sign in to the app again."),
  no_planipret_profile: tr("Aucun profil Planiprêt associé à ce compte.", "No Planiprêt profile is linked to this account."),
  handoff_stamp_failed: tr("Connexion directe temporairement indisponible. Réessayez.", "Direct sign-in temporarily unavailable. Try again."),
  link_failed: tr("Le lien de connexion n'a pas pu être créé. Réessayez.", "The sign-in link could not be created. Try again."),
  handoff_failed: tr("Ouverture du portail impossible pour le moment. Réessayez.", "Unable to open the portal right now. Try again."),
} as Record<string, string>)[code];

const SAFE_CODE = /^[a-z_]{1,40}$/;
const SAFE_ID = /^[0-9a-f-]{8,64}$/i;

/** User-facing failure text: known message + normalized code + tracking id. Never raw provider text. */
export function portalFailureMessage(code: string | undefined, correlationId?: string): string {
  const c = code && SAFE_CODE.test(code) ? code : "unknown";
  const base = errorText(c) ?? tr("Lien du portail invalide. Réessayez.", "Invalid portal link. Try again.");
  const parts = [c === "unknown" ? base : `${base} (${c})`];
  if (correlationId && SAFE_ID.test(correlationId)) parts.push(tr(`No de suivi : ${correlationId}`, `Tracking no: ${correlationId}`));
  return parts.join(" — ");
}

function withTimeout<T>(p: Promise<T>, ms: number, code: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(code)), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}

async function openNativePortal(url: string): Promise<void> {
  const isNativeExternalPluginAvailable = (Capacitor as typeof Capacitor & {
    isPluginAvailable?: (name: string) => boolean;
  }).isPluginAvailable?.("PpPortalExternal") === true;

  if (isNativeExternalPluginAvailable) {
    const result = await withTimeout(PortalExternal.open({ url }), 8000, "timeout");
    if (!result?.ok) throw new Error("system_browser_unavailable");
    return;
  }

  // Compatibilité avec un ancien binaire sans le plugin dédié : ce chemin
  // reste volontairement secondaire; il ne masque jamais un échec du plugin.
  const { Browser } = await import("@capacitor/browser");
  await withTimeout(Browser.close(), 800, "timeout").catch(() => undefined);
  await new Promise((r) => setTimeout(r, 700));
  await withTimeout(Browser.open({ url, presentationStyle: "fullscreen" }), 8000, "timeout");
}

export async function openBrokerPortal(path?: string): Promise<OpenPortalResult> {
  try {
    let session = (await withTimeout(supabase.auth.getSession(), 4000, "timeout").catch(() => ({ data: { session: null } }))).data.session;
    if (!session?.access_token) {
      const refreshed = await withTimeout(supabase.auth.refreshSession(), 6000, "timeout").catch(() => ({ data: { session: null } }));
      session = refreshed.data.session;
    }
    if (!session?.access_token) return { ok: false, error: portalFailureMessage("not_authenticated") };

    const { data, error } = await withTimeout(supabase.functions.invoke("pp-portal-handoff", {
      body: path ? { path } : {},
      headers: { Authorization: `Bearer ${session.access_token}` },
    }), 15000, "timeout");
    const out = data as { ok?: boolean; url?: string; portal?: "admin" | "broker"; error?: string; correlation_id?: string } | null;
    const url = validPortalHandoffUrl(out?.url);
    if (error || !out?.ok || !url) {
      return { ok: false, error: portalFailureMessage(out?.error, out?.correlation_id) };
    }

    if (Capacitor.isNativePlatform()) {
      await openNativePortal(url);
    } else {
      window.open(url, "_blank", "noopener,noreferrer");
    }
    return { ok: true, portal: out.portal ?? "broker" };
  } catch (e) {
    const m = (e as Error)?.message;
    return { ok: false, error: m === "timeout" ? tr("Le portail ne répond pas. Réessayez.", "The portal is not responding. Try again.") : tr("Ouverture du portail impossible.", "Unable to open the portal.") };
  }
}
