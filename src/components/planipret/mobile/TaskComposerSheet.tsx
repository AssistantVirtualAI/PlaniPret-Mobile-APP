import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, ChevronLeft, Plus, Search, X } from "lucide-react";
import { toApiDateTime, listClientTargets, type ClientTaskTarget } from "@/lib/planipret/tasks";
import { MILESTONES, QUICK_TASKS, catalogLabel, type TaskCatalogItem } from "@/lib/planipret/taskMilestones";
import { getPpContacts, peekPpContacts } from "@/lib/ppContactsCache";
import { supabase } from "@/integrations/supabase/client";
import { matchAllTokens, normalizeText, tokenize } from "@/lib/textNormalize";

export interface TaskComposerValue {
  target: string;
  target_type: "user" | "contract";
  notes: string;
  due_at: string;
  description?: string;
  status?: string;
  users_id?: number;
  is_hidden?: boolean;
  update_status?: boolean;
  sync_calendar?: boolean;
  notification?: boolean;
  send_notification_to?: number[];
  send_notification_client?: boolean;
  send_notification_client_secondary?: boolean;
  send_notification_assistant?: boolean;
  assistant_users_id?: number;
  send_notification_from?: number;
  notification_users?: number[];
  scheduled?: boolean;
  scheduled_at?: string;
  recurrence?: { value: number; pattern: string; on?: number[] } | null;
}

interface Props {
  open: boolean;
  lang: "fr" | "en";
  defaultTarget?: string | null;
  busy?: boolean;
  initial?: Partial<TaskComposerValue> & { task_id?: string; target_name?: string };
  /** Per-field validation errors returned by the gateway (HTTP 422). */
  fieldErrors?: Record<string, string> | null;
  onClose: () => void;
  onSubmit: (value: TaskComposerValue) => void | Promise<void>;
}

function defaultDue() {
  const d = new Date(Date.now() + 60 * 60 * 1000);
  const iso = toApiDateTime(d) ?? "";
  return iso.replace(" ", "T").slice(0, 16);
}

const FIELD_ERROR_LABELS: Record<string, { fr: string; en: string }> = {
  xid_required: { fr: "Cible (xid) requise.", en: "Target (xid) is required." },
  xid_required_integer: { fr: "Cible (xid) requise (nombre).", en: "Target (xid) must be a number." },
  target_required: { fr: "Cible (xid) requise.", en: "Target (xid) is required." },
  notes_required: { fr: "La note est obligatoire.", en: "Notes are required." },
  date_required: { fr: "Date et heure requises.", en: "Date and time are required." },
  "date_required_YYYY-MM-DD_HH:mm:ss": { fr: "Date et heure requises.", en: "Date and time are required." },
  invalid_date: { fr: "Format de date invalide.", en: "Invalid date format." },
  invalid_datetime: { fr: "Format de date invalide.", en: "Invalid date format." },
  type_must_be_user_or_contract: { fr: "Type de cible invalide.", en: "Invalid target type." },
  pattern_must_be_day_week_month_year: { fr: "Fréquence invalide.", en: "Invalid recurrence pattern." },
  must_be_0_to_6: { fr: "Jours de récurrence invalides.", en: "Invalid recurrence weekdays." },
  required_when_send_notification_client: {
    fr: "Choisissez au moins un destinataire de notification.",
    en: "Pick at least one notification recipient.",
  },
};

const STATUSES = [
  { value: "pending", fr: "En attente", en: "Pending" },
  { value: "in_progress", fr: "En cours", en: "In progress" },
  { value: "done", fr: "Terminée", en: "Done" },
];

const WEEKDAYS: Array<{ n: number; fr: string; en: string }> = [
  { n: 0, fr: "D", en: "S" },
  { n: 1, fr: "L", en: "M" },
  { n: 2, fr: "M", en: "T" },
  { n: 3, fr: "M", en: "W" },
  { n: 4, fr: "J", en: "T" },
  { n: 5, fr: "V", en: "F" },
  { n: 6, fr: "S", en: "S" },
];

const idList = (s: string): number[] =>
  s.split(/[,;\s]+/).map((x) => Number(x.trim())).filter((n) => Number.isInteger(n) && n > 0);

const contactName = (c: any): string =>
  String(c?.display_name || c?.name || [c?.first_name, c?.last_name].filter(Boolean).join(" ") || c?.email || `#${c?.id ?? ""}`).trim();

