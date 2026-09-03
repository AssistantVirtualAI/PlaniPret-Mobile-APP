import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ChevronLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { usePlanipretTasks } from "@/hooks/planipret/usePlanipretTasks";
import ClientMaestroDetail from "@/components/planipret/clients/ClientMaestroDetail";

/** Fiche d'un client : appels, tâches, dossiers et commissions. */
export default function MClientDetail() {
  const navigate = useNavigate();
  const { clientKey = "" } = useParams();
  const [userId, setUserId] = useState<string | null>(null);
  const lang = (localStorage.getItem("pp_lang") === "en" ? "en" : "fr") as "fr" | "en";

  useEffect(() => {
    let alive = true;
    void (async () => {
      const { data } = await supabase.auth.getUser();
      if (alive) setUserId(data.user?.id ?? null);
    })();
    return () => { alive = false; };
  }, []);

  const { tasks, loading, lastSyncAt, setFilter } = usePlanipretTasks(userId);
  useEffect(() => { setFilter("all"); }, [setFilter]);

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center gap-2">
        <button onClick={() => navigate(-1)} aria-label={lang === "en" ? "Back" : "Retour"}
          className="w-11 h-11 rounded-xl flex items-center justify-center"
          style={{ background: "var(--pp-bg-surface)", border: "1px solid var(--pp-bg-border)" }}>
          <ChevronLeft className="w-4 h-4" />
        </button>
        <h1 className="text-base font-semibold pp-heading">
          {lang === "en" ? "Client file" : "Fiche client"}
        </h1>
      </div>

      <ClientMaestroDetail
        clientKey={clientKey}
        tasks={tasks}
        userIds={userId ? [userId] : []}
        lang={lang}
        lastSyncAt={lastSyncAt}
        loading={loading}
      />
    </div>
  );
}
