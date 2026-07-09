import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { CheckCircle2, AlertCircle, Loader2 } from "lucide-react";

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
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setStatus("error"); setError("Session expirée — reconnectez-vous"); return; }
      // Must match the redirect URI registered in Azure App Registration.
      const redirect_uri = `${window.location.origin}/auth/microsoft/callback`;
      const { data, error: e } = await supabase.functions.invoke("ms365-oauth-exchange", { body: { code, redirect_uri } });
      if (e || !(data as any)?.success) {
        setStatus("error"); setError((data as any)?.error ?? e?.message ?? "Échec OAuth");
        return;
      }
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
