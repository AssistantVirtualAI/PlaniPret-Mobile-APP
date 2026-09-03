/**
 * MaestroRelinkButton — manual "relink my Maestro broker" control.
 * Re-runs the email → Maestro broker-directory match server-side and
 * updates planipret_profiles.maestro_broker_id when the automatic link
 * (Microsoft sign-in / app boot) failed.
 */
import { useEffect, useState } from "react";
import { Link2, Loader2, CheckCircle2, XCircle, Eraser } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

type Props = { lang?: "fr" | "en"; className?: string };

/** Human readable explanation for a Maestro relink failure. */
function explainRelinkError(reason: string, fr: boolean): string {
  const map: Record<string, [string, string]> = {
    no_directory_match: [
      "Aucune correspondance dans l'annuaire Maestro pour votre courriel. Demandez à un administrateur d'ajouter votre courriel @planipret.com dans Maestro.",
      "No Maestro directory match for your email. Ask an administrator to add your @planipret.com email in Maestro.",
    ],
    maestro_not_connected: [
      "Votre session Maestro a expiré. Touchez « Se connecter à Maestro » pour vous authentifier à nouveau.",
      "Your Maestro session expired. Tap “Connect to Maestro” to sign in again.",
    ],
    token_expired: [
      "Le jeton Maestro est expiré. Reconnectez-vous à Maestro.",
      "The Maestro token expired. Reconnect to Maestro.",
    ],
    missing_config: [
      "La configuration Maestro est incomplète côté serveur. Contactez un administrateur.",
      "Maestro configuration is incomplete on the server. Contact an administrator.",
    ],
    unauthorized: [
      "Accès refusé par Maestro. Vérifiez que votre compte courtier est actif.",
      "Access denied by Maestro. Check that your broker account is active.",
    ],
  };
  const hit = map[reason];
  if (hit) return fr ? hit[0] : hit[1];
  return fr
    ? `Reconnexion Maestro impossible (${reason}). Purgez les caches puis réessayez.`
    : `Maestro reconnection failed (${reason}). Purge the caches then retry.`;
}

/** Clear every local Maestro/task cache without restarting the app. */
async function purgeMaestroCaches(): Promise<void> {
  try {
    for (const key of Object.keys(localStorage)) {
      if (/^(pp_tasks_cache_|pp_maestro|maestro_|pp_commission|pp_contacts)/i.test(key)) localStorage.removeItem(key);
    }
  } catch { /* noop */ }
  try {
    for (const key of Object.keys(sessionStorage)) {
      if (/^(pp_|maestro)/i.test(key)) sessionStorage.removeItem(key);
    }
  } catch { /* noop */ }
  try {
    const keys = (await window.caches?.keys?.()) ?? [];
    await Promise.all(keys.map((k) => window.caches.delete(k)));
  } catch { /* noop */ }
}

export default function MaestroRelinkButton({ lang = "fr", className = "" }: Props) {
  const fr = lang === "fr";
  const [busy, setBusy] = useState(false);
  const [brokerId, setBrokerId] = useState<string | null>(null);
  const [matchedBy, setMatchedBy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [purging, setPurging] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth?.user) return;
      const { data } = await supabase
        .from("planipret_profiles")
        .select("maestro_broker_id")
        .eq("user_id", auth.user.id)
        .maybeSingle();
      if (!cancelled) setBrokerId((data as any)?.maestro_broker_id ?? null);
    })();
    return () => { cancelled = true; };
  }, []);

  const relink = async () => {
    setBusy(true);
    setError(null);
    try {
      let { data, error: err } = await supabase.functions.invoke("maestro-actions", {
        body: { action: "link_broker_by_email", payload: { force: true } },
      });
      if (err || !(data as any)?.success) {
        // Fallback: telecom link endpoint (Maestro Telecom broker binding).
        const fb = await supabase.functions.invoke("maestro-telecom-link", {
          body: { action: "link_broker_by_email" },
        });
        if (!fb.error && (fb.data as any)?.success) { data = fb.data; err = null as any; }
      }
      if (err) throw err;
      const d = data as any;
      if (d?.success && d?.maestro_broker_id) {
        setBrokerId(String(d.maestro_broker_id));
        setMatchedBy(d.matched_by ?? null);
        toast.success(fr ? `Maestro relié (ID ${d.maestro_broker_id})` : `Maestro linked (ID ${d.maestro_broker_id})`);
      } else {
        const reason = String(d?.error ?? "no_directory_match");
        const explained = explainRelinkError(reason, fr);
        setError(explained);
        toast.error(fr ? "Reconnexion Maestro échouée" : "Maestro reconnection failed", { description: explained });
      }
    } catch (e: any) {
      const explained = explainRelinkError(String(e?.message ?? "network_error"), fr);
      setError(explained);
      toast.error(fr ? "Reconnexion Maestro échouée" : "Maestro reconnection failed", { description: explained });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section
      className={`rounded-xl p-3 ${className}`}
      style={{ background: "#0A1628", border: "1px solid #0E2A45" }}
    >
      <div className="flex items-center gap-2">
        <Link2 className="w-4 h-4" style={{ color: "#5EC2FF" }} />
        <span className="text-sm font-semibold flex-1">
          {fr ? "Identifiant courtier Maestro" : "Maestro broker ID"}
        </span>
        <button
          onClick={async () => {
            setPurging(true);
            await purgeMaestroCaches();
            setPurging(false);
            setError(null);
            toast.success(fr ? "Caches purgés — aucun redémarrage requis" : "Caches purged — no restart needed");
            void relink();
          }}
          disabled={purging || busy}
          aria-label={fr ? "Purger les caches" : "Purge caches"}
          className="text-[11px] font-semibold px-3 py-1.5 rounded-full disabled:opacity-60 inline-flex items-center gap-1"
          style={{ background: "rgba(255,255,255,0.06)", border: "1px solid #17527d", color: "#8FA8C0" }}
        >
          {purging ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Eraser className="w-3.5 h-3.5" />}
          {fr ? "Purger" : "Purge"}
        </button>
        <button
          onClick={relink}
          disabled={busy}
          className="text-[11px] font-semibold px-3 py-1.5 rounded-full disabled:opacity-60"
          style={{ background: "rgba(46,155,220,0.14)", border: "1px solid #17527d", color: "#5EC2FF" }}
        >
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : fr ? "Relier" : "Relink"}
        </button>
      </div>
      <div className="mt-2 flex items-start gap-2 text-xs">
        {brokerId ? (
          <CheckCircle2 className="w-3.5 h-3.5 mt-0.5" style={{ color: "#2EDC78" }} />
        ) : (
          <XCircle className="w-3.5 h-3.5 mt-0.5" style={{ color: "#E84C4C" }} />
        )}
        <span style={{ color: "#8FA8C0" }}>
          {brokerId
            ? `${fr ? "Lié" : "Linked"} — ID ${brokerId}${matchedBy ? ` (${matchedBy})` : ""}`
            : error
              ? `${fr ? "Non lié" : "Not linked"} — ${error}`
              : fr
                ? "Non lié. Touchez « Relier » pour relancer la correspondance par courriel."
                : "Not linked. Tap “Relink” to re-run the email match."}
        </span>
      </div>
    </section>
  );
}
