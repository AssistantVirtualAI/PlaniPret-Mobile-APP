import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, ChevronDown, ChevronUp, FlaskConical } from "lucide-react";

export default function NsRecordingsProbe({ domain }: { domain: string }) {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any>(null);
  const [open, setOpen] = useState(false);

  const run = async () => {
    setLoading(true);
    const { data: res, error } = await supabase.functions.invoke("ns-live-test", {
      body: { action: "recordings_transcriptions_probe", domain },
    });
    setLoading(false);
    if (error) { toast.error(error.message); return; }
    setData(res);
    setOpen(true);
    toast.success("Sondage terminé");
  };

  return (
    <div className="rounded-xl border p-4" style={{ borderColor: "hsl(var(--border))" }}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <FlaskConical className="w-4 h-4" />
          <div>
            <div className="text-sm font-semibold">Sondage enregistrements & transcriptions</div>
            <div className="text-xs text-muted-foreground">Identifie les endpoints NS-API disponibles pour {domain}</div>
          </div>
        </div>
        <button
          onClick={run}
          disabled={loading}
          className="text-xs font-semibold px-3 py-2 rounded-lg bg-primary text-primary-foreground disabled:opacity-50 flex items-center gap-1.5"
        >
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
          Lancer
        </button>
      </div>

      {data && (
        <div className="mt-3">
          <button
            onClick={() => setOpen((v) => !v)}
            className="text-xs font-medium flex items-center gap-1 text-muted-foreground hover:text-foreground"
          >
            {open ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            {open ? "Masquer" : "Afficher"} le résultat brut
          </button>
          {open && (
            <pre className="mt-2 text-[11px] p-3 rounded-lg overflow-auto max-h-96 font-mono" style={{ background: "hsl(var(--muted))" }}>
              {JSON.stringify(data, null, 2)}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}
