/**
 * MaestroCallback — handles the planipret://auth/maestro/callback deep link.
 * Extracts the authorization code from the URL, calls maestro-oauth-callback
 * Edge Function to exchange it for a token, then closes the Browser plugin
 * window and redirects back to the More page.
 *
 * Fix (2026-07-25): Added hard 25s safety timeout + manual "Retour" button
 * so the screen never stays blocked indefinitely. Also improved the
 * "no code" case: on iOS, the deep link sometimes arrives with the code in
 * localStorage but not yet in searchParams — we now wait 800ms before
 * giving up to let the URL hydrate.
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
  const [showManualReturn, setShowManualReturn] = useState(false);

  const goBackToApp = (delayMs = 0) => {
    if (navigated.current) return;
    navigated.current = true;
    window.setTimeout(() => navigate("/mplanipret/home", { replace: true }), delayMs);
  };

  // Safety net: if nothing has navigated after 25s, show a manual return button
  // and force navigation after 30s. This prevents the screen from being stuck
  // forever if the edge function hangs or the deep link is malformed.
  useEffect(() => {
    const showTimer = window.setTimeout(() => setShowManualReturn(true), 12_000);
    const forceTimer = window.setTimeout(() => {
      logDeepLink({ kind: "error", source: "MaestroCallback", detail: "safety timeout — forcing navigation" });
      goBackToApp();
    }, 30_000);
    return () => {
      window.clearTimeout(showTimer);
      window.clearTimeout(forceTimer);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    const run = async () => {
      // On iOS, the deep link URL sometimes arrives in localStorage before
      // searchParams is populated (WKWebView URL hydration delay). Wait a
      // short tick to let both sources settle.
      await new Promise((r) => window.setTimeout(r, 150));

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
        detail: `code=${code ? code.slice(0, 8) + "…" : "null"} state=${state ?? "null"} error=${error ?? "none"} stored=${storedUrl ? "yes" : "no"}`,
      });

      // Always close the in-app browser — do it early so the user sees the app
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
        goBackToApp(1500);
        return;
      }

      if (!code) {
        // No code found — could be a stale resume or a missing deep link.
        // Show the manual return button immediately instead of silently navigating.
        logDeepLink({ kind: "error", source: "MaestroCallback", detail: "no code found — showing manual return" });
        setMessage("Code d'autorisation manquant. Appuyez sur Retour.");
        setShowManualReturn(true);
        // Still auto-navigate after 5s
        goBackToApp(5_000);
        return;
      }

      if (completedCodes.has(code) || inflightCodes.has(code)) {
        logDeepLink({ kind: "handler", source: "MaestroCallback", detail: "duplicate deep link — skipping exchange" });
        setMessage("Maestro déjà connecté. Retour à l'accueil…");
        goBackToApp(600);
        return;
      }
      inflightCodes.add(code);

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
        setMessage("Maestro connecté ! Retour à l'accueil…");
        toast.success("Maestro connecté avec succès !");
        // Navigate immediately — don't wait for the finally block.
        // This prevents the spinner from staying visible after success.
        goBackToApp(200);
      } catch (e: any) {
        logDeepLink({ kind: "error", source: "MaestroCallback", detail: e?.message || "exchange failed" });
        setMessage(`Connexion interrompue : ${e?.message || "erreur"}. Retour à l'accueil…`);
        toast.error(`Maestro: ${e?.message || "Erreur de connexion"}`);
      } finally {
        inflightCodes.delete(code);
        // goBackToApp is a no-op if already called in the try block (navigated.current guard).
        // For errors, navigate after 1.5s so the user can read the error message.
        goBackToApp(1500);
      }
    };

    run();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="fixed inset-0 flex items-center justify-center" style={{ background: "var(--pp-bg-base, #0A1628)" }}>
      <div className="flex flex-col items-center gap-4">
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: "#a855f7" }} />
        <p style={{ color: "var(--pp-text-secondary, #94a3b8)", fontSize: 14, textAlign: "center", maxWidth: 280 }}>
          {message}
        </p>
        {showManualReturn && (
          <button
            onClick={() => { navigated.current = false; goBackToApp(); }}
            style={{
              marginTop: 8,
              padding: "10px 24px",
              borderRadius: 8,
              background: "#a855f7",
              color: "white",
              fontSize: 14,
              fontWeight: 600,
              border: "none",
              cursor: "pointer",
            }}
          >
            ← Retour à l'accueil
          </button>
        )}
      </div>
    </div>
  );
}
