// Aperçu des tâches Maestro sur l'accueil mobile : compteurs et 3 prochaines
// échéances. Réservé aux courtiers et administrateurs.
import { useNavigate } from "react-router-dom";
import { CheckSquare, ChevronRight, AlertCircle, Clock } from "lucide-react";
import { usePlanipretTasks } from "@/hooks/planipret/usePlanipretTasks";
import { formatTaskDue, type NormalizedTask } from "@/lib/planipret/tasks";

export default function TasksHomeCard({ profile, lang }: { profile: any; lang?: string }) {
  const fr = lang !== "en";
  const navigate = useNavigate();
  const role = String(profile?.role ?? "");
  const allowed = role === "broker" || role === "admin";
  const { buckets, counts, openCount, loading, error } = usePlanipretTasks(allowed ? profile?.user_id : null);

  if (!allowed || error) return null;

  const next: NormalizedTask[] = [...buckets.overdue, ...buckets.today, ...buckets.upcoming].slice(0, 3);

  return (
    <section className="pp-card p-4 animate-fade-in" data-testid="tasks-home-card">
      <button onClick={() => navigate("/mplanipret/tasks")} className="w-full flex items-center justify-between text-left">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center"
            style={{ background: "rgba(155,127,232,0.16)", color: "var(--pp-brand-accent)" }}>
            <CheckSquare className="w-4 h-4" />
          </div>
          <span className="pp-eyebrow">{fr ? "Mes tâches" : "My tasks"}</span>
        </div>
        <ChevronRight className="w-4 h-4" style={{ color: "var(--pp-text-muted)" }} />
      </button>

      {loading ? (
        <div className="mt-3 h-16 rounded-xl animate-pulse" style={{ background: "rgba(59,111,160,0.08)" }} />
      ) : (
        <>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {[
              { l: fr ? "En retard" : "Overdue", v: counts.overdue, c: "var(--pp-danger, #D2445E)" },
              { l: fr ? "Aujourd'hui" : "Today", v: counts.today, c: "var(--pp-brand-accent-2, #2E9BDC)" },
              { l: fr ? "Ouvertes" : "Open", v: openCount, c: "var(--pp-text-primary)" },
            ].map((k) => (
              <div key={k.l} className="rounded-xl px-2.5 py-2"
                style={{ background: "rgba(59,111,160,0.06)", border: "1px solid rgba(59,111,160,0.16)" }}>
                <p className="text-[10px]" style={{ color: "var(--pp-text-muted)" }}>{k.l}</p>
                <p className="text-[15px] font-bold" style={{ color: k.c, fontFamily: "Urbanist,sans-serif" }}>{k.v}</p>
              </div>
            ))}
          </div>

          {next.length > 0 ? (
            <div className="mt-3 space-y-1.5">
              {next.map((task) => (
                <button key={task.id} onClick={() => navigate("/mplanipret/tasks")}
                  className="w-full text-left flex items-center gap-2 rounded-xl px-2.5 py-2"
                  style={{ minHeight: 44, background: "rgba(155,127,232,0.06)", border: "1px solid var(--pp-bg-border)" }}>
                  {buckets.overdue.some((t) => t.id === task.id)
                    ? <AlertCircle className="w-3.5 h-3.5 shrink-0" style={{ color: "var(--pp-danger, #D2445E)" }} />
                    : <Clock className="w-3.5 h-3.5 shrink-0" style={{ color: "var(--pp-text-muted)" }} />}
                  <span className="text-[12.5px] truncate flex-1" style={{ color: "var(--pp-text-primary)" }}>
                    {task.notes || task.description || (fr ? "Tâche" : "Task")}
                  </span>
                  <span className="text-[10.5px] shrink-0" style={{ color: "var(--pp-text-muted)" }}>
                    {formatTaskDue(task.due_at, fr ? "fr" : "en")}
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <p className="mt-3 text-[11.5px]" style={{ color: "var(--pp-text-muted)" }}>
              {fr ? "Aucune tâche ouverte." : "No open task."}
            </p>
          )}
        </>
      )}
    </section>
  );
}
