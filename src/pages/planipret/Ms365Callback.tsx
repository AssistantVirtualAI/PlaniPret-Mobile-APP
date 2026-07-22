import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Capacitor } from "@capacitor/core";
import { supabase } from "@/integrations/supabase/client";
import { CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { clearRememberedMs365RedirectUri, getRememberedMs365CodeVerifier, getRememberedMs365RedirectUri } from "@/lib/ms365OAuth";
import { clearMicrosoftSignInIntent, getMicrosoftSignInIntent, getMicrosoftSignInNext } from "@/lib/ms365AuthLogin";

async function getSessionWithRetry() {
  for (let i = 0; i < 8; i += 1) {
    const { data: { session } } = await supabase.auth.getSession();
    if (session) return session;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return null;
}

export default function Ms365Callback() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState<"loading" | "ok" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  // Guard against React StrictMode double-invocation which would consume the
  // OAuth code twice (first call succeeds, second call gets invalid_grant).
  const ranRef = useRef(false);

  useEffect(() => {
    if (ranRef.current) return;
    ranRef.current = true;

    (async () => {
      // On iOS/Android: close the SFSafariViewController / Chrome Custom Tab immediately
      // so the app comes back to the foreground before processing the OAuth code.
      if (Capacitor.isNativePlatform()) {
        try {
          const { Browser } = await import("@capacitor/browser");
          await Browser.close();
        } catch { /* ignore on web */ }
      }
      const code = params.get("code");
      const err = params.get("error_description") ?? params.get("error");
      if (err) { setStatus("error"); setError(err); return; }
      if (!code) { setStatus("error"); setError("Code OAuth manquant"); return; }

      // Must match the redirect URI registered in Azure App Registration.
      const redirect_uri = getRememberedMs365RedirectUri();
      const state = params.get("state");
      const code_verifier = getRememberedMs365CodeVerifier(state);

      // Log for debugging redirect_uri mismatch with Azure
      console.log("[ms365-callback] exchange", { redirect_uri, has_code_verifier: !!code_verifier, intent: getMicrosoftSignInIntent() });

      if (!code_verifier) {
        setStatus("error");
        setError("PKCE code_verifier manquant — veuillez réessayer la connexion");
        return;
      }

      if (getMicrosoftSignInIntent() === "login") {
        // Use raw fetch to capture the body even on non-2xx responses
        let data: any = null;
        let fetchErr: string | null = null;
        try {
          const { data: { session: currentSession } } = await supabase.auth.getSession();
          const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "";
          const supabaseUrl = import.meta.env.VITE_SUPABASE_URL ?? "";
          const fnUrl = `${supabaseUrl}/functions/v1/ms365-auth-session`;
          const headers: Record<string, string> = {
            "Content-Type": "application/json",
            "apikey": anonKey,
          };
          if (currentSession?.access_token) headers["Authorization"] = `Bearer ${currentSession.access_token}`;
          const res = await fetch(fnUrl, { method: "POST", headers, body: JSON.stringify({ code, redirect_uri, code_verifier }) });
          data = await res.json().catch(() => null);
          if (!res.ok && !data) fetchErr = `HTTP ${res.status}`;
        } catch (err: any) {
          fetchErr = err?.message ?? "Réseau indisponible";
        }
        if (fetchErr || !data?.success) {
          const details = data?.details;
          const msg = data?.error ?? fetchErr ?? "Échec OAuth";
          const full = details ? `${msg} — ${details.error_description ?? details.error ?? ""}`.trim() : msg;
          console.error("ms365 auth failed", { data, fetchErr });
          setStatus("error"); setError(full);
          return;
        }
        const verify = await supabase.auth.verifyOtp({ type: "magiclink", email: (data as any).email, token_hash: (data as any).token_hash });
        if (verify.error) { setStatus("error"); setError(verify.error.message); return; }
        clearRememberedMs365RedirectUri();
        const next = getMicrosoftSignInNext("/mplanipret");
        clearMicrosoftSignInIntent();
        try { void import("@/lib/native/requestPermissionsAfterLogin").then(m => m.requestPermissionsAfterLogin()); } catch {}
        setStatus("ok");
        setTimeout(() => navigate(next, { replace: true }), 700);
        return;
      }

      const session = await getSessionWithRetry();
      if (!session) { setStatus("error"); setError("Session expirée — reconnectez-vous"); return; }
      const { data, error: e } = await supabase.functions.invoke("ms365-oauth-exchange", { body: { code, redirect_uri, code_verifier } });
      if (e || !(data as any)?.success) {
        const details = (data as any)?.details;
        const msg = (data as any)?.error ?? e?.message ?? "Échec OAuth";
        const full = details ? `${msg} — ${details.error_description ?? details.error ?? ""}`.trim() : msg;
        console.error("ms365 exchange failed", { data, e });
        setStatus("error"); setError(full);
        return;
      }
      clearRememberedMs365RedirectUri();
      try { localStorage.removeItem("pp_ms365_callback_url"); } catch {}
      // Active automatiquement l'abonnement AVA aux nouveaux courriels (non-bloquant)
      supabase.functions.invoke("ms365-mail-webhook-setup", { body: {} }).then(({ error }) => {
        if (error) console.warn("ms365 webhook setup skipped", error.message);
      }).catch((err) => console.warn("ms365 webhook setup skipped", err?.message ?? err));
      setStatus("ok");
      setTimeout(() => navigate("/mplanipret/more?ms365=ok", { replace: true }), 1200);
    })();
  }, [params, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
      <div className="bg-white rounded-xl shadow p-6 max-w-md w-full text-center">
        {status === "loading" && (<><Loader2 className="w-8 h-8 mx-auto animate-spin text-blue-600 mb-3" /><p className="text-slate-700">Connexion à Microsoft 365…</p></>)}
        {status === "ok" && (<><CheckCircle2 className="w-10 h-10 mx-auto text-emerald-600 mb-3" /><p className="font-semibold text-slate-800">Microsoft 365 connecté avec succès ✅</p><p className="text-xs text-slate-500 mt-2">Redirection…</p></>)}
        {status === "error" && (<><AlertCircle className="w-10 h-10 mx-auto text-red-600 mb-3" /><p className="font-semibold text-slate-800">Erreur de connexion</p><p className="text-xs text-slate-500 mt-2">{error}</p><button onClick={() => navigate("/mplanipret/more")} className="mt-4 px-4 py-2 text-sm bg-slate-100 rounded-lg">Retour</button></>)}
      </div>
    </div>
  );
}
