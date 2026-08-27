import { useMemo, useState } from "react";
import { AlertCircle, CheckSquare, ChevronRight, Clock, Plus, RefreshCw, Repeat, Sparkles, Trash2, Pencil, CalendarClock, ExternalLink, ShieldCheck, Loader2 } from "lucide-react";
import { usePlanipretTasks } from "@/hooks/planipret/usePlanipretTasks";
import { describeTaskDiagnostics, describeTaskSync, formatTaskDue, toTorontoLocalInput, verifyTask, maestroTaskUrl, type NormalizedTask, type TaskFilterValue, type TaskVerifyResult } from "@/lib/planipret/tasks";
import TaskComposerSheet, { type TaskComposerValue } from "./TaskComposerSheet";
import { toast } from "sonner";

interface Props {
  userId: string | null | undefined;
  lang: "fr" | "en";
  defaultTarget?: string | null;
  onSeeAll?: () => void;
}

function SyncChip({ task, lang }: { task: NormalizedTask; lang: "fr" | "en" }) {
  const status = (task as any).sync_status ?? "unknown";
  const reason = (task as any).sync_reason ?? "unknown";
  const { label, detail } = describeTaskSync(status, reason, lang);
  const color = status === "synced" ? "var(--pp-success, #16A34A)"
    : status === "pending" ? "var(--pp-warning, #B45309)"
    : status === "not_synced" ? "var(--pp-danger, #DC2626)"
    : "var(--pp-text-muted)";
  return (
    <span
      data-testid={`sync-chip-${task.id}`}
      title={detail}
      aria-label={`${label} — ${detail}`}
      className="text-[10px] px-1.5 py-0.5 rounded-full inline-flex items-center gap-1 mt-1"
      style={{ color, border: `1px solid ${color}`, background: "transparent" }}
    >
      <RefreshCw className="w-2.5 h-2.5" /> {label}
    </span>
  );
}

