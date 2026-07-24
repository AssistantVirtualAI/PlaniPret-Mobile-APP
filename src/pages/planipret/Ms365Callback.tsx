import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { clearRememberedMs365RedirectUri, getRememberedMs365CodeVerifier, getRememberedMs365RedirectUri } from "@/lib/ms365OAuth";
import { clearMs365Pending } from "@/lib/ms365Pending";
import { clearMicrosoftSignInIntent, getMicrosoftSignInIntent, getMicrosoftSignInNext } from "@/lib/ms365AuthLogin";

async function getSessionWithRetry() {
  for (let i = 0; i < 8; i += 1) {
    const { data: { session } } = await supabase.auth.getSession();
    if (session) return session;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return null;
}

/**
 * Retry getting the code_verifier up to maxAttempts times with a delay.
 * On iOS, @capacitor/preferences may need a few ms after app resume to be ready.
 */
async function getCodeVerifierWithRetry(state: string | null, maxAttempts = 6, delayMs = 200): Promise<string | null> {
  for (let i = 0; i < maxAttempts; i++) {
    const v = await getRememberedMs365CodeVerifier(state);
    if (v) return v;
    if (i < maxAttempts - 1) await new Promise(r => setTimeout(r, delayMs));
  }
  return null;
}

export default function Ms365Callback() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState<"loading" | "ok" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const ranRef = useRef(false);

  const goBack = () => {
    try { window.history.replaceState(null, "", "/mplanipret"); } catch {}
    navigate("/mplanipret", { replace: true });
  };

  useEffect(() => {
    if (ranRef.current) return;
    ranRef.current = true;
    (async () => {
      // Close the in-app browser first so the user sees the loading state
      try {
        const { Browser } = await import("@capacitor/browser");
        await Browser.close();
      } catch {}

      clearMs365Pending();

      const code = params.get("code");
      const err = params.get("error_description") ?? params.get("error");
      if (err) { setStatus("error"); setError(err); return; }
      if (!code) { setStatus("error"); setError("Code OAuth manquant"); return; }

      // Must match the redirect URI registered in Azure App Registration.
      const redirect_uri = await getRememberedMs365RedirectUri();
      const state = params.get("state");

      // Retry up to 6 times (1.2s total) — iOS may need a moment after app resume
      // before @capacitor/preferences is readable.
      const code_verifier = await getCodeVerifierWithRetry(state, 6, 200);
      if (!code_verifier) {
        setStatus("error");
        setError("Connexion Microsoft interrompue — appuyez sur Retour puis réessayez.");
        return;
      }

      const intent = getMicrosoftSignInIntent();

      // ── LOGIN FLOW (new user or first sign-in) ──────────────────────────────
      if (intent === "login") {
        const { data, error: e } = await supabase.functions.invoke("pp-ms-auth-callback", {
          body: { code, redirect_uri, code_verifier },
        });
        if (e || !(data as any)?.success) {
          const details = (data as any)?.details;
          const msg = (data as any)?.error ?? e?.message ?? "Échec OAuth";
          const full = details ? `${msg} — ${details.error_description ?? details.error ?? ""}`.trim() : msg;
          console.error("ms365 auth failed", { data, e });
          setStatus("error"); setError(full);
          return;
        }
        // token_hash may be absent if the edge function already set the session cookie
        if ((data as any)?.token_hash) {
          const verify = await supabase.auth.verifyOtp({ type: "magiclink", token_hash: (data as any).token_hash });
          if (verify.error) { setStatus("error"); setError(verify.error.message); return; }
        }
        // Wait for Supabase session to be confirmed before navigating
        const session = await getSessionWithRetry();
        if (!session) { setStatus("error"); setError("Session introuvable après connexion — réessayez."); return; }
        clearRememberedMs365RedirectUri();
        const next = getMicrosoftSignInNext("/mplanipret");
        clearMicrosoftSignInIntent();
        try { void import("@/lib/native/requestPermissionsAfterLogin").then(m => m.requestPermissionsAfterLogin()); } catch {}
        setStatus("ok");
        // Navigate immediately — no artificial delay
        navigate(next, { replace: true });
        return;
      }

      // ── CONNECT FLOW (existing user linking MS365) ──────────────────────────
      const session = await getSessionWithRetry();
      if (!session) { setStatus("error"); setError("Session expirée — reconnectez-vous"); return; }
      const { data, error: e } = await supabase.functions.invoke("pp-ms-auth-callback", {
        body: { code, redirect_uri, code_verifier },
      });
      if (e || !(data as any)?.success) {
        const details = (data as any)?.details;
        const msg = (data as any)?.error ?? e?.message ?? "Échec OAuth";
        const full = details ? `${msg} — ${details.error_description ?? details.error ?? ""}`.trim() : msg;
        console.error("ms365 exchange failed", { data, e });
        setStatus("error"); setError(full);
        return;
      }
      if ((data as any)?.token_hash) {
        const verify = await supabase.auth.verifyOtp({ type: "magiclink", token_hash: (data as any).token_hash });
        if (verify.error) { setStatus("error"); setError(verify.error.message); return; }
      }
      clearRememberedMs365RedirectUri();
      try { localStorage.removeItem("pp_ms365_callback_url"); } catch {}
      // Activate AVA email webhook subscription (non-blocking)
      supabase.functions.invoke("ms365-mail-webhook-setup", { body: {} }).then(({ error }) => {
        if (error) console.warn("ms365 webhook setup skipped", error.message);
      }).catch((err) => console.warn("ms365 webhook setup skipped", err?.message ?? err));
      setStatus("ok");
      // Navigate immediately to /mplanipret (home) — no artificial delay
      navigate("/mplanipret", { replace: true });
    })();
  }, [params, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: "#0A1425" }}>
      <div className="rounded-2xl shadow-xl p-8 max-w-sm w-full text-center" style={{ background: "#1A2A45", border: "1px solid rgba(46,155,220,0.25)" }}>
        {status === "loading" && (
          <>
            <div className="w-14 h-14 mx-auto mb-4 rounded-full flex items-center justify-center" style={{ background: "rgba(0,120,212,0.15)" }}>
              <Loader2 className="w-7 h-7 animate-spin" style={{ color: "#0078D4" }} />
            </div>
            <p className="font-semibold text-base" style={{ color: "#E8F0FE" }}>Connexion à Microsoft 365…</p>
            <p className="text-xs mt-1" style={{ color: "#6B8CAE" }}>Veuillez patienter</p>
          </>
        )}
        {status === "ok" && (
          <>
            <div className="w-14 h-14 mx-auto mb-4 rounded-full flex items-center justify-center" style={{ background: "rgba(16,185,129,0.15)" }}>
              <CheckCircle2 className="w-7 h-7" style={{ color: "#10B981" }} />
            </div>
            <p className="font-semibold text-base" style={{ color: "#E8F0FE" }}>Connexion réussie ✅</p>
            <p className="text-xs mt-1" style={{ color: "#6B8CAE" }}>Redirection vers l'application…</p>
          </>
        )}
        {status === "error" && (
          <>
            <div className="w-14 h-14 mx-auto mb-4 rounded-full flex items-center justify-center" style={{ background: "rgba(239,68,68,0.15)" }}>
              <AlertCircle className="w-7 h-7" style={{ color: "#EF4444" }} />
            </div>
            <p className="font-semibold text-base" style={{ color: "#E8F0FE" }}>Erreur de connexion</p>
            <p className="text-xs mt-2" style={{ color: "#6B8CAE" }}>{error}</p>
            <button
              type="button"
              onClick={goBack}
              className="mt-5 px-5 py-2.5 rounded-xl text-sm font-semibold"
              style={{ background: "#0078D4", color: "white" }}
            >
              Retour
            </button>
          </>
        )}
      </div>
    </div>
  );
}
