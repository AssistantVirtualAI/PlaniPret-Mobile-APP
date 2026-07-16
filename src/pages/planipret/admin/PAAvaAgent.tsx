import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useMplanipretLang } from "@/hooks/useMplanipretLang";
import ElevenLabsManagementCard from "@/components/planipret/admin/integrations/ElevenLabsManagementCard";
import AvaVoiceHealthPanel from "@/components/planipret/admin/ava/AvaVoiceHealthPanel";
import AvaVoiceBrokersTable from "@/components/planipret/admin/ava/AvaVoiceBrokersTable";
import AvaVoiceSessionsLog from "@/components/planipret/admin/ava/AvaVoiceSessionsLog";
import AvaVoiceSimulatorPanel from "@/components/planipret/admin/ava/AvaVoiceSimulatorPanel";
import { Bot } from "lucide-react";

export default function PAAvaAgent() {
  const { t } = useMplanipretLang();
  const [userId, setUserId] = useState<string | null>(null);
  const [tab, setTab] = useState<"health" | "brokers" | "sessions" | "simulator" | "config">("health");

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null));
  }, []);

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 style={{ fontFamily: "Inter,sans-serif", fontWeight: 700, fontSize: 22, color: "var(--pp-text-primary)" }} className="flex items-center gap-2">
            <Bot className="w-5 h-5" style={{ color: "#6C3CE1" }} />
            {t("adminPortal.pageTitles.avaAgent") || "Agent AVA — Vue complète"}
          </h1>
          <p style={{ fontSize: 12, color: "var(--pp-text-faint)" }} className="mt-0.5">
            Santé ElevenLabs, courtiers, sessions et configuration de l'agent vocal.
          </p>
        </div>
      </div>

      <div className="flex gap-1 border-b border-slate-200">
        {([
          ["health", "État de santé"],
          ["brokers", "Courtiers"],
          ["sessions", "Sessions"],
          ["simulator", "Test multi-comptes"],
          ["config", "Configuration"],
        ] as const).map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition ${
              tab === k
                ? "border-violet-600 text-violet-700"
                : "border-transparent text-slate-500 hover:text-slate-700"
            }`}>
            {label}
          </button>
        ))}
      </div>

      {tab === "health" && <AvaVoiceHealthPanel />}
      {tab === "brokers" && <AvaVoiceBrokersTable />}
      {tab === "sessions" && <AvaVoiceSessionsLog />}
      {tab === "simulator" && <AvaVoiceSimulatorPanel />}
      {tab === "config" && <ElevenLabsManagementCard userId={userId} />}
    </div>
  );
}
