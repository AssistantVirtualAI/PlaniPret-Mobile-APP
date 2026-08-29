import { useNavigate } from "react-router-dom";
import { ChevronLeft } from "lucide-react";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import TasksSection from "@/components/planipret/mobile/TasksSection";

export default function MTasks() {
  const navigate = useNavigate();
  const [userId, setUserId] = useState<string | null>(null);
  const [target, setTarget] = useState<string | null>(null);
  const lang = (localStorage.getItem("pp_lang") === "en" ? "en" : "fr") as "fr" | "en";

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data } = await supabase.auth.getUser();
      const uid = data.user?.id ?? null;
      if (!alive) return;
      setUserId(uid);
      if (!uid) return;
      const { data: p } = await supabase
        .from("planipret_profiles")
        .select("maestro_broker_id")
        .eq("user_id", uid)
        .maybeSingle();
      if (alive) setTarget(p?.maestro_broker_id ? String(p.maestro_broker_id) : null);
    })();
    return () => { alive = false; };
  }, []);

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center gap-2">
        <button onClick={() => navigate(-1)} aria-label={lang === "en" ? "Back" : "Retour"}
          className="w-11 h-11 rounded-xl flex items-center justify-center"
          style={{ background: "var(--pp-bg-surface)", border: "1px solid var(--pp-bg-border)" }}>
          <ChevronLeft className="w-4 h-4" />
        </button>
        <h1 className="text-base font-semibold pp-heading">
          {lang === "en" ? "All my tasks" : "Toutes mes tâches"}
        </h1>
      </div>

      <TasksSection userId={userId} lang={lang} defaultTarget={target} />
    </div>
  );
}
