import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Capacitor } from "@capacitor/core";
import { Browser } from "@capacitor/browser";
import { ROUTES } from "@/lib/routes";

// Where the user came from: MaestroConnectCard lives on the mobile "More" tab.
const RETURN_ROUTE = `${ROUTES.MPLANIPRET}/more`;
// Long enough to read the success message, short enough not to feel stuck.
const AUTO_RETURN_MS = 2_000;

// Module-level dedupe: prevents double-exchange when the deep link is
// delivered via both launchUrl and appUrlOpen (cold start).
const inflightCodes = new Set<string>();
const completedCodes = new Set<string>();
// Guard remounts (iOS re-fires appUrlOpen after Browser.close) so
// navigate({replace:true}) doesn't spam history.replaceState.
let navigatedAway = false;

export default function MaestroCallback() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const ran = useRef(false);
  const [status, setStatus] = useState<"loading" | "ok" | "error">("loading");
  const [message, setMessage] = useState<string>("Traitement de l'autorisation Maestro…");
  const [details, setDetails] = useState<Record<string, string>>({});
  const isNativeApp = Capacitor.isNativePlatform();

  // Single exit path. On native this screen is rendered INSIDE the app WebView
  // (origin is capacitor://localhost), so there is no tab to close and no browser
  // chrome to go back with: without an explicit navigation the user is trapped and
  // has to kill the app from the multitasking switcher.
  const returnToApp = useCallback(() => {
    if (isNativeApp) {
      // No-op when the page was not opened through the in-app browser.
      void Browser.close().catch(() => { /* not opened via Browser.open */ });
    }
    navigatedAway = true;
    navigate(RETURN_ROUTE, { replace: true });
  }, [isNativeApp, navigate]);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

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
      if (!navigatedAway) { navigatedAway = true; navigate("/", { replace: true }); }
      return;
    }

    if (completedCodes.has(code) || inflightCodes.has(code)) {
      setStatus("ok");
      setMessage("Autorisation déjà traitée.");
      return;
    }
    inflightCodes.add(code);

    setDetails({ code: code.slice(0, 12) + "…", state: state ?? "—" });

    (async () => {
      try {
        const isNative = Capacitor.isNativePlatform();
        const redirect_uri = isNative
          ? "planipret://auth/maestro/callback"
          : `${window.location.origin}/auth/maestro/callback`;
        const { data, error: fnErr } = await supabase.functions.invoke("maestro-oauth-callback", {
          body: { code, state, redirect_uri },
        });
        if (fnErr || !(data as any)?.success) {
          setStatus("error");
          setMessage((data as any)?.error ?? fnErr?.message ?? "Échec de l'échange du code.");
          return;
        }
        completedCodes.add(code);
        setStatus("ok");
        setMessage(
          Capacitor.isNativePlatform()
            ? "Compte Maestro connecté avec succès. Retour à l'application…"
            : "Compte Maestro connecté avec succès. Vous pouvez fermer cet onglet.",
        );
      } catch (e: any) {
        setStatus("error");
        setMessage(e?.message ?? "Erreur inconnue");
      } finally {
        inflightCodes.delete(code);
      }
    })();
  }, [params, navigate]);

  // Auto-return on success. Previously the component stopped here and rendered a
  // dead-end card: no button, no navigation, no browser chrome.
  useEffect(() => {
    if (status !== "ok") return;
    const timer = window.setTimeout(returnToApp, AUTO_RETURN_MS);
    return () => window.clearTimeout(timer);
  }, [status, returnToApp]);

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
        {/* Always reachable, including on error: the error branch used to be a
            dead end too. */}
        {status !== "loading" && (
          <button
            type="button"
            onClick={returnToApp}
            style={{
              marginTop: 20, width: "100%", padding: "14px 16px",
              background: status === "error" ? "#1f2a44" : "#059669",
              color: "#f9fafb", border: "none", borderRadius: 12,
              fontSize: 15, fontWeight: 600, cursor: "pointer",
              WebkitTapHighlightColor: "transparent",
            }}
          >
            {status === "error" ? "Retour à l'application" : "Continuer"}
          </button>
        )}
        {/* The raw capacitor://localhost callback is internal plumbing; showing it
            only confused the "close this tab" instruction. Web only. */}
        {!isNativeApp && (
          <div style={{ marginTop: 20, fontSize: 11, opacity: 0.5 }}>
            Callback: <code>{window.location.origin}/auth/maestro/callback</code>
          </div>
        )}
      </div>
    </div>
  );
}
