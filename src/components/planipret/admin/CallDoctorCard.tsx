import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Stethoscope, CheckCircle2, AlertTriangle, XCircle } from "lucide-react";
import { toast } from "sonner";

type Check = {
  id: string;
  label: string;
  status: "ok" | "warn" | "fail";
  detail: string;
  action?: string;
};

type Report = {
  ok: boolean;
  extension?: string;
  domain?: string;
  verdict?: "ok" | "warn" | "fail";
  summary?: string;
  checks?: Check[];
  checked_at?: string;
};

const ICON = {
  ok: <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />,
  warn: <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" />,
  fail: <XCircle className="h-4 w-4 shrink-0 text-destructive" />,
};

/**
 * Live end-to-end audit of the call chain (devices, registrations, SimRing,
 * webhook subscription, DID routing) for the signed-in broker. Read-only.
 */
export default function CallDoctorCard() {
  const [loading, setLoading] = useState(false);
  const [ext, setExt] = useState("");
  const [report, setReport] = useState<Report | null>(null);

  const run = async () => {
    setLoading(true);
    try {
      const body = ext.trim() ? { extension: ext.trim() } : {};
      const { data, error } = await supabase.functions.invoke("pp-ns-call-doctor", { body });
      if (error) throw error;
      if ((data as any)?.ok === false) throw new Error((data as any).error);
      setReport(data as Report);
    } catch (e: any) {
      toast.error(e?.message ?? "Diagnostic échoué");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Stethoscope className="h-4 w-4 text-primary" />
          <div>
            <p className="text-sm font-medium">Docteur d'appels</p>
            <p className="text-xs text-muted-foreground">
              Vérifie devices, enregistrements, SimRing, webhook et DID.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <input
            value={ext}
            onChange={(e) => setExt(e.target.value)}
            placeholder="Extension (ex. 113)"
            inputMode="numeric"
            className="w-36 rounded-lg border border-border bg-background px-2 py-2 text-xs"
          />
          <button
            onClick={run}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-xs font-medium text-primary-foreground disabled:opacity-60"
          >
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Stethoscope className="h-3.5 w-3.5" />}
            Diagnostiquer
          </button>
        </div>
      </div>

      {report && (
        <div className="mt-4 space-y-2">
          <p className="text-xs text-muted-foreground">
            Extension {report.extension} · {report.domain}
          </p>
          <div className="flex items-start gap-2 rounded-lg bg-muted/50 p-2 text-xs">
            {ICON[report.verdict ?? "warn"]}
            <span>{report.summary}</span>
          </div>
          {(report.checks ?? []).map((c) => (
            <div key={c.id} className="flex items-start gap-2 rounded-lg border border-border/60 p-2 text-xs">
              {ICON[c.status]}
              <div className="min-w-0">
                <p className="font-medium">{c.label}</p>
                <p className="text-muted-foreground break-words">{c.detail}</p>
                {c.action && <p className="mt-1 text-amber-600 break-words">→ {c.action}</p>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
