import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, RefreshCw, Trash2, Copy, CheckCircle2, XCircle, AlertTriangle, Loader2, Radio } from "lucide-react";
import { toast } from "sonner";
import { ppSipProvider, type PpSipEvent, type PpSipSnapshot } from "@/lib/planipret/sip/ppSipProvider";

const STAGES = ["idle", "connecting", "connected", "registered"] as const;

const STATUS_COLOR: Record<string, string> = {
  idle: "#94A3B8",
  connecting: "#F59E0B",
  connected: "#3B82F6",
  registered: "#10B981",
  disconnected: "#94A3B8",
  error: "#EF4444",
};

function StageDot({ label, active, done, error }: { label: string; active: boolean; done: boolean; error?: boolean }) {
  const color = error ? "#EF4444" : done ? "#10B981" : active ? "#F59E0B" : "#94A3B8";
  return (
    <div className="flex flex-col items-center gap-1 flex-1">
      <div className="w-6 h-6 rounded-full flex items-center justify-center" style={{ background: color, color: "#fff" }}>
        {error ? <XCircle className="w-4 h-4" /> : done ? <CheckCircle2 className="w-4 h-4" /> : active ? <Loader2 className="w-4 h-4 animate-spin" /> : <span className="w-2 h-2 rounded-full bg-white/70" />}
      </div>
      <span className="text-[10px] font-semibold" style={{ color: "var(--pp-text-secondary)" }}>{label}</span>
    </div>
  );
}