export default function TaskComposerSheet({ open, lang, defaultTarget, busy, initial, fieldErrors, onClose, onSubmit }: Props) {
  const L = (fr: string, en: string) => (lang === "en" ? en : fr);
  const [targetType, setTargetType] = useState<"user" | "contract">((initial?.target_type as any) ?? "user");
  const [target, setTarget] = useState(initial?.target ?? defaultTarget ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [due, setDue] = useState(initial?.due_at ?? defaultDue());
  const [status, setStatus] = useState(initial?.status ?? "pending");
  const [assignee, setAssignee] = useState(initial?.users_id ? String(initial.users_id) : "");
  const [hidden, setHidden] = useState(false);
  const [updateStatus, setUpdateStatus] = useState(false);
  const [syncCal, setSyncCal] = useState(false);
  const [notify, setNotify] = useState(false);
  const [notifyTo, setNotifyTo] = useState("");
  const [notifyClient, setNotifyClient] = useState(false);
  const [notifyClientSecondary, setNotifyClientSecondary] = useState(false);
  const [notifyAssistant, setNotifyAssistant] = useState(false);
  const [assistantId, setAssistantId] = useState("");
  const [notifyFrom, setNotifyFrom] = useState("");
  const [notificationUsers, setNotificationUsers] = useState("");
  const [scheduled, setScheduled] = useState(false);
  const [scheduledAt, setScheduledAt] = useState("");
  const [recurring, setRecurring] = useState(false);
  const [pattern, setPattern] = useState("week");
  const [recValue, setRecValue] = useState(1);
  const [recOn, setRecOn] = useState<number[]>([]);
  const [showAdvanced, setShowAdvanced] = useState(false);
  /** Maestro parity: pick a Quick Task / milestone first, then fill the form. */
  const [step, setStep] = useState<"pick" | "form">("pick");
  const [tab, setTab] = useState<"quick" | "custom">("quick");
  const [picked, setPicked] = useState<TaskCatalogItem | null>(null);
  const [clientQuery, setClientQuery] = useState("");
  const [clientName, setClientName] = useState("");
  const [clients, setClients] = useState<any[]>(() => peekPpContacts("maestro") ?? []);
  // Maestro rule: a task only lands on the Tasks page when its xid comes from
  // the Client List API `task_targets` metadata.
  const [targets, setTargets] = useState<ClientTaskTarget[]>([]);
  // Remote (Maestro) search results for the client picker.
  const [remoteTargets, setRemoteTargets] = useState<ClientTaskTarget[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedTarget, setSelectedTarget] = useState<ClientTaskTarget | null>(null);
  const [people, setPeople] = useState<any[]>(() => peekPpContacts("maestro_brokers") ?? []);
  /** Maestro team members eligible for direct task assignment. */
  const [team, setTeam] = useState<Array<{ id: string; name: string | null; email: string | null; self?: boolean }>>([]);
  const [dueDate, setDueDate] = useState("");
  const [dueTime, setDueTime] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    setErr(null);
    setTarget(initial?.target ?? defaultTarget ?? "");
    setNotes(initial?.notes ?? "");
    setDescription(initial?.description ?? "");
    setDue(initial?.due_at ?? defaultDue());
    setTargetType(initial?.target_type ?? "user");
    setStatus(initial?.status ?? "pending");
    setAssignee(initial?.users_id ? String(initial.users_id) : "");
    setHidden(initial?.is_hidden ?? false);
    setUpdateStatus(initial?.update_status ?? false);
    setSyncCal(initial?.sync_calendar ?? false);
    setNotify(initial?.notification ?? false);
    setNotifyTo((initial?.send_notification_to ?? []).join(", "));
    setNotifyClient(initial?.send_notification_client ?? false);
    setNotifyClientSecondary(initial?.send_notification_client_secondary ?? false);
    setNotifyAssistant(initial?.send_notification_assistant ?? false);
    setAssistantId(initial?.assistant_users_id ? String(initial.assistant_users_id) : "");
    setNotifyFrom(initial?.send_notification_from ? String(initial.send_notification_from) : "");
    setNotificationUsers((initial?.notification_users ?? []).join(", "));
    setScheduled(initial?.scheduled ?? false);
    setScheduledAt(initial?.scheduled_at ?? "");
    setRecurring(Boolean(initial?.recurrence));
    setPattern(initial?.recurrence?.pattern ?? "week");
    setRecValue(initial?.recurrence?.value ?? 1);
    setRecOn(initial?.recurrence?.on ?? []);
    setShowAdvanced(false);
    setStep(initial?.task_id ? "form" : "pick");
    setTab("quick");
    setPicked(null);
    setClientQuery("");
    setClientName(initial?.target_name ?? "");
    setSelectedTarget(null);
    requestAnimationFrame(() => {
      if (panelRef.current) panelRef.current.scrollTop = 0;
    });
  }, [open, initial, defaultTarget]);

  // `due` is the source of truth; the UI splits it into date + time like Maestro.
  useEffect(() => {
    const [d = "", t = ""] = String(due || "").split("T");
    setDueDate(d);
    setDueTime((t || "").slice(0, 5));
  }, [due]);

  useEffect(() => {
    if (!open || step !== "form") return;
    let alive = true;
    void getPpContacts("maestro").then((v) => { if (alive) setClients(v || []); }).catch(() => {});
    void listClientTargets().then((v) => { if (alive) setTargets(v || []); }).catch(() => {});
    void getPpContacts("maestro_brokers", { force: true, limit: 500 }).then((v) => { if (alive) setPeople(v || []); }).catch(() => {});
    void supabase.functions
      .invoke("planipret-task-api", { body: { action: "team" } })
      .then(({ data }: any) => {
        if (!alive) return;
        const members = Array.isArray(data?.members) ? data.members : [];
        setTeam(members.filter((x: any) => /^\d+$/.test(String(x?.id ?? ""))));
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [open, step]);

  // Server-side client search (Maestro Client List API): the cached page only
  // holds the first 200 clients, so anything else must be searched remotely.
  useEffect(() => {
    if (!open || step !== "form" || clientName) return;
    const term = clientQuery.trim();
    if (term.length < 2) { setRemoteTargets([]); setSearching(false); return; }
    let alive = true;
    setSearching(true);
    const timer = setTimeout(() => {
      void listClientTargets(term)
        .then((v) => { if (alive) setRemoteTargets(v || []); })
        .catch(() => { if (alive) setRemoteTargets([]); })
        .finally(() => { if (alive) setSearching(false); });
    }, 250);
    return () => { alive = false; clearTimeout(timer); };
  }, [open, step, clientQuery, clientName]);


  // Editing an existing task: resolve the client name from the Maestro
  // `task_targets` metadata so the sheet shows the name, never the raw xid.
  useEffect(() => {
    if (!open || clientName || !target) return;
    const id = String(target);
    const match = targets.find(
      (t) => String(t.user?.id ?? "") === id || String(t.client_id ?? "") === id || t.contracts.some((c) => String(c.id) === id),
    );
    if (match) {
      setClientName(match.name);
      setSelectedTarget(match);
      return;
    }
    // Fallback: resolve against the cached Maestro contacts so the sheet
    // always shows the client name instead of the raw xid.
    const contact = (clients as any[]).find(
      (c) => String(c?.id ?? "") === id
        || String(c?.client_id ?? "") === id
        || (Array.isArray(c?.contracts) && c.contracts.some((ct: any) => String(ct?.id ?? "") === id)),
    );
    const name = contact?.name ?? [contact?.first_name, contact?.last_name].filter(Boolean).join(" ").trim();
    if (name) setClientName(name);
  }, [open, target, targets, clients, clientName]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [open, busy, onClose]);

  if (!open) return null;

  const fieldMsg = (...keys: string[]) => {
    if (!fieldErrors) return null;
    for (const k of keys) {
      const raw = fieldErrors[k];
      if (!raw) continue;
      const known = FIELD_ERROR_LABELS[raw];
      return known ? (lang === "en" ? known.en : known.fr) : raw;
    }
    return null;
  };

  const FieldError = ({ keys }: { keys: string[] }) => {
    const msg = fieldMsg(...keys);
    if (!msg) return null;
    return <span className="text-[11px] block mt-1 ml-1" role="alert" style={{ color: "var(--pp-danger)" }}>{msg}</span>;
  };

  const submit = async () => {
    if (!target.trim()) return setErr(L("Cible (xid) requise.", "Target (xid) is required."));
    if (!notes.trim()) return setErr(L("La note est obligatoire.", "Notes are required."));
    if (!due) return setErr(L("Date et heure requises.", "Date and time are required."));
    if (scheduled && !scheduledAt) return setErr(L("Date d'envoi programmée requise.", "Scheduled send date is required."));
    const notifUsers = idList(notificationUsers);
    if (notifyClient && !notifUsers.length) {
      return setErr(L("Destinataires de notification requis (IDs).", "Notification recipients (IDs) are required."));
    }
    setErr(null);
    await onSubmit({
      target: target.trim(),
      target_type: targetType,
      notes: notes.trim(),
      due_at: due,
      description: description.trim() || undefined,
      status,
      users_id: assignee.trim() ? Number(assignee.trim()) : undefined,
      is_hidden: hidden,
      update_status: updateStatus,
      sync_calendar: syncCal,
      notification: notify,
      send_notification_to: idList(notifyTo),
      send_notification_client: notifyClient,
      send_notification_client_secondary: notifyClientSecondary,
      send_notification_assistant: notifyAssistant,
      assistant_users_id: assistantId.trim() ? Number(assistantId.trim()) : undefined,
      send_notification_from: notifyFrom.trim() ? Number(notifyFrom.trim()) : undefined,
      notification_users: notifUsers,
      scheduled,
      scheduled_at: scheduled ? scheduledAt : undefined,
      recurrence: recurring ? { value: recValue, pattern, on: recOn } : null,
    });
  };

  // ----- Visual system ("Refined Planiprêt sheet") -----
  // Fully opaque sheet on the surface token; inputs sit on the elevated token;
  // labels are uppercase micro-typography; the save action is pinned in a footer.
  const field = "pp-tc-field w-full rounded-xl px-4 py-3 text-sm";
  const fieldStyle = {
    background: "var(--pp-bg-elevated)",
    border: "1px solid var(--pp-bg-border)",
    color: "var(--pp-text-primary)",
  } as const;
  const labelCls = "text-[11px] font-semibold uppercase tracking-wider block mb-1.5 ml-1";
  const labelStyle = { color: "var(--pp-text-muted)", letterSpacing: "0.08em" } as const;

  const q = clientQuery.trim();
  const contactRows: ClientTaskTarget[] = clients.map((c: any) => ({
    client_id: String(c?.id ?? ""),
    name: contactName(c),
    email: c?.email ?? null,
    user: c?.id ? { id: String(c.id), eligible_broker_ids: [] } : null,
    contracts: [],
    // kept for search only (phone numbers are not part of the Maestro target shape)
    ...(c?.phone || c?.mobile ? { __phone: String(c.phone ?? c.mobile) } : {}),
  })) as any;
  // Search both the Maestro `task_targets` and the cached contacts, with
  // accent-insensitive, out-of-order token matching ("barbieri mark").
  const targetRows: ClientTaskTarget[] = (() => {
    const seen = new Set(targets.map((t) => String(t.client_id)));
    return [...targets, ...contactRows.filter((c) => c.client_id && !seen.has(String(c.client_id)))];
  })();
  const clientMatches = (() => {
    const tokens = tokenize(q);
    if (!tokens.length) return [] as ClientTaskTarget[];
    const hay = (t: any) =>
      `${t.name} ${t.email ?? ""} ${t.__phone ?? ""} ${t.client_id} ${t.contracts?.map((c: any) => `${c.number ?? ""} ${c.id}`).join(" ") ?? ""}`;
    const local = targetRows.filter((t) => matchAllTokens(hay(t), tokens));
    // Exact prefix matches on the name come first.
    const n0 = tokens[0];
    local.sort((a, b) => {
      const s = (t: ClientTaskTarget) => (normalizeText(t.name).startsWith(n0) ? 0 : 1);
      return s(a) - s(b) || a.name.localeCompare(b.name);
    });
    const seen = new Set(local.map((t) => String(t.client_id)));
    const remote = remoteTargets.filter((t) => !seen.has(String(t.client_id)));
    return [...local, ...remote].slice(0, 40);
  })();
  const pickTarget = (t: ClientTaskTarget) => {
    setSelectedTarget(t);
    setClientName(t.name);
    setClientQuery("");
    if (targetType === "contract") setTarget(t.contracts[0]?.id ?? "");
    else setTarget(t.user?.id ?? t.client_id);
  };
  const chooseTargetType = (tt: "user" | "contract") => {
    setTargetType(tt);
    if (!selectedTarget) return;
    setTarget(tt === "contract" ? (selectedTarget.contracts[0]?.id ?? "") : (selectedTarget.user?.id ?? selectedTarget.client_id));
  };
  // Only show members of the signed-in broker's real Maestro team.
  const assignableUsers = (() => {
    const byId = new Map((people as any[]).map((u) => [String(u?.id ?? u?.broker_id ?? u?.user_id ?? ""), u]));
    return team
      .filter((member) => !member.self)
      .map((member) => ({ ...(byId.get(String(member.id)) ?? {}), ...member, id: String(member.id) }))
      .sort((a, b) => contactName(a).localeCompare(contactName(b)));
  })();

  const frame = typeof document !== "undefined" ? document.getElementById("pp-mobile-frame") : null;
  const host = frame ?? (typeof document !== "undefined" ? document.body : null);
  if (!host) return null;

  const headerBtn =
    "w-9 h-9 rounded-full flex items-center justify-center shrink-0 disabled:opacity-50";
  const headerBtnStyle = {
    background: "var(--pp-bg-elevated)",
    border: "1px solid var(--pp-bg-border)",
    color: "var(--pp-text-secondary)",
  } as const;

  return createPortal((
    <div
      className={`${frame ? "absolute" : "fixed"} inset-0 z-[100] flex items-end`}
      data-testid="task-composer-overlay"
      role="dialog" aria-modal="true" aria-label={L("Nouvelle tâche", "New task")}
    >
      {/* Focus ring for the custom field styling (inline styles can't do :focus). */}
      <style>{`.pp-tc-field:focus{outline:none;border-color:var(--pp-brand-accent) !important;box-shadow:0 0 0 3px color-mix(in srgb, var(--pp-brand-accent) 18%, transparent);}`}</style>
      <div className="absolute inset-0" style={{ background: "rgba(2,6,16,0.62)", backdropFilter: "blur(2px)" }} onClick={onClose} />
      <div
        className="relative w-full rounded-t-[28px] flex flex-col overflow-hidden"
        style={{
          background: "var(--pp-bg-surface)",
          borderTop: "1px solid var(--pp-bg-border)",
          boxShadow: "0 -24px 64px -16px rgba(0,0,0,0.55)",
          maxHeight: frame ? "92%" : "calc(100dvh - max(1rem, env(safe-area-inset-top)))",
        }}
      >
        {/* Header — opaque, sticky, with step indicator */}
        <div className="shrink-0" style={{ background: "var(--pp-bg-surface)" }}>
          <div className="flex items-center justify-between px-5 pt-5 pb-3">
            <div className="flex items-center gap-2 min-w-0">
              {step === "form" && !initial?.task_id && (
                <button type="button" onClick={() => setStep("pick")} aria-label={L("Retour", "Back")}
                  className={headerBtn} style={headerBtnStyle}>
                  <ChevronLeft className="w-4 h-4" />
                </button>
              )}
              <h2 className="text-lg font-semibold pp-heading truncate" style={{ color: "var(--pp-text-primary)" }}>
                {initial?.task_id ? L("Modifier la tâche", "Edit task") : L("Nouvelle tâche", "New task")}
              </h2>
            </div>
            <button type="button" onClick={onClose} disabled={busy} aria-label={L("Fermer", "Close")}
              className={headerBtn} style={headerBtnStyle}>
              <X className="w-4 h-4" />
            </button>
          </div>
          {!initial?.task_id && (
            <div className="flex items-center gap-1.5 px-5 pb-3" aria-hidden="true">
              <div className="h-1 flex-1 rounded-full" style={{ background: "var(--pp-brand-accent)" }} />
              <div className="h-1 flex-1 rounded-full" style={{ background: step === "form" ? "var(--pp-brand-accent)" : "var(--pp-bg-border)" }} />
            </div>
          )}
        </div>

        {/* Scrollable content */}
        <div ref={panelRef} className="flex-1 overflow-y-auto overscroll-contain" style={{ WebkitOverflowScrolling: "touch" }}>
        {step === "pick" && (
          <div className="px-5 pb-6 pt-1" data-testid="task-catalog">
            {/* Tabs — mirrors Maestro's Custom Tasks / Quick Tasks */}
            <div className="p-1 rounded-xl flex mb-4" style={{ background: "var(--pp-bg-base)", border: "1px solid var(--pp-bg-border)" }}>
              {(["custom", "quick"] as const).map((tt) => (
                <button key={tt} type="button" onClick={() => setTab(tt)} aria-pressed={tab === tt}
                  className="flex-1 py-2.5 text-sm font-medium rounded-lg transition-colors"
                  style={tab === tt
                    ? { background: "var(--pp-brand-accent)", color: "#fff", boxShadow: "0 2px 8px -2px color-mix(in srgb, var(--pp-brand-accent) 60%, transparent)" }
                    : { color: "var(--pp-text-muted)" }}>
                  {tt === "custom" ? L("Tâches personnalisées", "Custom Tasks") : L("Tâches rapides", "Quick Tasks")}
                </button>
              ))}
            </div>

            <p className={labelCls} style={labelStyle}>{L("Choisir un jalon", "Choose milestone")}</p>

            <div className="rounded-2xl overflow-hidden" style={{ border: "1px solid var(--pp-bg-border)", background: "var(--pp-bg-elevated)" }}>
              {(tab === "quick" ? QUICK_TASKS : MILESTONES).map((item, i) => (
                <button key={item.id} type="button"
                  onClick={() => { setPicked(item); setNotes(item.id === "other" ? "" : catalogLabel(item, lang)); setStep("form"); }}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left min-h-[52px]"
                  style={{
                    borderTop: i === 0 ? "none" : "1px solid var(--pp-bg-border)",
                    color: "var(--pp-text-primary)",
                  }}>
                  {tab === "custom" && (
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: item.color || "var(--pp-text-muted)" }} />
                  )}
                  <span className="flex-1 text-sm leading-snug">{catalogLabel(item, lang)}</span>
                  {tab === "quick" && (
                    <span className="w-7 h-7 rounded-full flex items-center justify-center shrink-0"
                      style={{ background: "color-mix(in srgb, var(--pp-success, #12B76A) 14%, transparent)" }}>
                      <Plus className="w-4 h-4" style={{ color: "var(--pp-success, #12B76A)" }} />
                    </span>
                  )}
                </button>
              ))}
            </div>

            <button type="button" onClick={() => { setPicked(null); setNotes(""); setStep("form"); }}
              className="w-full mt-4 min-h-[48px] rounded-xl text-sm font-semibold flex items-center justify-center gap-2"
              style={{ border: "1px dashed var(--pp-bg-border2, var(--pp-bg-border))", color: "var(--pp-brand-accent)" }}>
              <Plus className="w-4 h-4" />
              {L("Nouvelle tâche personnalisée", "New Custom Task")}
            </button>
          </div>
        )}

        {step === "form" && (
        <form id="pp-task-composer-form" className="space-y-5 px-5 pb-6 pt-1" onSubmit={(event) => { event.preventDefault(); void submit(); }}>
          {/* Utilisateur / Contrat — segmented control */}
          <div className="p-1 rounded-xl flex" style={{ background: "var(--pp-bg-base)", border: "1px solid var(--pp-bg-border)" }}>
            {(["user", "contract"] as const).map((tt) => (
              <button type="button" key={tt} onClick={() => chooseTargetType(tt)}
                aria-pressed={targetType === tt}
                className="flex-1 py-2.5 text-sm font-medium rounded-lg transition-colors"
                style={targetType === tt
                  ? { background: "var(--pp-brand-accent)", color: "#fff", boxShadow: "0 2px 8px -2px color-mix(in srgb, var(--pp-brand-accent) 60%, transparent)" }
                  : { color: "var(--pp-text-muted)" }}>
                {tt === "user" ? L("Utilisateur", "User") : L("Contrat", "Contract")}
              </button>
            ))}
          </div>

          {/* Contract / client — "Choose a client" in Maestro */}
          <div>
            <span className={labelCls} style={labelStyle}>
              {targetType === "contract" ? L("Contrat", "Contract") : L("Client", "Client")}
            </span>
            {clientName ? (
              <div className="flex items-center gap-2 rounded-xl px-4 py-3" style={fieldStyle}>
                <span className="flex-1 text-sm truncate font-medium">{clientName}</span>
                <span className="text-[10px] font-mono" style={{ color: "var(--pp-text-faint, var(--pp-text-muted))" }}>#{target}</span>
                <button type="button" aria-label={L("Changer de client", "Change client")}
                  onClick={() => { setClientName(""); setTarget(""); setSelectedTarget(null); }}
                  className="w-6 h-6 rounded-full flex items-center justify-center"
                  style={{ background: "var(--pp-bg-base)", color: "var(--pp-text-muted)" }}>
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <div className="relative">
                <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2" style={{ color: "var(--pp-text-muted)" }} />
                <input className={`${field} pl-11`} style={fieldStyle} value={clientQuery}
                  aria-label={L("Choisir un client", "Choose a client")}
                  onChange={(e) => setClientQuery(e.target.value)} placeholder={L("Rechercher un client…", "Search for a client…")} />
              </div>
            )}
            {!clientName && clientQuery.trim().length >= 1 && (
              <div className="mt-1.5 rounded-xl overflow-hidden max-h-52 overflow-y-auto" style={{ border: "1px solid var(--pp-bg-border)", background: "var(--pp-bg-elevated)" }}>
                {clientMatches.length === 0 && (
                  <p className="px-4 py-3 text-xs" style={{ color: "var(--pp-text-muted)" }}>
                    {searching ? L("Recherche…", "Searching…") : L("Aucun client trouvé", "No client found")}
                  </p>
                )}
                {clientMatches.map((c: any) => (
                  <button type="button" key={c.client_id} onClick={() => pickTarget(c)}
                    className="w-full text-left px-4 py-2.5 text-sm" style={{ color: "var(--pp-text-primary)", borderTop: "1px solid var(--pp-bg-border)" }}>
                    {c.name}
                    <span className="block text-[11px]" style={{ color: "var(--pp-text-muted)" }}>
                      {c.email || `#${c.client_id}`}
                      {c.contracts.length ? ` · ${c.contracts.length} ${L("contrat(s)", "contract(s)")}` : ""}
                    </span>
                  </button>
                ))}
              </div>
            )}
            {targetType === "contract" && selectedTarget && (
              selectedTarget.contracts.length ? (
                <div className="relative mt-2">
                  <select className={`${field} appearance-none pr-10`} style={fieldStyle} value={target}
                    aria-label={L("Contrat", "Contract")} onChange={(e) => setTarget(e.target.value)}>
                    {selectedTarget.contracts.map((ct) => (
                      <option key={ct.id} value={ct.id}>{ct.number ? `${ct.number} · #${ct.id}` : `#${ct.id}`}</option>
                    ))}
                  </select>
                  <ChevronDown className="w-4 h-4 absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: "var(--pp-text-muted)" }} />
                </div>
              ) : (
                <p className="text-[11px] mt-2 ml-1" role="alert" style={{ color: "var(--pp-danger)" }}>
                  {L("Aucun contrat disponible pour ce client.", "No contract available for this client.")}
                </p>
              )
            )}
            {/* Advanced/manual xid entry — de-emphasized; the picker above is the normal path. */}
            {!clientName && (
              <input className="pp-tc-field w-full rounded-xl px-4 py-2 mt-2 text-xs font-mono"
                style={{ ...fieldStyle, opacity: 0.75, borderStyle: "dashed" }}
                inputMode="numeric" value={target}
                aria-label={L("Cible xid", "Target xid")}
                onChange={(e) => { setTarget(e.target.value); setClientName(""); setSelectedTarget(null); }}
                placeholder={L("Saisie avancée : xid", "Advanced: enter an xid")} />
            )}
            <FieldError keys={["xid", "target"]} />
          </div>

          <div>
            <span className={labelCls} style={labelStyle}>
              {L("Progression", "Progress")} <span style={{ color: "var(--pp-danger)" }}>*</span>
            </span>
            <input className={field} style={fieldStyle} value={notes} aria-label={L("Note", "Notes")}
              onChange={(e) => setNotes(e.target.value)} placeholder={L("Rappeler Jean", "Call Jean back")} />
            <FieldError keys={["notes"]} />
          </div>

          <div>
            <span className={labelCls} style={labelStyle}>
              <span style={{ color: "var(--pp-danger)" }}>* </span>{L("Date de suivi (America/Toronto)", "Follow-up Date (America/Toronto)")}
            </span>
            <div className="grid grid-cols-2 gap-3">
              <input type="date" className={field} style={fieldStyle} value={dueDate}
                aria-label={L("Date de suivi", "Follow-up date")}
                onChange={(e) => setDue(`${e.target.value}T${dueTime || "09:00"}`)} />
              <input type="time" className={field} style={fieldStyle} value={dueTime}
                aria-label={L("Heure", "Time")}
                onChange={(e) => setDue(`${dueDate || new Date().toISOString().slice(0, 10)}T${e.target.value}`)} />
            </div>
            <FieldError keys={["date", "due_at"]} />
          </div>

          <div>
            <span className={labelCls} style={labelStyle}>{L("Message au référent ou au client", "Message to referral or client")}</span>
            <textarea className={`${field} resize-none`} style={fieldStyle} rows={3} value={description}
              aria-label={L("Description", "Description")} onChange={(e) => setDescription(e.target.value)} />
          </div>

          <div className={initial?.task_id ? "" : "grid grid-cols-2 gap-3"}>
            {!initial?.task_id && (
              <div>
                <span className={labelCls} style={labelStyle}>{L("Statut", "Status")}</span>
                <div className="relative">
                  <select className={`${field} appearance-none pr-9`} style={fieldStyle} value={status} aria-label={L("Statut", "Status")}
                    onChange={(e) => setStatus(e.target.value)}>
                    {STATUSES.map((s) => <option key={s.value} value={s.value}>{lang === "en" ? s.en : s.fr}</option>)}
                  </select>
                  <ChevronDown className="w-4 h-4 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: "var(--pp-text-muted)" }} />
                </div>
                <FieldError keys={["status", "option"]} />
              </div>
            )}
            <div>
              <span className={labelCls} style={labelStyle}>
                <span style={{ color: "var(--pp-danger)" }}>* </span>{L("Assigné à", "Assigned to")}
              </span>
              <div className="relative">
                <select className={`${field} appearance-none pr-9`} style={fieldStyle} value={assignee}
                  aria-label={L("Assigné à", "Assigned to")} onChange={(e) => setAssignee(e.target.value)}>
                  <option value="">{L("Moi (auto)", "Me (auto)")}</option>
                  {assignableUsers.length > 0 && (
                    <optgroup label={L("Mon équipe (Maestro)", "My team (Maestro)")}>
                      {assignableUsers.map((u: any) => (
                        <option key={String(u.id)} value={String(u.id)}>{contactName(u)}</option>
                      ))}
                    </optgroup>
                  )}
                </select>
                <ChevronDown className="w-4 h-4 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: "var(--pp-text-muted)" }} />
              </div>
              <FieldError keys={["users_id"]} />
            </div>
          </div>

          {/* Toggles — flat iOS-style rows */}
          <div className="rounded-2xl px-4" style={{ background: "var(--pp-bg-elevated)", border: "1px solid var(--pp-bg-border)" }}>
            <Toggle label={L("Masquer la tâche aux conseillers", "Hide task from advisors")} checked={hidden} onChange={setHidden} />
            <Toggle label={L("Créer l'événement calendrier", "Create calendar event")} checked={syncCal} onChange={setSyncCal} />
            <Toggle label={L("Envoyer une notification", "Send a notification")} checked={notify} onChange={setNotify} />
            <Toggle
              label={L("Avertir le client par courriel", "Email the client")}
              checked={notifyClient}
              onChange={(v) => {
                setNotifyClient(v);
                if (!v) {
                  setNotifyClientSecondary(false);
                  setNotificationUsers("");
                }
              }}
            />
            <Toggle label={L("Tâche récurrente", "Recurring task")} checked={recurring} onChange={setRecurring} last />
          </div>

          {recurring && (
            <div className="space-y-3 rounded-2xl p-4" style={{ background: "var(--pp-bg-elevated)", border: "1px solid var(--pp-bg-border)" }}>
              <div>
                <span className={labelCls} style={labelStyle}>{L("Répéter tous les", "Repeat every")}</span>
                <div className="grid grid-cols-[88px_1fr] gap-3 mt-1">
                  <input type="number" min={1} inputMode="numeric" className={field} style={fieldStyle} value={recValue}
                    aria-label={L("Nombre d’intervalles", "Number of intervals")}
                    onChange={(e) => setRecValue(Math.max(1, Number(e.target.value) || 1))} />
                  <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label={L("Fréquence", "Frequency")}>
                    {[
                      ["day", L("Jour", "Day")],
                      ["week", L("Semaine", "Week")],
                      ["month", L("Mois", "Month")],
                      ["year", L("Année", "Year")],
                    ].map(([value, text]) => {
                      const selected = pattern === value;
                      return (
                        <button key={value} type="button" role="radio" aria-checked={selected}
                          onClick={() => setPattern(value)}
                          className="min-h-[44px] rounded-xl px-2 text-sm font-semibold"
                          style={selected
                            ? { background: "var(--pp-brand-accent)", color: "var(--pp-text-on-accent)", border: "1px solid var(--pp-brand-accent)" }
                            : { background: "var(--pp-bg-surface)", color: "var(--pp-text-primary)", border: "1px solid var(--pp-bg-border)" }}>
                          {text}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
              {pattern === "week" && (
                <div>
                  <span className={labelCls} style={labelStyle}>{L("Jours", "Days")}</span>
                  <div className="flex gap-1.5 mt-1">
                    {WEEKDAYS.map((d) => {
                      const on = recOn.includes(d.n);
                      return (
                        <button key={d.n} type="button" aria-pressed={on}
                          aria-label={`${L("Jour", "Day")} ${d.n}`}
                          onClick={() => setRecOn((prev) => (on ? prev.filter((x) => x !== d.n) : [...prev, d.n].sort()))}
                          className="flex-1 min-h-[40px] rounded-lg text-xs font-semibold"
                          style={on ? { background: "var(--pp-brand-accent)", color: "#fff" } : fieldStyle}>
                          {lang === "en" ? d.en : d.fr}
                        </button>
                      );
                    })}
                  </div>
                  <FieldError keys={["recurring_on"]} />
                </div>
              )}
              <FieldError keys={["recurring_pattern", "recurring_value"]} />
            </div>
          )}

          <button type="button" onClick={() => setShowAdvanced((v) => !v)}
            aria-expanded={showAdvanced}
            className="w-full min-h-[40px] rounded-xl text-xs font-semibold uppercase tracking-wider flex items-center justify-center gap-1.5"
            style={{ color: "var(--pp-text-muted)" }}>
            {showAdvanced ? L("Masquer les options avancées", "Hide advanced options") : L("Options avancées", "Advanced options")}
            <ChevronDown className="w-3.5 h-3.5 transition-transform" style={{ transform: showAdvanced ? "rotate(180deg)" : "none" }} />
          </button>

          {showAdvanced && (
            <div className="space-y-4 rounded-2xl p-4" style={{ background: "var(--pp-bg-elevated)", border: "1px solid var(--pp-bg-border)" }}>

              <Toggle label={L("Notifier le client secondaire", "Notify the secondary client")} checked={notifyClientSecondary} onChange={setNotifyClientSecondary} />
              <Toggle label={L("Notifier l'adjoint(e)", "Notify the assistant")} checked={notifyAssistant} onChange={setNotifyAssistant} />
              {notifyAssistant && (
                <div>
                  <span className={labelCls} style={labelStyle}>{L("Adjoint(e) (users_id)", "Assistant (users_id)")}</span>
                  <input className={field} style={fieldStyle} inputMode="numeric" value={assistantId}
                    aria-label={L("Adjoint", "Assistant")} onChange={(e) => setAssistantId(e.target.value)} />
                  <FieldError keys={["assistant_users_id"]} />
                </div>
              )}
              <div>
                <span className={labelCls} style={labelStyle}>{L("Notifier ces utilisateurs (IDs)", "Notify these users (IDs)")}</span>
                <input className={field} style={fieldStyle} value={notifyTo}
                  aria-label={L("Notifier ces utilisateurs", "Notify these users")}
                  onChange={(e) => setNotifyTo(e.target.value)} placeholder="1024, 2048" />
                <FieldError keys={["send_notification_to"]} />
              </div>
              <div>
                <span className={labelCls} style={labelStyle}>{L("Destinataires de la notification client (IDs)", "Client notification recipients (IDs)")}</span>
                <input className={field} style={fieldStyle} value={notificationUsers}
                  aria-label={L("Destinataires de la notification", "Notification recipients")}
                  onChange={(e) => setNotificationUsers(e.target.value)} placeholder="387460525" />
                <FieldError keys={["notification_users"]} />
              </div>
              <div>
                <span className={labelCls} style={labelStyle}>{L("Expéditeur de la notification (users_id)", "Notification sender (users_id)")}</span>
                <input className={field} style={fieldStyle} inputMode="numeric" value={notifyFrom}
                  aria-label={L("Expéditeur de la notification", "Notification sender")}
                  onChange={(e) => setNotifyFrom(e.target.value)} />
                <FieldError keys={["send_notification_from"]} />
              </div>

              <Toggle label={L("Programmer l'envoi", "Schedule the send")} checked={scheduled} onChange={setScheduled} />
              {scheduled && (
                <div>
                  <span className={labelCls} style={labelStyle}>{L("Envoyer le (America/Toronto)", "Send on (America/Toronto)")}</span>
                  <input type="datetime-local" className={field} style={fieldStyle} value={scheduledAt}
                    aria-label={L("Date d'envoi", "Send date")} onChange={(e) => setScheduledAt(e.target.value)} />
                  <FieldError keys={["scheduled_at"]} />
                </div>
              )}

              {!initial?.task_id && <Toggle label={L("Mettre à jour le statut du dossier", "Update the file status")} checked={updateStatus} onChange={setUpdateStatus} last />}
            </div>
          )}

          {err && <p className="text-xs ml-1" role="alert" style={{ color: "var(--pp-danger)" }}>{err}</p>}
        </form>
        )}
        </div>

        {/* Footer — pinned save action */}
        {step === "form" && (
          <div className="shrink-0 px-5 pt-3"
            style={{
              background: "var(--pp-bg-surface)",
              borderTop: "1px solid var(--pp-bg-border)",
              paddingBottom: "calc(1rem + env(safe-area-inset-bottom))",
            }}>
            <button type="submit" form="pp-task-composer-form" disabled={busy}
              className="w-full min-h-[52px] rounded-2xl font-bold text-white disabled:opacity-60 active:scale-[0.98] transition-transform"
              style={{ background: "var(--pp-brand-accent)", boxShadow: "0 8px 24px -8px color-mix(in srgb, var(--pp-brand-accent) 55%, transparent)" }}>
              {busy ? L("Enregistrement…", "Saving…") : initial?.task_id ? L("Enregistrer", "Save") : L("Enregistrer la tâche", "Save task")}
            </button>
          </div>
        )}
      </div>
    </div>
  ), host);
}

function Toggle({ label, checked, onChange, last }: { label: string; checked: boolean; onChange: (v: boolean) => void; last?: boolean }) {
  return (
    <button
      type="button"
      role="switch" aria-checked={checked} aria-label={label}
      onClick={() => onChange(!checked)}
      className="w-full min-h-[48px] flex items-center justify-between gap-3 py-2 text-sm"
      style={{
        color: "var(--pp-text-primary)",
        borderBottom: last ? "none" : "1px solid var(--pp-bg-border)",
      }}>
      <span className="text-left pr-2">{label}</span>
      <span className="w-11 h-6 rounded-full flex items-center px-0.5 shrink-0 transition-colors"
        style={{ background: checked ? "var(--pp-brand-accent)" : "var(--pp-bg-border2, var(--pp-bg-border))" }}>
        <span className="w-5 h-5 rounded-full bg-white shadow transition-transform"
          style={{ transform: checked ? "translateX(20px)" : "translateX(0)" }} />
      </span>
    </button>
  );
}
