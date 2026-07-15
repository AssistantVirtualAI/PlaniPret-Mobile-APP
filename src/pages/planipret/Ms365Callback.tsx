import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { clearRememberedMs365RedirectUri, getRememberedMs365CodeVerifier, getRememberedMs365RedirectUri } from "@/lib/ms365OAuth";

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

  useEffect(() => {
    (async () => {
      const code = params.get("code");
      const err = params.get("error_description") ?? params.get("error");
      if (err) { setStatus("error"); setError(err); return; }
      if (!code) { setStatus("error"); setError("Code OAuth manquant"); return; }
      const session = await getSessionWithRetry();
      if (!session) { setStatus("error"); setError("Session expirée — reconnectez-vous"); return; }
      // Must match the redirect URI registered in Azure App Registration.
      const redirect_uri = getRememberedMs365RedirectUri();
      const code_verifier = getRememberedMs365CodeVerifier();
      const { data, error: e } = await supabase.functions.invoke("ms365-oauth-exchange", { body: { code, redirect_uri, code_verifier } });
      if (e || !(data as any)?.success) {
        const details = (data as any)?.details;
        const msg = (data as any)?.error ?? e?.message ?? "Échec OAuth";
        const full = details ? `${msg} — ${details.error ?? ""} ${details.error_description ?? ""}`.trim() : msg;
        console.error("ms365 exchange failed", { data, e });
        setStatus("error"); setError(full);
        return;
      }
      clearRememberedMs365RedirectUri();
      try { localStorage.removeItem("pp_ms365_callback_url"); } catch {}
      // Active automatiquement l'abonnement AVA aux nouveaux courriels (non-bloquant)
      supabase.functions.invoke("ms365-mail-webhook-setup", { body: {} }).catch(() => {});
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
