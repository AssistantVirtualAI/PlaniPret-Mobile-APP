import { useEffect, useState } from "react";
import { PhoneOutgoing, PhoneIncoming, Copy, Square, CheckCircle2, XCircle, Loader2, MinusCircle, Stethoscope } from "lucide-react";
import { toast } from "sonner";
import {
  callValidator,
  formatValidationReport,
  type ValidationRun,
  type StepStatus,
} from "@/lib/planipret/sip/callValidation";

const STEP_COLOR: Record<StepStatus, string> = {
  pending: "#94A3B8",
  running: "#F59E0B",
  pass: "#10B981",
  fail: "#EF4444",
  skipped: "#64748B",
};

const StepIcon = ({ status }: { status: StepStatus }) => {
  const c = STEP_COLOR[status];
  if (status === "running") return <Loader2 className="w-4 h-4 animate-spin" style={{ color: c }} />;
  if (status === "pass") return <CheckCircle2 className="w-4 h-4" style={{ color: c }} />;
  if (status === "fail") return <XCircle className="w-4 h-4" style={{ color: c }} />;
  return <MinusCircle className="w-4 h-4" style={{ color: c }} />;
};

const STORAGE_KEY = "pp.callValidation.testExt";

export default function CallValidationCard() {
  const [ext, setExt] = useState(() => localStorage.getItem(STORAGE_KEY) || "");
  const [run, setRun] = useState<ValidationRun | null>(() => callValidator.snapshot());

  useEffect(() => {
    const unsubscribe = callValidator.subscribe(setRun);
    return () => { unsubscribe(); };
  }, []);

  const busy = run?.verdict === "running";

  const start = (scenario: "outbound" | "inbound") => {
    if (busy) return;
    localStorage.setItem(STORAGE_KEY, ext.trim());
    if (scenario === "outbound") void callValidator.runOutbound(ext);
    else void callValidator.runInbound(ext);
  };

  const copy = async () => {
    if (!run) return;
    try {
      await navigator.clipboard.writeText(formatValidationReport(run));
      toast.success("Rapport copié");
    } catch {
      toast.error("Copie impossible");
    }
  };

  const verdictColor = run?.verdict === "pass" ? "#10B981" : run?.verdict === "fail" ? "#EF4444" : "#F59E0B";

  return (
    <section className="pp-card p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Stethoscope className="w-4 h-4" style={{ color: "var(--pp-brand-accent)" }} />
        <span className="font-bold text-sm" style={{ color: "var(--pp-text-primary)" }}>
          Validation appels (iOS / CallKit)
        </span>
        {run && (
          <span
            className="ml-auto px-2 py-0.5 rounded-full text-[11px] font-bold"
            style={{ background: verdictColor, color: "#fff" }}
          >
            {run.verdict.toUpperCase()}
          </span>
        )}
      </div>

      <div className="flex items-center gap-2">
        <input
          value={ext}
          onChange={(e) => setExt(e.target.value)}
          inputMode="tel"
          placeholder="Extension de test (ex. 1099)"
          className="flex-1 px-3 py-2 rounded-lg text-[13px] outline-none"
          style={{
            background: "var(--pp-bg-elevated)",
            border: "1px solid var(--pp-bg-border-2)",
            color: "var(--pp-text-primary)",
          }}
        />
        {busy && (
          <button
            onClick={() => callValidator.abort()}
            className="flex items-center gap-1 px-2 py-2 rounded-lg text-[11px] font-semibold"
            style={{ background: "#EF4444", color: "#fff" }}
          >
            <Square className="w-3 h-3" /> Stop
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={() => start("outbound")}
          disabled={busy || !ext.trim()}
          className="flex items-center justify-center gap-1 py-2 rounded-lg text-[12px] font-bold disabled:opacity-50"
          style={{ background: "var(--pp-brand-accent)", color: "#fff" }}
        >
          <PhoneOutgoing className="w-4 h-4" /> Test sortant
        </button>
        <button
          onClick={() => start("inbound")}
          disabled={busy}
          className="flex items-center justify-center gap-1 py-2 rounded-lg text-[12px] font-bold disabled:opacity-50"
          style={{ background: "var(--pp-bg-elevated)", border: "1px solid var(--pp-bg-border-2)", color: "var(--pp-text-primary)" }}
        >
          <PhoneIncoming className="w-4 h-4" /> Test entrant
        </button>
      </div>

      <p className="text-[11px]" style={{ color: "var(--pp-text-secondary)" }}>
        Sortant : compose l'extension de test et vérifie sonnerie, décroché et BYE. Entrant : lance le test puis appelle
        ce poste depuis l'extension de test — le décroché se fait via CallKit.
      </p>

      {run && (
        <>
          <ul className="space-y-1">
            {run.steps.map((s) => (
              <li
                key={s.id}
                className="flex items-start gap-2 px-2 py-1.5 rounded-lg"
                style={{ background: "var(--pp-bg-elevated)" }}
              >
                <StepIcon status={s.status} />
                <div className="flex-1 min-w-0">
                  <div className="text-[12px] font-semibold" style={{ color: "var(--pp-text-primary)" }}>
                    {s.label}
                  </div>
                  {s.detail && (
                    <div className="text-[11px] font-mono truncate" style={{ color: STEP_COLOR[s.status] }}>
                      {s.detail}
                    </div>
                  )}
                </div>
                {s.ms != null && (
                  <span className="text-[10px]" style={{ color: "var(--pp-text-secondary)" }}>
                    {s.ms} ms
                  </span>
                )}
              </li>
            ))}
          </ul>
          <button
            onClick={copy}
            className="w-full flex items-center justify-center gap-1 py-2 rounded-lg text-[11px] font-semibold"
            style={{ background: "var(--pp-bg-elevated)", border: "1px solid var(--pp-bg-border-2)", color: "var(--pp-text-secondary)" }}
          >
            <Copy className="w-3 h-3" /> Copier le rapport
          </button>
        </>
      )}
    </section>
  );
}
