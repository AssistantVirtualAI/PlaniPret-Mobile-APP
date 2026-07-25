/**
 * MaestroCallback — handles the planipret://auth/maestro/callback deep link.
 * Extracts the authorization code from the URL, calls maestro-oauth-callback
 * Edge Function to exchange it for a token, then closes the Browser plugin
 * window and redirects back to the More page.
 */
import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Capacitor } from "@capacitor/core";
import { Browser } from "@capacitor/browser";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";
import { logDeepLink } from "@/lib/deepLinkDebug";

// Module-level dedupe: the OS may deliver the same deep link via BOTH
// getLaunchUrl() (cold start) and appUrlOpen, which remounts this route
// and would otherwise consume the same authorization code twice — Maestro
// then returns invalid_grant on the second call.
const inflightCodes = new Set<string>();
const completedCodes = new Set<string>();
export default function MaestroCallback() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const ran = useRef(false);
  const navigated = useRef(false);
  const [message, setMessage] = useState("Connexion Maestro en cours…");

  const goBackToApp = (delayMs = 0) => {
    if (navigated.current) return;
    navigated.current = true;
    window.setTimeout(() => navigate("/mplanipret/home", { replace: true }), delayMs);
  };

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    const storedUrl = (() => {
      try { return localStorage.getItem("pp_maestro_callback_url"); } catch { return null; }
    })();
    const storedParams = (() => {
      if (!storedUrl) return null;
      try { return new URL(storedUrl).searchParams; } catch { return null; }
    })();

    const code = searchParams.get("code") ?? storedParams?.get("code") ?? null;
    const state = searchParams.get("state") ?? storedParams?.get("state") ?? null;
    const error = searchParams.get("error") ?? storedParams?.get("error") ?? null;

    logDeepLink({
      kind: "handler",
      source: "MaestroCallback",
      url: window.location.href,
      detail: `code=${code ? code.slice(0, 8) + "…" : "null"} state=${state ?? "null"} error=${error ?? "none"}`,
    });

    if (Capacitor.isNativePlatform()) {
      Browser.close().catch(() => {});
    }

    if (code === "TEST_DEBUG") {
      toast.success("Deep link Maestro reçu (test)");
      navigate("/mplanipret/deep-link-debug", { replace: true });
      return;
    }

    if (error) {
      setMessage(`Maestro: ${error}`);
      toast.error(`Maestro: ${error}`);
      goBackToApp(1200);
      return;
    }

    if (!code) {
      // App resumed on a stale callback URL — silently return home.
      goBackToApp();
      return;
    }

    if (completedCodes.has(code) || inflightCodes.has(code)) {
      logDeepLink({ kind: "handler", source: "MaestroCallback", detail: "duplicate deep link — skipping exchange" });
      setMessage("Maestro déjà connecté. Retour à l’accueil…");
      goBackToApp(600);
      return;
    }
    inflightCodes.add(code);

    (async () => {
      try {
        const redirectUri = Capacitor.isNativePlatform()
          ? "planipret://auth/maestro/callback"
          : `${window.location.origin}/auth/maestro/callback`;

        const callbackPromise = supabase.functions.invoke("maestro-oauth-callback", {
          body: { code, state, redirect_uri: redirectUri },
        });
        const timeoutPromise = new Promise<never>((_, reject) => {
          window.setTimeout(() => reject(new Error("timeout_maestro_callback")), 18_000);
        });
        const { data, error: fnErr } = await Promise.race([callbackPromise, timeoutPromise]);

        if (fnErr) throw fnErr;
        if (!(data as any)?.success) throw new Error((data as any)?.error || "token_exchange_failed");

        completedCodes.add(code);
        logDeepLink({ kind: "handler", source: "MaestroCallback", detail: "token exchange OK" });
        try { localStorage.removeItem("pp_maestro_callback_url"); } catch {}
        try { window.dispatchEvent(new CustomEvent("maestro:connected")); } catch {}
        setMessage("Maestro connecté. Retour à l’accueil…");
        toast.success("Maestro connecté avec succès !");
      } catch (e: any) {
        logDeepLink({ kind: "error", source: "MaestroCallback", detail: e?.message || "exchange failed" });
        setMessage("Connexion Maestro interrompue. Retour à l’accueil…");
        toast.error(`Maestro: ${e?.message || "Erreur de connexion"}`);
      } finally {
        inflightCodes.delete(code);
        goBackToApp(900);
      }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="fixed inset-0 flex items-center justify-center" style={{ background: "var(--pp-bg-base, #0A1628)" }}>
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: "#a855f7" }} />
        <p style={{ color: "var(--pp-text-secondary, #94a3b8)", fontSize: 14 }}>
          {message}
        </p>
      </div>
    </div>
  );
}
