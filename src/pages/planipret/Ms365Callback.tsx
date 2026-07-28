import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { clearRememberedMs365RedirectUri, getRememberedMs365CodeVerifier, getRememberedMs365RedirectUri } from "@/lib/ms365OAuth";
import { clearMs365Pending } from "@/lib/ms365Pending";
import { clearMicrosoftSignInIntentAsync, getMicrosoftSignInIntentAsync, getMicrosoftSignInNextAsync } from "@/lib/ms365AuthLogin";
import { markOAuthCallbackCompleted } from "@/lib/deepLinkDebug";

async function getSessionWithRetry() {
  for (let i = 0; i < 8; i += 1) {
    const sessionResult = await Promise.race([
      supabase.auth.getSession(),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 900)),
    ]);
    const session = sessionResult && "data" in sessionResult ? sessionResult.data.session : null;
    if (session) return session;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return null;
}

function closeNativeBrowserSoon() {
  void import("@capacitor/browser")
    .then(({ Browser }) => Browser.close())
    .catch(() => {});
}

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timeout`)), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export default function Ms365Callback() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState<"loading" | "ok" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const ranRef = useRef(false);
  const lastCodeRef = useRef<string | null>(null);
  // Reset ranRef when a new OAuth code arrives so the exchange always runs
  const currentCode = params.get("code");
  if (currentCode && currentCode !== lastCodeRef.current) {
    ranRef.current = false;
    lastCodeRef.current = currentCode;
  }

  async function invokeAndParse(fn: string, body: unknown): Promise<{ data: any; errMsg: string | null }> {
    const { data, error: e } = await withTimeout(
      supabase.functions.invoke(fn, { body: body as any }),
      25000,
      fn,
    );
    if (!e) return { data, errMsg: null };
    let parsed: any = null;
    try {
      const res = (e as any)?.context as Response | undefined;
      if (res && typeof res.text === "function") {
        const txt = await res.text();
        try { parsed = JSON.parse(txt); } catch { parsed = { error: txt }; }
      }
    } catch {}
    const details = parsed?.details;
    const msg = parsed?.error ?? e.message ?? "Échec OAuth";
    const full = details ? `${msg} — ${details.error_description ?? details.error ?? ""}`.trim() : msg;
    return { data: parsed, errMsg: full };
  }

  const goBack = () => {
    try { window.history.replaceState(null, "", "/mplanipret/more"); } catch {}
    navigate("/mplanipret/more", { replace: true });
  };

  useEffect(() => {
    if (ranRef.current) return;
    ranRef.current = true;
    (async () => {
      closeNativeBrowserSoon();
      clearMs365Pending();
      const code = params.get("code");
      const err = params.get("error_description") ?? params.get("error");
      if (err) { setStatus("error"); setError(err); return; }
      // If user re-opens the app and lands on the callback route without a fresh code,
      // silently redirect to home instead of showing an error.
      if (!code) { navigate("/mplanipret/home", { replace: true }); return; }
      // Must match the redirect URI registered in Azure App Registration.
      const redirect_uri = await getRememberedMs365RedirectUri();
      const state = params.get("state");
      const code_verifier = await getRememberedMs365CodeVerifier(state);
      if (!code_verifier) {
        // Verifier not found — show a clear error so the user can retry instead of silently failing
        setStatus("error");
        setError("Session expirée — veuillez réessayer la connexion Microsoft depuis Paramètres");
        return;
      }
      const isMicrosoftLogin = (await getMicrosoftSignInIntentAsync()) === "login" || Boolean(state?.startsWith("login:"));
      if (isMicrosoftLogin) {
        const { data, errMsg } = await invokeAndParse("pp-ms-auth-callback", { code, redirect_uri, code_verifier });
        if (errMsg || !(data as any)?.success) {
          console.error("ms365 auth failed", { data, errMsg, redirect_uri });
          setStatus("error"); setError(errMsg ?? (data as any)?.error ?? "Échec OAuth");
          return;
        }
        const verify = await supabase.auth.verifyOtp({ type: "magiclink", token_hash: (data as any).token_hash });
        if (verify.error) { setStatus("error"); setError(verify.error.message); return; }
        const hydratedSession = verify.data?.session ?? await getSessionWithRetry();
        if (!hydratedSession?.access_token) { setStatus("error"); setError("Session Microsoft non finalisée — reconnectez-vous"); return; }
        clearRememberedMs365RedirectUri();
        markOAuthCallbackCompleted("ms365", window.location.search);
        try { localStorage.removeItem("pp_ms365_callback_url"); } catch {}
        const next = await getMicrosoftSignInNextAsync("/mplanipret/home");
        await clearMicrosoftSignInIntentAsync();
        try { void import("@/lib/native/requestPermissionsAfterLogin").then(m => m.requestPermissionsAfterLogin()); } catch {}
        setStatus("ok");
        navigate(next, { replace: true });
        return;
      }
      const session = await getSessionWithRetry();
      if (!session) { setStatus("error"); setError("Session expirée — reconnectez-vous"); return; }
      const { data, error: exchangeError } = await withTimeout(
        supabase.functions.invoke("ms365-oauth-exchange", {
          body: { code, redirect_uri, code_verifier },
          headers: { Authorization: `Bearer ${session.access_token}` },
        }),
        25000,
        "ms365-oauth-exchange",
      );
      const errMsg = exchangeError?.message ?? null;
      if (errMsg || !(data as any)?.success) {
        console.error("ms365 exchange failed", { data, errMsg });
        setStatus("error"); setError(errMsg ?? (data as any)?.error ?? "Échec OAuth");
        return;
      }
      clearRememberedMs365RedirectUri();
      markOAuthCallbackCompleted("ms365", window.location.search);
      try { localStorage.removeItem("pp_ms365_callback_url"); } catch {}
      // Active automatiquement l'abonnement AVA aux nouveaux courriels (non-bloquant)
      supabase.functions.invoke("ms365-mail-webhook-setup", { body: {} }).then(({ error }) => {
        if (error) console.warn("ms365 webhook setup skipped", error.message);
      }).catch((err) => console.warn("ms365 webhook setup skipped", err?.message ?? err));
      try { void supabase.functions.invoke("ms365-full-import", { body: { mode: "initial" } }).catch(() => {}); } catch {}
      setStatus("ok");
      navigate("/mplanipret/home?ms365=ok", { replace: true });
    })().catch((e) => {
      console.error("ms365 callback crashed", e);
      setStatus("error");
      setError(String(e?.message ?? e ?? "Échec OAuth"));
    });
  }, [params, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
      <div className="bg-white rounded-xl shadow p-6 max-w-md w-full text-center">
        {status === "loading" && (<><Loader2 className="w-8 h-8 mx-auto animate-spin text-blue-600 mb-3" /><p className="text-slate-700">Connexion à Microsoft 365…</p></>)}
        {status === "ok" && (<><CheckCircle2 className="w-10 h-10 mx-auto text-emerald-600 mb-3" /><p className="font-semibold text-slate-800">Microsoft 365 connecté avec succès ✅</p><p className="text-xs text-slate-500 mt-2">Redirection…</p></>)}
        {status === "error" && (<><AlertCircle className="w-10 h-10 mx-auto text-red-600 mb-3" /><p className="font-semibold text-slate-800">Erreur de connexion</p><p className="text-xs text-slate-500 mt-2">{error}</p><button type="button" onClick={goBack} className="mt-4 px-4 py-2 text-sm bg-slate-100 rounded-lg">Retour</button></>)}
      </div>
    </div>
  );
}
