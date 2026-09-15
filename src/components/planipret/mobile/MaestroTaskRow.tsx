import { ChevronDown, Clock, Repeat, Sparkles } from "lucide-react";
import { formatTaskDue, type NormalizedTask } from "@/lib/planipret/tasks";
import { maestroTaskView, formatMaestroCreated } from "@/lib/planipret/taskMaestroView";

export default function MaestroTaskRow({ task, lang, actions, extra, syncedAt, expanded = true, onToggle }: {
  task: NormalizedTask;
  lang: "fr" | "en";
  actions?: React.ReactNode;
  extra?: React.ReactNode;
  syncedAt?: string | null;
  expanded?: boolean;
  onToggle?: () => void;
}) {
  const L = (fr: string, en: string) => (lang === "en" ? en : fr);
  const v = maestroTaskView(task, lang);
  const dash = "—";
  const preview = v.remarks || v.stageLabel || task.description || task.notes || dash;

  return (
    <div className="min-w-0">
      <button type="button" className="w-full min-h-[76px] pl-3 pr-2 py-2.5 text-left flex items-start gap-2"
        onClick={onToggle} aria-expanded={expanded} aria-label={`${v.clientName} — ${expanded ? L("Réduire", "Collapse") : L("Voir les détails", "View details")}`}>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="pp-task-status shrink-0">{v.statusLabel}</span>
            {task.is_recurring && <Repeat className="w-3 h-3 shrink-0" aria-label={L("Récurrente", "Recurring")} />}
            {task.created_by_ava && <span className="pp-task-ava"><Sparkles className="w-2.5 h-2.5" /> AVA</span>}
          </div>
          <p className="pp-task-client mt-1 truncate">{v.clientName}</p>
          <p className="pp-task-preview line-clamp-2">{preview}</p>
          <p className="pp-task-due"><Clock className="w-3 h-3" /> {formatTaskDue(task.due_at, lang)}</p>
        </div>
        <ChevronDown className={`w-4 h-4 mt-1 shrink-0 transition-transform ${expanded ? "rotate-180" : ""}`} style={{ color: "var(--pp-text-muted)" }} />
      </button>

      {expanded && (
        <div className="pp-task-details pl-3 pr-2 pb-2.5 pt-2">
          <div className="grid grid-cols-2 gap-x-3 gap-y-1">
            <Cell label="Filogix" value={v.filogix || dash} />
            <Cell label={L("Catégorie", "Category")} value={v.category || dash} />
            <Cell label={L("Courtier traitant", "Handling broker")} value={v.brokerName || dash} />
            <Cell label={L("Conseiller réf.", "Referring advisor")} value={v.referrerName || dash} />
          </div>
          <div className="mt-1.5">
            <Cell label={L("Étape", "Stage")} value={v.stageLabel || dash} />
            {v.createdAt && <p className="text-[10.5px]" style={{ color: "var(--pp-text-muted)" }}>{formatMaestroCreated(v.createdAt, lang)}</p>}
            <Cell label={L("Remarques", "Remarks")} value={v.remarks || dash} />
            <p className="text-[10px] mt-1" style={{ color: "var(--pp-text-muted)" }} data-testid={`task-synced-${task.id}`}>
              {L("Dernière synchro", "Last sync")} {syncedAt ? new Date(syncedAt).toLocaleString(lang === "en" ? "en-CA" : "fr-CA", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "America/Toronto" }) : dash}
            </p>
            {extra}
          </div>
          {actions && <div className="pp-task-actions mt-2 flex items-center justify-between">{actions}</div>}
        </div>
      )}
    </div>
  );
}

function Cell({ label, value }: { label: string; value: string }) {
  return <p className="text-[11px] min-w-0" style={{ color: "var(--pp-text-muted)" }}>
    <span className="uppercase text-[9.5px] mr-1" style={{ opacity: 0.85 }}>{label}</span>
    <span className="break-words font-medium" style={{ color: "var(--pp-text-primary)" }}>{value}</span>
  </p>;
}