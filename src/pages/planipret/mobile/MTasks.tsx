import { useNavigate, useOutletContext } from "react-router-dom";
import { ChevronLeft } from "lucide-react";
import TasksSection from "@/components/planipret/mobile/TasksSection";
import type { PlanipretMobileContext } from "../PlanipretMobile";

/**
 * Full task screen. The shell already resolves the authenticated profile before
 * routing here, so this view must not make a second auth/profile request. A
 * duplicate lookup can hang on a waking mobile radio and leave the task card on
 * skeletons even though the application is otherwise usable.
 */
export default function MTasks() {
  const navigate = useNavigate();
  const context = useOutletContext<PlanipretMobileContext | null>();
  const profile = context?.profile;
  const lang = (localStorage.getItem("pp_lang") === "en" ? "en" : "fr") as "fr" | "en";
  const userId = profile?.user_id ?? profile?.id ?? null;
  const target = profile?.maestro_broker_id ? String(profile.maestro_broker_id) : null;

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
