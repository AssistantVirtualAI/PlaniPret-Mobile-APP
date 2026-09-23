import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

/**
 * Retourne le redirect_uri qui correspond exactement à celui enregistré dans
 * planipret_maestro_oauth_states lors du startAuth.
 *
 * Sur mobile (Capacitor), startAuth envoie "planipret://auth/maestro/callback".
 * Sur web, startAuth envoie window.location.origin + "/auth/maestro/callback".
 *
 * Si le redirect_uri envoyé ici ne correspond pas à celui stocké, Maestro
 * rejette l'échange de code → le broker obtient l'ID de la machine (Carlo, 67).
 */
function getMaestroRedirectUri(): string {
  // Vérifier si on est dans un shell Capacitor natif
  // window.location.origin est "capacitor://localhost" sur Android/iOS
  // mais le redirect_uri enregistré est "planipret://auth/maestro/callback"
  const origin = window.location.origin;
  if (origin.startsWith("capacitor://") || origin.startsWith("ionic://")) {
    return "planipret://auth/maestro/callback";
  }
  return `${origin}/auth/maestro/callback`;
}

export default function MaestroCallback() {
  const [params] = useSearchParams();
  const ran = useRef(false);
  const [status, setStatus] = useState<"loading" | "ok" | "error">("loading");
  const [message, setMessage] = useState<string>("Traitement de l'autorisation Maestro…");

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    const code = params.get("code");
    const state = params.get("state");
    const error = params.get("error");
    // OAuth parameters are one-time credentials. Remove them immediately from
    // history and local storage after React has read the initial route.
    try {
      localStorage.removeItem("pp_maestro_callback_url");
      window.history.replaceState({}, "", window.location.pathname);
    } catch { /* ignore */ }

    if (error) {
      setStatus("error");
      setMessage("L’autorisation Maestro a été annulée ou refusée. Réessayez lorsque vous êtes prêt.");
      return;
    }
    if (!code) {
      setStatus("error");
      setMessage("Aucun code d'autorisation reçu de Maestro.");
      return;
    }

    const redirectUri = getMaestroRedirectUri();

    (async () => {
      try {
        const { data, error: fnErr } = await supabase.functions.invoke("maestro-oauth-callback", {
          body: { code, state, redirect_uri: redirectUri },
        });
        if (fnErr || !(data as any)?.success) {
          setStatus("error");
          setMessage("La connexion Maestro n’a pas pu être confirmée. Réessayez sans fermer l’application.");
          return;
        }
        // Signaler aux composants qui écoutent (MaestroConnectCard) que la connexion est faite
        try { window.dispatchEvent(new Event("maestro:connected")); } catch { /* ignore */ }
        try { localStorage.setItem("pp_maestro_just_connected", String(Date.now())); } catch { /* ignore */ }
        setStatus("ok");
        setMessage("Compte Maestro connecté avec succès. Vous pouvez fermer cet onglet.");
      } catch (e: any) {
        setStatus("error");
        setMessage("La connexion Maestro n’a pas pu être confirmée. Réessayez sans fermer l’application.");
      }
    })();
  }, [params]);

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#0b1220", color: "#e5e7eb", padding: 24 }}>
      <div style={{ maxWidth: 480, width: "100%", background: "#111a2e", border: "1px solid #1f2a44", borderRadius: 16, padding: 28, boxShadow: "0 20px 60px rgba(0,0,0,0.4)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
          <div style={{
            width: 44, height: 44, borderRadius: 12,
            background: status === "ok" ? "#059669" : status === "error" ? "#dc2626" : "#2563eb",
            display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22,
          }}>
            {status === "ok" ? "✓" : status === "error" ? "!" : "…"}
          </div>
          <div>
            <div style={{ fontSize: 12, opacity: 0.6, letterSpacing: 1 }}>MAESTRO OAUTH</div>
            <div style={{ fontSize: 18, fontWeight: 600 }}>Autorisation broker</div>
          </div>
        </div>
        <p style={{ fontSize: 14, lineHeight: 1.5, opacity: 0.9 }}>{message}</p>
      </div>
    </div>
  );
}
