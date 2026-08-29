import { useEffect, useState } from "react";
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
  // Vérifier aussi via le localStorage — startAuth y stocke la valeur exacte
  try {
    const stored = localStorage.getItem("pp_maestro_callback_url");
    if (stored) {
      const u = new URL(stored);
      if (u.protocol === "planipret:") return "planipret://auth/maestro/callback";
    }
  } catch { /* ignore */ }
  return `${origin}/auth/maestro/callback`;
}

export default function MaestroCallback() {
  const [params] = useSearchParams();
  const [status, setStatus] = useState<"loading" | "ok" | "error">("loading");
  const [message, setMessage] = useState<string>("Traitement de l'autorisation Maestro…");
  const [details, setDetails] = useState<Record<string, string>>({});

  useEffect(() => {
    const code = params.get("code");
    const state = params.get("state");
    const error = params.get("error");
    const errorDesc = params.get("error_description");

    if (error) {
      setStatus("error");
      setMessage(errorDesc || error);
      return;
    }
    if (!code) {
      setStatus("error");
      setMessage("Aucun code d'autorisation reçu de Maestro.");
      return;
    }

    const redirectUri = getMaestroRedirectUri();
    setDetails({ code: code.slice(0, 12) + "…", state: state ?? "—", redirect_uri: redirectUri });

    (async () => {
      try {
        const { data, error: fnErr } = await supabase.functions.invoke("maestro-oauth-callback", {
          body: { code, state, redirect_uri: redirectUri },
        });
        if (fnErr || !(data as any)?.success) {
          setStatus("error");
          setMessage((data as any)?.error ?? fnErr?.message ?? "Échec de l'échange du code.");
          return;
        }
        // Signaler aux composants qui écoutent (MaestroConnectCard) que la connexion est faite
        try { window.dispatchEvent(new Event("maestro:connected")); } catch { /* ignore */ }
        try { localStorage.setItem("pp_maestro_just_connected", String(Date.now())); } catch { /* ignore */ }
        setStatus("ok");
        setMessage("Compte Maestro connecté avec succès. Vous pouvez fermer cet onglet.");
      } catch (e: any) {
        setStatus("error");
        setMessage(e?.message ?? "Erreur inconnue");
      }
    })();
  }, [params]);

  const displayUri = getMaestroRedirectUri();

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
        {Object.keys(details).length > 0 && (
          <pre style={{ marginTop: 16, padding: 12, background: "#0b1220", border: "1px solid #1f2a44", borderRadius: 8, fontSize: 11, overflow: "auto" }}>
            {JSON.stringify(details, null, 2)}
          </pre>
        )}
        <div style={{ marginTop: 20, fontSize: 11, opacity: 0.5 }}>
          Callback: <code>{displayUri}</code>
        </div>
      </div>
    </div>
  );
}
