import { Clock, Repeat, Sparkles } from "lucide-react";
import { formatTaskDue, type NormalizedTask } from "@/lib/planipret/tasks";
import { maestroTaskView, formatMaestroCreated } from "@/lib/planipret/taskMaestroView";

/** Renders a task with the same columns as the Maestro Tasks page. */
export default function MaestroTaskRow({
  task, lang, actions, extra, syncedAt,
}: {
  task: NormalizedTask;
  lang: "fr" | "en";
  actions?: React.ReactNode;
  extra?: React.ReactNode;
  /** ISO date of the last Maestro synchronisation for this task. */
  syncedAt?: string | null;
}) {
  const L = (fr: string, en: string) => (lang === "en" ? en : fr);
  const v = maestroTaskView(task, lang);
  const dash = "—";

  return (
    <div className="grid gap-2 md:grid-cols-[1.4fr_1fr_1.1fr_1.1fr_1.3fr_auto] md:items-start">
      {/* Statut + client */}
      <div className="min-w-0">
        <span
          className="inline-flex items-center text-[10px] font-semibold px-2 py-0.5 rounded-full"
          style={{ background: "rgba(37,99,235,0.10)", color: "var(--pp-brand-accent)" }}
        >
          {v.statusLabel}
        </span>
        <p className="text-sm font-medium truncate flex items-center gap-1.5 mt-1" style={{ color: "var(--pp-text-primary)" }}>
          {v.clientName}
          {task.is_recurring && <Repeat className="w-3 h-3" aria-label={L("Récurrente", "Recurring")} />}
          {task.created_by_ava && (
            <span className="text-[8px] px-1.5 py-0.5 rounded-full font-bold inline-flex items-center gap-0.5"
              style={{ background: "rgba(108,92,231,0.10)", color: "var(--pp-agent)" }}>
              <Sparkles className="w-2.5 h-2.5" /> AVA
            </span>
          )}
        </p>
        <p className="text-[11px] flex items-center gap-1" style={{ color: "var(--pp-text-muted)" }}>
          <Clock className="w-3 h-3" /> {formatTaskDue(task.due_at, lang)}
        </p>
      </div>

      <Cell label="Filogix" value={v.filogix || dash} />
      <Cell label={L("Catégorie", "Category")} value={v.category || dash} />
      <div className="min-w-0">
        <Cell label={L("Courtier traitant", "Handling broker")} value={v.brokerName || dash} />
        <Cell label={L("Conseiller réf.", "Referring advisor")} value={v.referrerName || dash} />
      </div>
      <div className="min-w-0">
        <Cell label={L("Étape", "Stage")} value={v.stageLabel || dash} />
        {v.createdAt && (
          <p className="text-[10.5px]" style={{ color: "var(--pp-text-muted)" }}>{formatMaestroCreated(v.createdAt, lang)}</p>
        )}
        <Cell label={L("Remarques", "Remarks")} value={v.remarks || dash} />
        <p className="text-[10px]" style={{ color: "var(--pp-text-muted)" }} data-testid={`task-synced-${task.id}`}>
          {L("Dernière synchro", "Last sync")}{" "}
          {syncedAt
            ? new Date(syncedAt).toLocaleString(lang === "en" ? "en-CA" : "fr-CA", {
                day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "America/Toronto",
              })
            : dash}
        </p>
        {extra}
      </div>

      {actions && <div className="flex items-center gap-0.5 flex-wrap justify-end">{actions}</div>}
    </div>
  );
}

function Cell({ label, value }: { label: string; value: string }) {
  return (
    <p className="text-[11px] min-w-0" style={{ color: "var(--pp-text-muted)" }}>
      <span className="uppercase tracking-wide text-[9.5px] mr-1" style={{ opacity: 0.75 }}>{label}</span>
      <span className="break-words" style={{ color: "var(--pp-text-primary)" }}>{value}</span>
    </p>
  );
}