export default function MSipDebug() {
  const navigate = useNavigate();
  const [snap, setSnap] = useState<PpSipSnapshot>(() => ppSipProvider.getSnapshot());
  const [events, setEvents] = useState<PpSipEvent[]>(() => ppSipProvider.getEvents());

  useEffect(() => {
    const us = ppSipProvider.subscribe(setSnap);
    const ue = ppSipProvider.subscribeEvents(setEvents);
    return () => { us(); ue(); };
  }, []);

  const cfg = ppSipProvider.getConfig();
  const currentIdx = Math.max(0, STAGES.indexOf(snap.status as any));
  const isError = snap.status === "error";

  const copy = async () => {
    const payload = [
      `Status: ${snap.status}`,
      `Error: ${snap.errorCause ?? "-"}`,
      `Ext: ${cfg?.sipUsername ?? "-"}@${cfg?.sipDomain ?? "-"}`,
      `WSS: ${cfg?.wssUrl ?? "-"}`,
      `Last register: ${snap.lastRegistrationAt ? new Date(snap.lastRegistrationAt).toISOString() : "-"}`,
      "",
      ...events.map((e) => `${new Date(e.time).toISOString()} [${e.level}] ${e.event}${e.detail ? " — " + e.detail : ""}`),
    ].join("\n");
    try { await navigator.clipboard.writeText(payload); toast.success("Copié"); }
    catch { toast.error("Copie impossible"); }
  };

  return (
    <div className="p-4 pb-24 space-y-4" style={{ background: "var(--pp-bg-deep)", minHeight: "100%" }}>
      <header className="flex items-center gap-2">
        <button onClick={() => navigate(-1)} className="flex items-center justify-center rounded-full active:scale-95"
          style={{ width: 32, height: 32, background: "var(--pp-bg-elevated)", border: "1px solid var(--pp-bg-border-2)", color: "var(--pp-text-secondary)" }} aria-label="Retour">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <h1 className="flex-1 font-bold" style={{ fontSize: 18, color: "var(--pp-text-primary)" }}>SIP Debug</h1>
        <button onClick={copy} className="flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-semibold"
          style={{ background: "var(--pp-bg-elevated)", border: "1px solid var(--pp-bg-border-2)", color: "var(--pp-text-secondary)" }}>
          <Copy className="w-3 h-3" /> Copier
        </button>
        <button onClick={() => { ppSipProvider.clearEvents(); }} className="flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-semibold"
          style={{ background: "var(--pp-bg-elevated)", border: "1px solid var(--pp-bg-border-2)", color: "var(--pp-text-secondary)" }}>
          <Trash2 className="w-3 h-3" /> Vider
        </button>
        <button onClick={() => { ppSipProvider.forceReregister?.(); toast("Re-REGISTER envoyé"); }} className="flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-semibold"
          style={{ background: "var(--pp-brand-accent)", color: "#fff" }}>
          <RefreshCw className="w-3 h-3" /> Re-register
        </button>
      </header>

      {/* Status card */}
      <section className="pp-card p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Radio className="w-4 h-4" style={{ color: STATUS_COLOR[snap.status] }} />
          <span className="font-bold text-sm" style={{ color: "var(--pp-text-primary)" }}>État SIP</span>
          <span className="ml-auto px-2 py-0.5 rounded-full text-[11px] font-bold" style={{ background: STATUS_COLOR[snap.status], color: "#fff" }}>
            {snap.status.toUpperCase()}
          </span>
        </div>

        <div className="flex items-center gap-1">
          {STAGES.map((s, i) => (
            <StageDot key={s} label={s} active={!isError && currentIdx === i} done={!isError && currentIdx > i} error={isError && i === Math.min(currentIdx, STAGES.length - 1)} />
          ))}
        </div>

        {snap.errorCause && snap.errorCause === 'native_platform' ? (
          <div className="flex items-start gap-2 p-2 rounded-lg" style={{ background: "rgba(16,185,129,0.10)", color: "#10B981" }}>
            <CheckCircle2 className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span className="text-[12px]">Mode natif iOS/Android — appels via NS-API REST (JsSIP désactivé)</span>
          </div>
        ) : snap.errorCause ? (
          <div className="flex items-start gap-2 p-2 rounded-lg" style={{ background: "rgba(239,68,68,0.08)", color: "#EF4444" }}>
            <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span className="text-[12px]">{snap.errorCause}</span>
          </div>
        ) : null}

        <div className="grid grid-cols-2 gap-2 text-[11px]" style={{ color: "var(--pp-text-secondary)" }}>
          <div><span className="opacity-60">Ext:</span> {cfg?.sipUsername ?? "—"}</div>
          <div><span className="opacity-60">Domain:</span> {cfg?.sipDomain ?? "—"}</div>
          <div className="col-span-2 truncate"><span className="opacity-60">WSS:</span> {cfg?.wssUrl ?? "—"}</div>
          <div className="col-span-2"><span className="opacity-60">Dernière registration:</span> {snap.lastRegistrationAt ? new Date(snap.lastRegistrationAt).toLocaleTimeString() : "—"}</div>
        </div>
      </section>

      {/* Event log */}
      <section className="pp-card p-3">
        <div className="flex items-center justify-between mb-2">
          <span className="font-bold text-sm" style={{ color: "var(--pp-text-primary)" }}>Événements SIP / JsSIP</span>
          <span className="text-[11px]" style={{ color: "var(--pp-text-secondary)" }}>{events.length}</span>
        </div>
        {events.length === 0 ? (
          <p className="text-[12px] py-4 text-center" style={{ color: "var(--pp-text-secondary)" }}>Aucun événement pour le moment.</p>
        ) : (
          <ul className="space-y-1 max-h-[60vh] overflow-y-auto">
            {events.map((e, i) => {
              const color = e.level === "error" ? "#EF4444" : e.level === "warn" ? "#F59E0B" : "var(--pp-text-secondary)";
              return (
                <li key={i} className="text-[11px] font-mono py-1 px-2 rounded" style={{ background: "var(--pp-bg-elevated)", color }}>
                  <span className="opacity-60">{new Date(e.time).toLocaleTimeString()}</span>{" "}
                  <span className="font-bold">{e.event}</span>
                  {e.detail ? <span className="opacity-80"> — {e.detail}</span> : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
