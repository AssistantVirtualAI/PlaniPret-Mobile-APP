/**
 * Consommation du lien magique « app mobile → portail AVA Statistic ».
 *
 * Le lien à usage unique (th/em) peut arriver sur n'importe quelle page du
 * portail (/planipret/broker, /planipret/admin ou l'ancienne page
 * /planipret/portal-handoff). Ce helper établit la session, marque la
 * connexion comme fraîche pour le garde du portail, puis efface le jeton de
 * l'URL et de l'historique du navigateur.
 */
import { supabase } from "@/integrations/supabase/client";

export type HandoffResult = "none" | "ok" | "error";

// Le jeton est à usage unique : on empêche toute double consommation
// (StrictMode, remontage, rechargement de version).
let handoffRan = false;

export function resetPortalHandoffForTests() {
  handoffRan = false;
}

/** Lit les paramètres du pont (query d'abord — iOS peut perdre le fragment). */
export function readHandoffParams(): { tokenHash: string; email: string } | null {
  const fragmentParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const queryParams = new URLSearchParams(window.location.search);
  const params = fragmentParams.has("th") ? fragmentParams : queryParams;
  const tokenHash = params.get("th") ?? "";
  const email = params.get("em") ?? "";
  if (!tokenHash || !email) return null;
  return { tokenHash, email };
}

/**
 * Si l'URL courante porte un lien magique, l'échange contre une session.
 * Retourne "none" quand il n'y a rien à consommer.
 */
export async function consumePortalHandoff(): Promise<HandoffResult> {
  const params = readHandoffParams();
  if (!params) return "none";
  if (handoffRan) return "ok";
  handoffRan = true;

  const { tokenHash, email } = params;

  // Le jeton est effacé immédiatement : il ne doit pas rester dans
  // l'historique du navigateur.
  try { window.history.replaceState({}, "", window.location.pathname); } catch { /* ignore */ }

  const hasSession = async () => {
    const { data } = await supabase.auth.getSession();
    return !!data.session?.user;
  };

  // Un `token_hash` issu de `generateLink` se vérifie SANS courriel :
  // joindre `email` fait basculer GoTrue sur le flux « code à 6 chiffres »
  // et le jeton est refusé (« Token has expired or is invalid »).
  let otpError: { message?: string } | null = null;
  for (const type of ["magiclink", "email"] as const) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash } as never);
    if (!error) { otpError = null; break; }
    otpError = error;
  }
  // Dernier recours : ancien flux avec courriel explicite.
  if (otpError) {
    const { error } = await supabase.auth.verifyOtp({ type: "magiclink", token_hash: tokenHash, email } as never);
    if (!error) otpError = null;
  }

  if (otpError && !(await hasSession())) {
    handoffRan = false;
    return "error";
  }

  try { sessionStorage.setItem("pp_portal_just_signed_in", String(Date.now())); } catch { /* ignore */ }
  return "ok";
}
