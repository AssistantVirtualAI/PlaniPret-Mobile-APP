/**
 * Atterrissage du pont « app mobile → portail AVA Statistic ».
 *
 * L'app mobile ouvre cette page avec un lien magique à usage unique placé dans
 * le fragment d'URL (jamais dans la query, donc jamais journalisé côté serveur).
 * On établit la session, on marque la connexion comme fraîche pour le garde du
 * portail, puis on redirige vers la page demandée.
 */
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, ShieldAlert } from "lucide-react";

// Le jeton est à usage unique : on empêche toute double consommation
// (StrictMode, remontage, rechargement de version).
let handoffRan = false;

export default function PortalHandoff() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (handoffRan) return;
    handoffRan = true;
    (async () => {
      const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
      const tokenHash = params.get("th") ?? "";
      const email = params.get("em") ?? "";
      const to = params.get("to") ?? "/planipret/broker/overview";

      // Le fragment est effacé immédiatement : le jeton ne doit pas rester
      // dans l'historique du navigateur.
      try { window.history.replaceState({}, "", window.location.pathname); } catch { /* ignore */ }

      const hasSession = async () => {
        const { data } = await supabase.auth.getSession();
        return !!data.session?.user;
      };

      if (!tokenHash || !email) {
        // Déjà connecté dans ce navigateur : on entre directement.
        if (await hasSession()) {
          try { sessionStorage.setItem("pp_portal_just_signed_in", String(Date.now())); } catch { /* ignore */ }
          navigate(to.startsWith("/planipret/") ? to : "/planipret/broker/overview", { replace: true });
          return;
        }
        setError("Lien incomplet ou expiré. Relancez l'ouverture depuis l'application mobile.");
        return;
      }

      const { error: otpError } = await supabase.auth.verifyOtp({
        type: "magiclink",
        token_hash: tokenHash,
        email,
      } as never);

      if (otpError && !(await hasSession())) {
        setError("Lien expiré ou déjà utilisé. Relancez l'ouverture depuis l'application mobile.");
        return;
      }


      try { sessionStorage.setItem("pp_portal_just_signed_in", String(Date.now())); } catch { /* ignore */ }
      navigate(to.startsWith("/planipret/") ? to : "/planipret/broker/overview", { replace: true });
    })();
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-background text-foreground">
      <div className="max-w-sm w-full text-center space-y-4">
        {error ? (
          <>
            <ShieldAlert className="w-8 h-8 mx-auto text-destructive" />
            <p className="text-sm text-muted-foreground">{error}</p>
            <button
              onClick={() => navigate("/planipret/broker/overview", { replace: true })}
              className="text-sm underline"
            >
              Ouvrir le portail manuellement
            </button>
          </>
        ) : (
          <>
            <Loader2 className="w-8 h-8 mx-auto animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Ouverture de votre portail sécurisé…</p>
          </>
        )}
      </div>
    </div>
  );
}
