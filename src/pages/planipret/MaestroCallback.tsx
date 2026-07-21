/**
 * MaestroCallback — handles the planipret://auth/maestro/callback deep link.
 * Extracts the authorization code from the URL, calls maestro-oauth-callback
 * Edge Function to exchange it for a token, then closes the Browser plugin
 * window and redirects back to the More page.
 */
import { useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Capacitor } from "@capacitor/core";
import { Browser } from "@capacitor/browser";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";

export default function MaestroCallback() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    const code = searchParams.get("code");
    const state = searchParams.get("state");
    const error = searchParams.get("error");

    // Close the SFSafariViewController if on native
    if (Capacitor.isNativePlatform()) {
      Browser.close().catch(() => {});
    }

    if (error) {
      toast.error(`Maestro: ${error}`);
      navigate("/mplanipret/more", { replace: true });
      return;
    }

    if (!code) {
      toast.error("Maestro: code manquant");
      navigate("/mplanipret/more", { replace: true });
      return;
    }

    // Exchange the code
    (async () => {
      try {
        const redirectUri = Capacitor.isNativePlatform()
          ? "planipret://auth/maestro/callback"
          : `${window.location.origin}/auth/maestro/callback`;

        const { data, error: fnErr } = await supabase.functions.invoke("maestro-oauth-callback", {
          body: { code, state, redirect_uri: redirectUri },
        });

        if (fnErr) throw fnErr;
        if (!(data as any)?.success) throw new Error((data as any)?.error || "token_exchange_failed");

        toast.success("Maestro connecté avec succès !");
      } catch (e: any) {
        toast.error(`Maestro: ${e?.message || "Erreur de connexion"}`);
      } finally {
        navigate("/mplanipret/more", { replace: true });
      }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="fixed inset-0 flex items-center justify-center" style={{ background: "var(--pp-bg-base, #0A1628)" }}>
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: "#a855f7" }} />
        <p style={{ color: "var(--pp-text-secondary, #94a3b8)", fontSize: 14 }}>
          Connexion Maestro en cours…
        </p>
      </div>
    </div>
  );
}
