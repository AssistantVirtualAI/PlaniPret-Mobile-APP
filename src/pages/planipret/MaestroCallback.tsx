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
import { logDeepLink } from "@/lib/deepLinkDebug";

// Module-level dedupe: the OS may deliver the same deep link via BOTH
// getLaunchUrl() (cold start) and appUrlOpen, which remounts this route
// and would otherwise consume the same authorization code twice — Maestro
// then returns invalid_grant on the second call.
const inflightCodes = new Set<string>();
const completedCodes = new Set<string>();
// Module-level guard so remounts of this route (e.g. iOS re-firing appUrlOpen
// after Browser.close) never re-navigate — otherwise navigate({replace:true})
// spams history.replaceState and WKWebView throws
// "Attempt to use history.replaceState() more than 100 times per 10 seconds".
let navigatedAway = false;
function goHomeOnce(navigate: (p: string, o?: { replace?: boolean }) => void) {
  if (navigatedAway) return;
  navigatedAway = true;
  navigate("/mplanipret/more", { replace: true });
}

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
      toast.error(`Maestro: ${error}`);
      goHomeOnce(navigate);
      return;
    }

    if (!code) {
      // App resumed on a stale callback URL — silently return home.
      goHomeOnce(navigate);
      return;
    }

    if (completedCodes.has(code) || inflightCodes.has(code)) {
      logDeepLink({ kind: "handler", source: "MaestroCallback", detail: "duplicate deep link — skipping exchange" });
      goHomeOnce(navigate);
      return;
    }
    inflightCodes.add(code);

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

        completedCodes.add(code);
        logDeepLink({ kind: "handler", source: "MaestroCallback", detail: "token exchange OK" });
        try { window.dispatchEvent(new CustomEvent("maestro:connected")); } catch {}
        toast.success("Maestro connecté avec succès !");
      } catch (e: any) {
        logDeepLink({ kind: "error", source: "MaestroCallback", detail: e?.message || "exchange failed" });
        toast.error(`Maestro: ${e?.message || "Erreur de connexion"}`);
      } finally {
        inflightCodes.delete(code);
        goHomeOnce(navigate);
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
