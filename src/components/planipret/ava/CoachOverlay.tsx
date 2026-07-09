import { X, Phone, MessageSquare, Mail, BellRing, Workflow, Mic, Sparkles, Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import type { AvaSuggestion, AvaActionContext } from "@/services/avaProactive";
import { applyAvaSuggestion } from "@/services/avaProactive";

const ICONS: Record<AvaSuggestion["kind"], any> = {
  call: Phone,
  sms: MessageSquare,
  email: Mail,
  reminder: BellRing,
  maestro_action: Workflow,
  open_voice: Mic,
  open_coach: Sparkles,
};

export default function CoachOverlay({
  open,
  title = "Coach AVA",
  subtitle,
  suggestions,
  ctx,
  onClose,
}: {
  open: boolean;
  title?: string;
  subtitle?: string;
  suggestions: AvaSuggestion[];
  ctx: AvaActionContext;
  onClose: () => void;
}) {
  const [running, setRunning] = useState<string | null>(null);
  if (!open) return null;

  const run = async (s: AvaSuggestion) => {
    setRunning(s.id);
    const r = await applyAvaSuggestion(s, ctx);
    setRunning(null);
    if (r.ok) {
      if (r.message) toast.success(r.message);
      onClose();
    } else {
      toast.error(r.message ?? "Action impossible");
    }
  };

  return (
    <div className="absolute inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end" onClick={onClose}>
      <div
        className="w-full rounded-t-3xl"
        style={{ background: "var(--pp-bg-base)", border: "1px solid var(--pp-bg-border-2)", maxHeight: "60%" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 pt-3 pb-2" style={{ borderBottom: "1px solid var(--pp-bg-border)" }}>
          <div>
            <p className="text-sm font-semibold" style={{ color: "var(--pp-text-primary)" }}>{title}</p>
            {subtitle && <p className="text-[11px]" style={{ color: "var(--pp-text-muted)" }}>{subtitle}</p>}
          </div>
          <button onClick={onClose} className="p-1.5 rounded-full" style={{ color: "var(--pp-text-secondary)" }}>
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-3 space-y-2 overflow-y-auto" style={{ maxHeight: "50vh" }}>
          {suggestions.length === 0 && (
            <p className="text-center text-sm py-6" style={{ color: "var(--pp-text-muted)" }}>
              Aucune action suggérée
            </p>
          )}
          {suggestions.map((s) => {
            const Icon = ICONS[s.kind] ?? Sparkles;
            const isRunning = running === s.id;
            return (
              <button
                key={s.id}
                onClick={() => run(s)}
                disabled={isRunning}
                className="w-full text-left rounded-xl p-3 flex items-center gap-3 active:opacity-80 disabled:opacity-50"
                style={{ background: "var(--pp-bg-surface)", border: "1px solid var(--pp-bg-border-2)" }}
              >
                <div
                  className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
                  style={{ background: "rgba(155,127,232,0.15)", color: "var(--pp-agent)" }}
                >
                  {isRunning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Icon className="w-4 h-4" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold" style={{ color: "var(--pp-text-primary)" }}>{s.label}</p>
                  <p className="text-[11px] uppercase tracking-wider" style={{ color: "var(--pp-text-muted)" }}>
                    {s.kind.replace("_", " ")}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
