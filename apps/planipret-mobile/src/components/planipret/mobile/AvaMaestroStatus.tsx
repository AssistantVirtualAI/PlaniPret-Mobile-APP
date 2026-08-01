import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { CheckCircle2, AlertTriangle, RefreshCw, Loader2 } from "lucide-react";

type Status = {
  linked: boolean;
  maestro_broker_id: string | null;
  clients_total: number | null;
  chat: { ok: boolean; detail: string };
  voice: { ok: boolean; detail: string };
  healthy: boolean;
};

export default function AvaMaestroStatus({ lang = "fr" }: { lang?: "fr" | "en" }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const L = (fr: string, en: string) => (lang === "en" ? en : fr);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("pp-ava-maestro-status", { body: {} });
      if (error) throw error;
      setStatus(data as Status);
    } catch {
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const ok = !!status?.healthy;
  const tone = loading ? "var(--pp-text-muted)" : ok ? "#10b981" : "#f59e0b";

  return (
    <div className="px-4 pt-2">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 rounded-xl px-3 py-2 text-left"
        style={{ background: "var(--pp-bg-surface)", border: "1px solid var(--pp-bg-border-2)" }}
      >
        {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" style={{ color: tone }} />
          : ok ? <CheckCircle2 className="w-3.5 h-3.5" style={{ color: tone }} />
            : <AlertTriangle className="w-3.5 h-3.5" style={{ color: tone }} />}
        <span className="text-[12px] font-semibold flex-1 min-w-0 truncate" style={{ color: "var(--pp-text-primary)" }}>
          Maestro — {loading ? L("vérification…", "checking…")
            : ok ? L("connecté", "connected")
              : status?.linked ? L("problème d'accès", "access issue") : L("compte non lié", "account not linked")}
        </span>
        <RefreshCw
          className="w-3.5 h-3.5"
          style={{ color: "var(--pp-text-muted)" }}
          onClick={(e) => { e.stopPropagation(); void load(); }}
        />
      </button>

      {open && status && (
        <div className="mt-1.5 rounded-xl px-3 py-2 space-y-1 text-[11px]"
          style={{ background: "var(--pp-bg-elevated)", border: "1px solid var(--pp-bg-border-2)", color: "var(--pp-text-muted)" }}>
          <div>{L("ID courtier", "Broker ID")}: {status.maestro_broker_id ?? "—"}</div>
          {status.clients_total !== null && <div>{L("Clients", "Clients")}: {status.clients_total}</div>}
          <div style={{ color: status.chat.ok ? "#10b981" : "#f59e0b" }}>Chatbot: {status.chat.detail}</div>
          <div style={{ color: status.voice.ok ? "#10b981" : "#f59e0b" }}>Voice bot: {status.voice.detail}</div>
        </div>
      )}
    </div>
  );
}