function Shimmer({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded ${className}`} style={{ background: "#E2E8F0" }} />;
}

export default function TasksSection({ userId, lang, defaultTarget, onSeeAll }: Props) {
  const L = (fr: string, en: string) => (lang === "en" ? en : fr);
  const { buckets, counts, openCount, filter, setFilter, hasMore, loadMore, loadingMore, total, loading, refreshing, source, error, message, refresh, create, update, remove } = usePlanipretTasks(userId);
  const [composer, setComposer] = useState<null | { initial?: any }>(null);
  const [busy, setBusy] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string> | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<NormalizedTask | null>(null);
  /** Non-blocking Maestro warning (empty `users`, shifted `due_at`) for the last save. */
  const [diagnostic, setDiagnostic] = useState<{ text: string; correlationId?: string } | null>(null);
  /** Per-task Maestro visibility check: créée → relue → visible dans Maestro. */
  const [verif, setVerif] = useState<Record<string, TaskVerifyResult | "loading">>({});

  const checkTask = async (taskId: string) => {
    setVerif((v) => ({ ...v, [taskId]: "loading" }));
    const r = await verifyTask(taskId);
    setVerif((v) => ({ ...v, [taskId]: r }));
    if (r?.visible_in_maestro) toast.success(L("Visible dans Maestro", "Visible in Maestro"));
    else if (r?.read_back) toast.warning(L("Relue dans Maestro, mais non assignée à vous", "Read back in Maestro, but not assigned to you"));
    else toast.warning(L("Non relue via l'API Maestro", "Not read back from the Maestro API"));
  };

  const openInMaestro = (taskId: string) => {
    window.open(maestroTaskUrl(taskId), "_blank", "noopener");
  };

  const sections = useMemo(() => ([
    { key: "overdue", label: L("En retard", "Overdue"), items: buckets.overdue, accent: "var(--pp-danger)" },
    { key: "today", label: L("Aujourd'hui", "Today"), items: buckets.today, accent: "var(--pp-brand-accent)" },
    { key: "upcoming", label: L("À venir", "Upcoming"), items: buckets.upcoming, accent: "var(--pp-text-muted)" },
  ]), [buckets, lang]);

  // Optional group: tasks created by AVA in the last 24 h.
  const recentAva = useMemo(() => {
    const cutoff = Date.now() - 24 * 3600 * 1000;
    const all = [...buckets.overdue, ...buckets.today, ...buckets.upcoming];
    return all.filter((t: any) => t.created_by_ava && (t.created_at ? new Date(t.created_at).getTime() >= cutoff : true));
  }, [buckets]);

  const submit = async (v: TaskComposerValue) => {
    setBusy(true);
    const editing = composer?.initial?.task_id as string | undefined;
    const r = editing
      ? await update(editing, {
          date: v.due_at,
          notes: v.notes,
          description: v.description,
          users_id: v.users_id,
          update_status: v.update_status,
          ...(v.recurrence
            ? {
                is_recurring: true,
                recurring_value: v.recurrence.value,
                recurring_pattern: v.recurrence.pattern,
                ...(v.recurrence.on?.length ? { recurring_on: v.recurrence.on } : {}),
              }
            : { is_recurring: false }),
        })
      : await create(v as any);
    setBusy(false);
    if (r?.success) {
      toast.success(editing ? L("Tâche modifiée", "Task updated") : L("Tâche créée", "Task created"));
      setFieldErrors(null);
      setComposer(null);
      const warn = describeTaskDiagnostics(r?.diagnostics, lang);
      setDiagnostic(warn ? { text: warn, correlationId: r?.correlation_id } : null);
      if (warn) toast.warning(L("Réponse Maestro incohérente", "Inconsistent Maestro response"), { description: warn });
    } else {
      setFieldErrors(r?.fields && typeof r.fields === "object" ? r.fields : null);
      toast.error(r?.message ?? L("Échec de l'enregistrement", "Save failed"));
    }
  };


  const doDelete = async (task: NormalizedTask) => {
    setConfirmDelete(null);
    const r = await remove(task.id);
    if (r?.success) toast.success(L("Tâche supprimée", "Task deleted"));
    else toast.error(r?.message ?? L("Suppression impossible", "Delete failed"));
  };

  const snooze = async (task: NormalizedTask) => {
    const base = task.due_at ? new Date(task.due_at) : new Date();
    const next = new Date(base.getTime() + 24 * 3600 * 1000);
    const r = await update(task.id, { date: next.toISOString() });
    if (r?.success) toast.success(L("Reportée à demain", "Moved to tomorrow"));
    else toast.error(r?.message ?? L("Report impossible", "Snooze failed"));
  };

  return (
    <section className="pp-card p-4" aria-label={L("Mes tâches", "My tasks")}>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold pp-heading flex items-center gap-1.5">
          <CheckSquare className="w-4 h-4" style={{ color: "var(--pp-agent)" }} />
          {L("Mes tâches", "My tasks")}
          <span className="pp-eyebrow" aria-label={L("Tâches ouvertes", "Open tasks")}>{openCount}</span>
        </h2>
        <div className="flex items-center gap-1">
          <button onClick={() => void refresh()} aria-label={L("Rafraîchir", "Refresh")}
            className="w-11 h-11 flex items-center justify-center" style={{ color: "var(--pp-text-muted)" }}>
            <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
          </button>
          {onSeeAll && (
            <button onClick={onSeeAll} className="text-[11px] flex items-center gap-0.5 min-h-[44px] px-1"
              style={{ color: "var(--pp-brand-accent)" }}>
              {L("Voir tout", "See all")} <ChevronRight className="w-3 h-3" />
            </button>
          )}
          <button onClick={() => setComposer({})} aria-label={L("Nouvelle tâche", "New task")}
            className="w-11 h-11 rounded-xl flex items-center justify-center text-white"
            style={{ background: "var(--pp-brand-accent)" }}>
            <Plus className="w-4 h-4" />
          </button>
        </div>
      </div>

      {diagnostic && (
        <div role="status" className="mb-2 rounded-lg px-2.5 py-2 text-[11px] flex items-start gap-1.5"
          style={{ background: "rgba(245,158,11,0.10)", border: "1px solid rgba(245,158,11,0.35)", color: "var(--pp-text-primary)" }}>
          <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" style={{ color: "#B45309" }} />
          <span className="flex-1">
            <strong>{L("Diagnostic Maestro", "Maestro diagnostic")} : </strong>{diagnostic.text}
            {diagnostic.correlationId && (
              <span style={{ color: "var(--pp-text-muted)" }}> · ID {diagnostic.correlationId}</span>
            )}
          </span>
          <button onClick={() => setDiagnostic(null)} aria-label={L("Masquer", "Dismiss")}
            className="px-1" style={{ color: "var(--pp-text-muted)" }}>×</button>
        </div>
      )}

      {source === "projection" && !loading && (
        <p className="text-[11px] mb-2" style={{ color: "var(--pp-text-muted)" }}>
          {L("Hors ligne — dernier état connu.", "Offline — last known state.")}
        </p>
      )}

      <div className="flex items-center gap-1.5 mb-3 overflow-x-auto" role="tablist" aria-label={L("Filtrer les tâches", "Filter tasks")}>
        {([
          { key: "open", label: L("Toutes", "All"), count: counts.open },
          { key: "overdue", label: L("En retard", "Overdue"), count: counts.overdue },
          { key: "today", label: L("Aujourd'hui", "Today"), count: counts.today },
          { key: "upcoming", label: L("À venir", "Upcoming"), count: counts.upcoming },
        ] as Array<{ key: TaskFilterValue; label: string; count: number }>).map((f) => {
          const active = filter === f.key;
          return (
            <button
              key={f.key}
              role="tab"
              aria-selected={active}
              onClick={() => setFilter(f.key)}
              className="shrink-0 min-h-[36px] px-3 rounded-full text-[11px] font-semibold"
              style={{
                background: active ? "var(--pp-brand-accent)" : "var(--pp-bg-surface)",
                color: active ? "#fff" : "var(--pp-text-muted)",
                border: active ? "none" : "1px solid var(--pp-bg-border)",
              }}
            >
              {f.label} · {f.count}
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="space-y-2" aria-busy="true">{[0, 1, 2].map((i) => <Shimmer key={i} className="h-12" />)}</div>
      ) : error === "tasks_unavailable" ? (
        <p className="text-sm py-4 text-center" style={{ color: "var(--pp-text-muted)" }}>
          {message ?? L("Liste des tâches indisponible côté Planiprêt.", "Task list unavailable from Planiprêt.")}
        </p>
      ) : error ? (
        <div className="py-4 text-center">
          <p className="text-sm flex items-center justify-center gap-1.5" style={{ color: "var(--pp-danger)" }}>
            <AlertCircle className="w-4 h-4" /> {message ?? L("Chargement impossible", "Could not load tasks")}
          </p>
          <button onClick={() => void refresh()} className="mt-2 min-h-[44px] px-4 rounded-xl text-sm font-medium"
            style={{ background: "var(--pp-bg-surface)", border: "1px solid var(--pp-bg-border)", color: "var(--pp-text-primary)" }}>
            {L("Réessayer", "Retry")}
          </button>
        </div>
      ) : openCount === 0 ? (
        <p className="text-sm py-4 text-center" style={{ color: "var(--pp-text-muted)" }}>
          {L("Aucune tâche ouverte 🎉", "No open tasks 🎉")}
        </p>
      ) : (
        <div className="space-y-3">
          {recentAva.length > 0 && (
            <p className="text-[10px] uppercase tracking-wider" style={{ color: "var(--pp-agent)", fontWeight: 700 }}>
              {L("Récentes (AVA, 24 h)", "Recent (AVA, 24 h)")} · {recentAva.length}
            </p>
          )}
          {sections.filter((s) => s.items.length > 0).map((s) => (

            <div key={s.key}>
              <p className="text-[10px] uppercase tracking-wider mb-1.5" style={{ color: s.accent, fontWeight: 700 }}>
                {s.label} · {s.items.length}
              </p>
              <ul className="space-y-1">
                {s.items.map((task) => (
                  <li key={task.id} className="rounded-lg px-2 py-2" style={{ background: "#F7F9FC" }}>
                    <div className="flex items-start gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate flex items-center gap-1.5" style={{ color: "var(--pp-text-primary)" }}>
                          {task.notes || L("Tâche", "Task")}
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
                          {task.target_name ? ` · ${task.target_name}` : task.xid ? ` · #${task.xid}` : ""}
                          {task.status ? ` · ${task.status}` : ""}
                        </p>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <TaskStatusChip lang={lang} source={source} state={verif[task.id]} />
                          <SyncChip task={task} lang={lang} />
                        </div>
                      </div>
                      <div className="flex items-center gap-0.5">
                        <IconBtn label={L("Vérifier dans Maestro", "Verify in Maestro")} onClick={() => void checkTask(task.id)}>
                          {verif[task.id] === "loading"
                            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            : <ShieldCheck className="w-3.5 h-3.5" />}
                        </IconBtn>
                        <IconBtn label={L("Ouvrir dans Maestro", "Open in Maestro")} onClick={() => openInMaestro(task.id)}><ExternalLink className="w-3.5 h-3.5" /></IconBtn>
                        <IconBtn label={L("Reporter", "Snooze")} onClick={() => void snooze(task)}><CalendarClock className="w-3.5 h-3.5" /></IconBtn>
                        <IconBtn label={L("Modifier", "Edit")} onClick={() => setComposer({ initial: {
                          task_id: task.id, notes: task.notes, description: task.description ?? "",
                          target: task.xid ?? "", target_type: task.type ?? "user",
                          users_id: task.assignee_ids?.[0] ?? "",
                          status: task.status ?? undefined,
                          due_at: toTorontoLocalInput(task.due_at),
                        } })}><Pencil className="w-3.5 h-3.5" /></IconBtn>
                        <IconBtn label={L("Supprimer", "Delete")} danger onClick={() => setConfirmDelete(task)}><Trash2 className="w-3.5 h-3.5" /></IconBtn>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))}

          {hasMore && (
            <button
              onClick={() => void loadMore()}
              disabled={loadingMore}
              className="w-full min-h-[44px] rounded-xl text-sm font-medium"
              style={{ background: "var(--pp-bg-surface)", border: "1px solid var(--pp-bg-border)", color: "var(--pp-text-primary)" }}
            >
              {loadingMore ? L("Chargement…", "Loading…") : L(`Afficher plus (${total})`, `Load more (${total})`)}
            </button>
          )}
        </div>
      )}

      <TaskComposerSheet
        open={!!composer} lang={lang} busy={busy}
        defaultTarget={defaultTarget}
        initial={composer?.initial}
        fieldErrors={fieldErrors}
        onClose={() => { setFieldErrors(null); setComposer(null); }}
        onSubmit={submit}
      />


      {confirmDelete && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-6" role="alertdialog" aria-modal="true">
          <div className="absolute inset-0" style={{ background: "rgba(0,0,0,0.5)" }} onClick={() => setConfirmDelete(null)} />
          <div className="relative w-full max-w-sm rounded-2xl p-4" style={{ background: "var(--pp-bg-base,#fff)" }}>
            <p className="text-sm font-semibold mb-1 pp-heading">{L("Supprimer la tâche ?", "Delete this task?")}</p>
            <p className="text-xs mb-4" style={{ color: "var(--pp-text-muted)" }}>
              {confirmDelete.notes} · {formatTaskDue(confirmDelete.due_at, lang)}
            </p>
            <div className="flex gap-2">
              <button onClick={() => setConfirmDelete(null)} className="flex-1 min-h-[44px] rounded-xl text-sm"
                style={{ background: "var(--pp-bg-surface)", border: "1px solid var(--pp-bg-border)", color: "var(--pp-text-primary)" }}>
                {L("Annuler", "Cancel")}
              </button>
              <button onClick={() => void doDelete(confirmDelete)} className="flex-1 min-h-[44px] rounded-xl text-sm font-semibold text-white"
                style={{ background: "var(--pp-danger)" }}>
                {L("Supprimer", "Delete")}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function TaskStatusChip({ lang, source, state }: { lang: "fr" | "en"; source: string; state?: TaskVerifyResult | "loading" }) {
  const L = (fr: string, en: string) => (lang === "en" ? en : fr);
  let label = L("Créée", "Created");
  let bg = "rgba(100,116,139,0.12)";
  let color = "var(--pp-text-muted)";

  if (state === "loading") {
    label = L("Vérification…", "Checking…");
  } else if (state && typeof state === "object") {
    if (state.visible_in_maestro) {
      label = L("Visible dans Maestro", "Visible in Maestro");
      bg = "rgba(16,185,129,0.12)"; color = "#047857";
    } else if (state.read_back) {
      label = L("Relue", "Read back");
      bg = "rgba(245,158,11,0.14)"; color = "#B45309";
    } else {
      label = L("Non relue via API", "Not read back via API");
      bg = "rgba(239,68,68,0.12)"; color = "var(--pp-danger)";
    }
  } else if (source === "api") {
    label = L("Relue", "Read back");
    bg = "rgba(245,158,11,0.14)"; color = "#B45309";
  }

  return (
    <span className="mt-1 inline-flex items-center gap-1 text-[9px] font-semibold px-1.5 py-0.5 rounded-full"
      style={{ background: bg, color }}>
      {label}
    </span>
  );
}

function IconBtn({ label, onClick, children, danger }: { label: string; onClick: () => void; children: React.ReactNode; danger?: boolean }) {
  return (
    <button onClick={onClick} aria-label={label} title={label}
      className="w-11 h-11 rounded-lg flex items-center justify-center active:opacity-70"
      style={{ color: danger ? "var(--pp-danger)" : "var(--pp-text-muted)" }}>
      {children}
    </button>
  );
}
