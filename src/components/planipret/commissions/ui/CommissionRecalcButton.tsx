import { useState } from "react";
import { Calculator, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

/**
 * "Recalculer" — relaunches the Maestro sync (register + live cache) and then
 * asks the page to rebuild its totals with the `date_trans` filter applied.
 */
export default function CommissionRecalcButton({
  lang,
  scope,
  onDone,
}: {
  lang: "fr" | "en";
  scope: "admin" | "broker";
  onDone?: () => void;
}) {
  const isFr = lang !== "en";
  const [busy, setBusy] = useState(false);

  const run = async () => {
    setBusy(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const headers = session?.access_token
        ? { Authorization: `Bearer ${session.access_token}` }
        : undefined;

      const { data, error } = await supabase.functions.invoke("pp-maestro-commissions-sync", {
        // "Recalculer" = reconstruction complète : on force un import intégral
        // (non incrémental) pour re-clé et corriger aussi les lignes anciennes.
        // Portée volontairement limitée au compte courant, même pour un admin :
        // chaque courtier connecte son propre Maestro et importe ses données.
        body: { mode: "self", full: true },
        headers,
      });
      if (error) throw error;
      if ((data as any)?.success === false) throw new Error((data as any)?.error ?? "sync_failed");

      const written = (data as any)?.written ?? 0;
      toast.success(isFr ? "Totaux recalculés" : "Totals recalculated", {
        description: isFr
          ? `${written} ligne(s) resynchronisée(s) · lignes sans date exclues`
          : `${written} row(s) resynced · undated rows excluded`,
      });
      onDone?.();
    } catch (e: any) {
      toast.error(isFr ? "Recalcul impossible" : "Recalculation failed", { description: e?.message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      onClick={run}
      disabled={busy}
      title={isFr
        ? "Relancer la synchronisation Maestro puis reconstruire les totaux (lignes sans date exclues)"
        : "Re-run the Maestro sync then rebuild totals (undated rows excluded)"}
      className="pp-hide-export pp-toolbar-btn inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg"
      style={{
        fontSize: 12, fontWeight: 700, opacity: busy ? 0.7 : 1,
        background: "var(--pp-bg-elevated)", border: "1px solid var(--pp-bg-border)", color: "var(--pp-text-secondary)",
      }}
    >
      {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Calculator className="w-3.5 h-3.5" />}
      {isFr ? "Recalculer" : "Recalculate"}
    </button>
  );
}
