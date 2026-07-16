import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { CheckCircle2, ChevronDown, ChevronUp, Loader2, PlayCircle, XCircle } from "lucide-react";

type Step = { ok: boolean; skipped?: boolean; error?: string; detail?: any };
type Report = { success: boolean; coherent?: boolean; call_id?: string; report?: Record<string, Step>; error?: string };

export default function CallE2ECheck() {
  const [callId, setCallId] = useState("");
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<Report | null>(null);
  const [open, setOpen] = useState(false);

  const run = async () => {
    const id = callId.trim();
    if (!id) { toast.error("call_id requis"); return; }
    setLoading(true);
    const { data: res, error } = await supabase.functions.invoke("pp-call-e2e-check", { body: { call_id: id } });
    setLoading(false);
    if (error) { toast.error(error.message); return; }
    setData(res as Report);
    setOpen(true);
    if ((res as Report)?.coherent) toast.success("Cohérence OK ✅"); else toast.warning("Incohérence détectée");
  };

  const Row = ({ label, step }: { label: string; step?: Step }) => {
    if (!step) return null;
    const Icon = step.ok ? CheckCircle2 : XCircle;
    const color = step.ok ? "text-emerald-600" : step.skipped ? "text-amber-600" : "text-destructive";
    return (
      <div className="flex items-start gap-2 text-xs py-1.5 border-b last:border-b-0" style={{ borderColor: "hsl(var(--border))" }}>
        <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${color}`} />
        <div className="flex-1 min-w-0">
          <div className="font-semibold">{label}</div>
          {step.error && <div className="text-destructive mt-0.5 break-all">{step.error}</div>}
          {step.detail && <div className="text-muted-foreground text-[10px] font-mono mt-0.5 break-all">{JSON.stringify(step.detail)}</div>}
        </div>
      </div>
    );
  };

  return (
    <div className="rounded-xl border p-4" style={{ borderColor: "hsl(var(--border))" }}>
      <div className="flex items-center gap-2 mb-3">
        <PlayCircle className="w-4 h-4" />
        <div>
          <div className="text-sm font-semibold">Test E2E cohérence appel</div>
          <div className="text-xs text-muted-foreground">Vérifie enregistrement, transcription et actions IA pour un call_id.</div>
        </div>
      </div>

      <div className="flex gap-2">
        <input
          value={callId}
          onChange={(e) => setCallId(e.target.value)}
          placeholder="call_id (UUID ou ns_call_id)"
          className="flex-1 text-xs px-3 py-2 rounded-lg border bg-background font-mono"
          style={{ borderColor: "hsl(var(--border))" }}
        />
        <button
          onClick={run}
          disabled={loading || !callId.trim()}
          className="text-xs font-semibold px-3 py-2 rounded-lg bg-primary text-primary-foreground disabled:opacity-50 flex items-center gap-1.5"
        >
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
          Lancer
        </button>
      </div>

      {data && (
        <div className="mt-3">
          <div className={`text-xs font-semibold mb-2 ${data.coherent ? "text-emerald-600" : "text-destructive"}`}>
            {data.coherent ? "✅ Cohérent" : "❌ Incohérent"} · {data.call_id}
          </div>
          <div className="rounded-lg border" style={{ borderColor: "hsl(var(--border))" }}>
            <div className="px-3">
              <Row label="Enregistrement (ns-recordings)" step={data.report?.recording} />
              <Row label="Transcription (ns-transcription / DB)" step={data.report?.transcript} />
              <Row label="Actions IA (ai-analyze-call)" step={data.report?.ai_actions} />
            </div>
          </div>
          <button
            onClick={() => setOpen((v) => !v)}
            className="mt-2 text-xs font-medium flex items-center gap-1 text-muted-foreground hover:text-foreground"
          >
            {open ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            {open ? "Masquer" : "Afficher"} le rapport brut
          </button>
          {open && (
            <pre className="mt-2 text-[10px] p-3 rounded-lg overflow-auto max-h-96 font-mono" style={{ background: "hsl(var(--muted))" }}>
              {JSON.stringify(data, null, 2)}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}
