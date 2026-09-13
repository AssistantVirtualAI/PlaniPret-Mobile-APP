import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useMplanipretLang } from "@/hooks/useMplanipretLang";
import ElevenLabsManagementCard from "@/components/planipret/admin/integrations/ElevenLabsManagementCard";
import AvaVoiceHealthPanel from "@/components/planipret/admin/ava/AvaVoiceHealthPanel";
import AvaVoiceBrokersTable from "@/components/planipret/admin/ava/AvaVoiceBrokersTable";
import AvaVoiceSessionsLog from "@/components/planipret/admin/ava/AvaVoiceSessionsLog";
import AvaVoiceSettingsCard from "@/components/planipret/admin/ava/AvaVoiceSettingsCard";
import AvaVoiceSimulatorPanel from "@/components/planipret/admin/ava/AvaVoiceSimulatorPanel";
import { Bot } from "lucide-react";
import { PAPage, PAPageHeader } from "@/components/planipret/admin/PAPageShell";

export default function PAAvaAgent() {
  const { t } = useMplanipretLang();
  const [userId, setUserId] = useState<string | null>(null);
  const [tab, setTab] = useState<"health" | "brokers" | "sessions" | "simulator" | "voice" | "config">("health");

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null));
  }, []);

  return (
    <PAPage>
      <PAPageHeader
        icon={<Bot className="w-5 h-5" />}
        title={t("adminPortal.pageTitles.avaAgent") || "Agent AVA — Vue complète"}
        subtitle={t("adminPortal.avaAgent.subtitle")}
      />

      <div className="flex gap-1 border-b border-slate-200">
        {([
          ["health", "État de santé"],
          ["brokers", "Courtiers"],
          ["sessions", "Sessions"],
          ["simulator", "Test multi-comptes"],
          ["voice", "Voix"],
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
      {tab === "voice" && <AvaVoiceSettingsCard />}
      {tab === "config" && <ElevenLabsManagementCard userId={userId} />}
    </PAPage>
  );
}
