// Aperçu des tâches Maestro sur l'accueil mobile : compteurs et 3 prochaines
// échéances. Réservé aux courtiers et administrateurs.
import { useNavigate } from "react-router-dom";
import { CheckSquare, ChevronRight } from "lucide-react";
import { usePlanipretTasks } from "@/hooks/planipret/usePlanipretTasks";
import type { NormalizedTask } from "@/lib/planipret/tasks";
import MaestroTaskRow from "./MaestroTaskRow";

export default function TasksHomeCard({ profile, lang }: { profile: any; lang?: string }) {
  const fr = lang !== "en";
  const navigate = useNavigate();
  const role = String(profile?.role ?? "");
  const allowed = ["broker", "admin", "planipret_admin", "super_admin"].includes(role);
  const userId = profile?.user_id ?? profile?.id ?? null;
  const { buckets, counts, openCount, loading, error, refresh } = usePlanipretTasks(allowed ? userId : null);

  if (!allowed) return null;

  const next: NormalizedTask[] = [...buckets.overdue, ...buckets.today, ...buckets.upcoming].slice(0, 3);
  const remaining = Math.max(0, openCount - next.length);

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
          {error && (
            <div className="mt-3 rounded-xl px-3 py-2 text-[11px]" role="status"
              style={{ background: "rgba(245,158,11,0.10)", border: "1px solid rgba(245,158,11,0.25)", color: "var(--pp-text-primary)" }}>
              <span>{next.length
                ? (fr ? "Actualisation Maestro indisponible. Dernier état connu affiché." : "Maestro refresh unavailable. Showing the last known state.")
                : (fr ? "Les tâches Maestro sont temporairement indisponibles." : "Maestro tasks are temporarily unavailable.")}</span>
              <button type="button" onClick={() => void refresh({ force: true })} className="ml-2 font-semibold"
                style={{ color: "var(--pp-brand-accent)" }}>
                {fr ? "Réessayer" : "Retry"}
              </button>
            </div>
          )}
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
              {next.map((task) => {
                const overdue = buckets.overdue.some((t) => t.id === task.id);
                return (
                  <div key={task.id} className="pp-task-card"
                    style={{ "--pp-task-accent": overdue ? "var(--pp-danger)" : "var(--pp-brand-accent)" } as React.CSSProperties}>
                    <MaestroTaskRow
                      task={task}
                      lang={fr ? "fr" : "en"}
                      expanded={false}
                      onToggle={() => navigate("/mplanipret/tasks")}
                    />
                  </div>
                );
              })}
              {remaining > 0 && (
                <button type="button" onClick={() => navigate("/mplanipret/tasks")}
                  className="w-full text-left text-[11px] font-semibold px-1 py-1"
                  style={{ color: "var(--pp-brand-accent)" }}>
                  {fr ? `Voir ${remaining} autre${remaining > 1 ? "s" : ""} tâche${remaining > 1 ? "s" : ""}` : `See ${remaining} more task${remaining > 1 ? "s" : ""}`}
                </button>
              )}
            </div>
          ) : (
            !error && <p className="mt-3 text-[11.5px]" style={{ color: "var(--pp-text-muted)" }}>
              {fr ? "Aucune tâche ouverte." : "No open task."}
            </p>
          )}
        </>
      )}
    </section>
  );
}
