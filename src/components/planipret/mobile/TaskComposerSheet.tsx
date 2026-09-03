import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, Plus, Search, X } from "lucide-react";
import { toApiDateTime, listClientTargets, type ClientTaskTarget } from "@/lib/planipret/tasks";
import { MILESTONES, QUICK_TASKS, catalogLabel, type TaskCatalogItem } from "@/lib/planipret/taskMilestones";
import { getPpContacts, peekPpContacts } from "@/lib/ppContactsCache";

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
  const [selectedTarget, setSelectedTarget] = useState<ClientTaskTarget | null>(null);
  const [people, setPeople] = useState<any[]>(() => peekPpContacts("maestro_brokers") ?? []);
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
    return () => { alive = false; };
  }, [open, step]);

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
    return <span className="text-[11px] block mt-1" role="alert" style={{ color: "var(--pp-danger)" }}>{msg}</span>;
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

  const field = "w-full rounded-xl px-3 py-3 text-sm";
  const fieldStyle = { background: "var(--pp-bg-surface)", border: "1px solid var(--pp-bg-border)", color: "var(--pp-text-primary)" } as const;
  const labelCls = "text-[11px]";
  const labelStyle = { color: "var(--pp-text-muted)" } as const;

  const q = clientQuery.trim().toLowerCase();
  const targetRows: ClientTaskTarget[] = targets.length
    ? targets
    : clients.map((c: any) => ({
        client_id: String(c?.id ?? ""),
        name: contactName(c),
        email: c?.email ?? null,
        user: c?.id ? { id: String(c.id), eligible_broker_ids: [] } : null,
        contracts: [],
      }));
  const clientMatches = q.length >= 2
    ? targetRows.filter((t) => `${t.name} ${t.email ?? ""}`.toLowerCase().includes(q)).slice(0, 25)
    : [];
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
  // Maestro rule: a task can only be assigned to yourself, unless the account
  // is set up with team members (assistants) allowed to take tasks under your
  // profile. So we only offer assistants, never the whole broker directory.
  const assignableUsers = people
    .filter((u: any) => /^\d+$/.test(String(u?.id ?? u?.broker_id ?? u?.user_id ?? "")))
    .filter((u: any) => /assistant/i.test(String(u?.role ?? u?.type ?? u?.title ?? u?.position ?? "")))
    .map((u: any) => ({ ...u, id: u?.id ?? u?.broker_id ?? u?.user_id }));

  const frame = typeof document !== "undefined" ? document.getElementById("pp-mobile-frame") : null;
  const host = frame ?? (typeof document !== "undefined" ? document.body : null);
  if (!host) return null;

  return createPortal((
    <div
      className={`${frame ? "absolute" : "fixed"} inset-0 z-[100] flex items-end`}
      data-testid="task-composer-overlay"
      role="dialog" aria-modal="true" aria-label={L("Nouvelle tâche", "New task")}
    >
      <div className="absolute inset-0" style={{ background: "rgba(0,0,0,0.45)" }} onClick={onClose} />
      <div
        ref={panelRef}
        className="relative w-full rounded-t-3xl overflow-y-auto overscroll-contain"
        style={{ background: "var(--pp-bg-base, #fff)", maxHeight: frame ? "92%" : "calc(100dvh - max(1rem, env(safe-area-inset-top)))", paddingBottom: "calc(1rem + env(safe-area-inset-bottom))", WebkitOverflowScrolling: "touch" }}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between px-4 pt-4 pb-3" style={{ background: "var(--pp-bg-base, #fff)" }}>
          <div className="flex items-center gap-2 min-w-0">
            {step === "form" && !initial?.task_id && (
              <button type="button" onClick={() => setStep("pick")} aria-label={L("Retour", "Back")}
                className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={fieldStyle}>
                <ChevronLeft className="w-4 h-4" />
              </button>
            )}
            <h2 className="text-base font-semibold pp-heading truncate">{initial?.task_id ? L("Modifier la tâche", "Edit task") : L("Nouvelle tâche", "New task")}</h2>
          </div>
          <button type="button" onClick={onClose} disabled={busy} aria-label={L("Fermer", "Close")} className="w-11 h-11 rounded-xl flex items-center justify-center disabled:opacity-50" style={fieldStyle}>
            <X className="w-4 h-4" />
          </button>
        </div>

        {step === "pick" && (
          <div className="px-4 pb-4" data-testid="task-catalog">
            {/* Tabs — mirrors Maestro's Custom Tasks / Quick Tasks */}
            <div className="flex gap-4 border-b mb-3" style={{ borderColor: "var(--pp-bg-border)" }}>
              {(["custom", "quick"] as const).map((tt) => (
                <button key={tt} type="button" onClick={() => setTab(tt)} aria-pressed={tab === tt}
                  className="pb-2 text-sm font-semibold"
                  style={{
                    color: tab === tt ? "var(--pp-brand-accent)" : "var(--pp-text-muted)",
                    borderBottom: tab === tt ? "2px solid var(--pp-brand-accent)" : "2px solid transparent",
                  }}>
                  {tt === "custom" ? L("Tâches personnalisées", "Custom Tasks") : L("Tâches rapides", "Quick Tasks")}
                </button>
              ))}
            </div>

            <p className="text-[11px] font-semibold mb-2" style={labelStyle}>{L("Choisir un jalon", "Choose milestone")}</p>

            <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--pp-bg-border)" }}>
              {(tab === "quick" ? QUICK_TASKS : MILESTONES).map((item, i) => (
                <button key={item.id} type="button"
                  onClick={() => { setPicked(item); setNotes(item.id === "other" ? "" : catalogLabel(item, lang)); setStep("form"); }}
                  className="w-full flex items-center gap-3 px-3 py-3 text-left min-h-[52px]"
                  style={{
                    background: "var(--pp-bg-surface)",
                    borderTop: i === 0 ? "none" : "1px solid var(--pp-bg-border)",
                    color: "var(--pp-text-primary)",
                  }}>
                  {tab === "custom" && (
                    <span className="w-3 h-3 rounded-full shrink-0" style={{ background: item.color || "var(--pp-text-muted)" }} />
                  )}
                  <span className="flex-1 text-sm">{catalogLabel(item, lang)}</span>
                  {tab === "quick" && <Plus className="w-4 h-4 shrink-0" style={{ color: "var(--pp-success, #12B76A)" }} />}
                </button>
              ))}
            </div>

            <button type="button" onClick={() => { setPicked(null); setNotes(""); setStep("form"); }}
              className="w-full mt-3 min-h-[48px] rounded-xl text-sm font-semibold flex items-center justify-center gap-2"
              style={fieldStyle}>
              <Plus className="w-4 h-4" />
              {L("Nouvelle tâche personnalisée", "New Custom Task")}
            </button>
          </div>
        )}

        {step === "form" && (
        <form className="space-y-3 px-4" onSubmit={(event) => { event.preventDefault(); void submit(); }}>
          <div className="flex gap-2">
            {(["user", "contract"] as const).map((tt) => (
              <button type="button" key={tt} onClick={() => chooseTargetType(tt)}
                aria-pressed={targetType === tt}
                className="flex-1 min-h-[44px] rounded-xl text-sm font-medium"
                style={targetType === tt
                  ? { background: "var(--pp-brand-accent)", color: "#fff" }
                  : fieldStyle}>
                {tt === "user" ? L("Utilisateur", "User") : L("Contrat", "Contract")}
              </button>
            ))}
          </div>

          {/* Contract / client — "Choose a client" in Maestro */}
          <div>
            <span className="text-[12px] font-bold block mb-1" style={{ color: "var(--pp-text-primary)" }}>
              {targetType === "contract" ? L("Contrat", "Contract") : L("Client", "Client")}
            </span>
            {clientName ? (
              <div className="flex items-center gap-2 rounded-xl px-3 py-3" style={fieldStyle}>
                <span className="flex-1 text-sm truncate">{clientName}</span>
                <span className="text-[11px]" style={labelStyle}>#{target}</span>
                <button type="button" aria-label={L("Changer de client", "Change client")}
                  onClick={() => { setClientName(""); setTarget(""); setSelectedTarget(null); }} className="p-1"><X className="w-4 h-4" /></button>
              </div>
            ) : (
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "var(--pp-text-muted)" }} />
                <input className={`${field} pl-9`} style={fieldStyle} value={clientQuery}
                  aria-label={L("Choisir un client", "Choose a client")}
                  onChange={(e) => setClientQuery(e.target.value)} placeholder={L("Choisir un client", "Choose a client")} />
              </div>
            )}
            {!clientName && clientQuery.trim().length >= 2 && (
              <div className="mt-1 rounded-xl overflow-hidden max-h-52 overflow-y-auto" style={{ border: "1px solid var(--pp-bg-border)" }}>
                {clientMatches.length === 0 && (
                  <p className="px-3 py-3 text-xs" style={labelStyle}>{L("Aucun client trouvé", "No client found")}</p>
                )}
                {clientMatches.map((c: any) => (
  <button type="button" key={c.client_id} onClick={() => pickTarget(c)}
                    className="w-full text-left px-3 py-2.5 text-sm" style={{ background: "var(--pp-bg-surface)", color: "var(--pp-text-primary)" }}>
                    {c.name}
                    <span className="block text-[11px]" style={labelStyle}>
                      {c.email || `#${c.client_id}`}
                      {c.contracts.length ? ` · ${c.contracts.length} ${L("contrat(s)", "contract(s)")}` : ""}
                    </span>
                  </button>
                ))}
              </div>
            )}
            {targetType === "contract" && selectedTarget && (
              selectedTarget.contracts.length ? (
                <select className={`${field} mt-2`} style={fieldStyle} value={target}
                  aria-label={L("Contrat", "Contract")} onChange={(e) => setTarget(e.target.value)}>
                  {selectedTarget.contracts.map((ct) => (
                    <option key={ct.id} value={ct.id}>{ct.number ? `${ct.number} · #${ct.id}` : `#${ct.id}`}</option>
                  ))}
                </select>
              ) : (
                <p className="text-[11px] mt-2" role="alert" style={{ color: "var(--pp-danger)" }}>
                  {L("Aucun contrat disponible pour ce client.", "No contract available for this client.")}
                </p>
              )
            )}
            <input className={`${field} mt-2`} style={fieldStyle} inputMode="numeric" value={target}
              aria-label={L("Cible xid", "Target xid")}
              onChange={(e) => { setTarget(e.target.value); setClientName(""); setSelectedTarget(null); }} placeholder={L("ou saisir un xid", "or enter an xid")} />
            <FieldError keys={["xid", "target"]} />
          </div>

          <label className="block">
            <span className={labelCls} style={labelStyle}>{L("Progression *", "Progress *")}</span>
            <input className={field} style={fieldStyle} value={notes} aria-label={L("Note", "Notes")}
              onChange={(e) => setNotes(e.target.value)} placeholder={L("Rappeler Jean", "Call Jean back")} />
            <FieldError keys={["notes"]} />
          </label>

          <div>
            <span className="text-[12px] font-bold block mb-1" style={{ color: "var(--pp-text-primary)" }}>
              <span style={{ color: "var(--pp-danger)" }}>* </span>{L("Date de suivi (America/Toronto)", "Follow-up Date (America/Toronto)")}
            </span>
            <div className="flex gap-2">
              <input type="date" className={field} style={fieldStyle} value={dueDate}
                aria-label={L("Date de suivi", "Follow-up date")}
                onChange={(e) => setDue(`${e.target.value}T${dueTime || "09:00"}`)} />
              <input type="time" className={field} style={fieldStyle} value={dueTime}
                aria-label={L("Heure", "Time")}
                onChange={(e) => setDue(`${dueDate || new Date().toISOString().slice(0, 10)}T${e.target.value}`)} />
            </div>
            <FieldError keys={["date", "due_at"]} />
          </div>

          <label className="block">
            <span className={labelCls} style={labelStyle}>{L("Message au référent ou au client", "Message to referral or client")}</span>
            <textarea className={field} style={fieldStyle} rows={4} value={description}
              aria-label={L("Description", "Description")} onChange={(e) => setDescription(e.target.value)} />
          </label>

          <div className="flex gap-2">
            <label className="block flex-1">
              <span className={labelCls} style={labelStyle}>{L("Statut", "Status")}</span>
              <select className={field} style={fieldStyle} value={status} aria-label={L("Statut", "Status")}
                onChange={(e) => setStatus(e.target.value)}>
                {STATUSES.map((s) => <option key={s.value} value={s.value}>{lang === "en" ? s.en : s.fr}</option>)}
              </select>
              <FieldError keys={["status", "option"]} />
            </label>
            <label className="block flex-1">
              <span className={labelCls} style={labelStyle}>
                <span style={{ color: "var(--pp-danger)" }}>* </span>{L("Assigné à", "Assigned to")}
              </span>
              <select className={field} style={fieldStyle} value={assignee}
                aria-label={L("Assigné à", "Assigned to")} onChange={(e) => setAssignee(e.target.value)}>
                <option value="">{L("Moi (assignation automatique)", "Me (automatic assignment)")}</option>
                {assignableUsers.map((u: any) => (
                  <option key={String(u.id)} value={String(u.id)}>{contactName(u)}</option>
                ))}
              </select>
              <FieldError keys={["users_id"]} />
            </label>
          </div>

          <Toggle label={L("Masquer la tâche aux conseillers", "Hide task from advisors")} checked={hidden} onChange={setHidden} />
          <Toggle label={L("Créer l'événement calendrier", "Create calendar event")} checked={syncCal} onChange={setSyncCal} />
          <Toggle label={L("Envoyer une notification", "Send a notification")} checked={notify} onChange={setNotify} />
          <Toggle label={L("Tâche récurrente", "Recurring task")} checked={recurring} onChange={setRecurring} />

          {recurring && (
            <div className="space-y-2">
              <div className="flex gap-2">
                <input type="number" min={1} className={field} style={fieldStyle} value={recValue}
                  aria-label={L("Valeur de récurrence", "Recurrence value")}
                  onChange={(e) => setRecValue(Math.max(1, Number(e.target.value) || 1))} />
                <select className={field} style={fieldStyle} value={pattern} aria-label={L("Fréquence", "Pattern")}
                  onChange={(e) => setPattern(e.target.value)}>
                  <option value="day">{L("Jour", "Day")}</option>
                  <option value="week">{L("Semaine", "Week")}</option>
                  <option value="month">{L("Mois", "Month")}</option>
                  <option value="year">{L("Année", "Year")}</option>
                </select>
              </div>
              {pattern === "week" && (
                <div>
                  <span className={labelCls} style={labelStyle}>{L("Jours", "Days")}</span>
                  <div className="flex gap-1 mt-1">
                    {WEEKDAYS.map((d) => {
                      const on = recOn.includes(d.n);
                      return (
                        <button key={d.n} type="button" aria-pressed={on}
                          aria-label={`${L("Jour", "Day")} ${d.n}`}
                          onClick={() => setRecOn((prev) => (on ? prev.filter((x) => x !== d.n) : [...prev, d.n].sort()))}
                          className="flex-1 min-h-[40px] rounded-xl text-xs font-semibold"
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
            className="w-full min-h-[44px] rounded-xl text-sm font-medium" style={fieldStyle}>
            {showAdvanced ? L("Masquer les options avancées", "Hide advanced options") : L("Options avancées", "Advanced options")}
          </button>

          {showAdvanced && (
            <div className="space-y-3">
              <Toggle label={L("Notifier le client", "Notify the client")} checked={notifyClient} onChange={setNotifyClient} />
              <Toggle label={L("Notifier le client secondaire", "Notify the secondary client")} checked={notifyClientSecondary} onChange={setNotifyClientSecondary} />
              <Toggle label={L("Notifier l'adjoint(e)", "Notify the assistant")} checked={notifyAssistant} onChange={setNotifyAssistant} />
              {notifyAssistant && (
                <label className="block">
                  <span className={labelCls} style={labelStyle}>{L("Adjoint(e) (users_id)", "Assistant (users_id)")}</span>
                  <input className={field} style={fieldStyle} inputMode="numeric" value={assistantId}
                    aria-label={L("Adjoint", "Assistant")} onChange={(e) => setAssistantId(e.target.value)} />
                  <FieldError keys={["assistant_users_id"]} />
                </label>
              )}
              <label className="block">
                <span className={labelCls} style={labelStyle}>{L("Notifier ces utilisateurs (IDs)", "Notify these users (IDs)")}</span>
                <input className={field} style={fieldStyle} value={notifyTo}
                  aria-label={L("Notifier ces utilisateurs", "Notify these users")}
                  onChange={(e) => setNotifyTo(e.target.value)} placeholder="1024, 2048" />
                <FieldError keys={["send_notification_to"]} />
              </label>
              <label className="block">
                <span className={labelCls} style={labelStyle}>{L("Destinataires de la notification client (IDs)", "Client notification recipients (IDs)")}</span>
                <input className={field} style={fieldStyle} value={notificationUsers}
                  aria-label={L("Destinataires de la notification", "Notification recipients")}
                  onChange={(e) => setNotificationUsers(e.target.value)} placeholder="387460525" />
                <FieldError keys={["notification_users"]} />
              </label>
              <label className="block">
                <span className={labelCls} style={labelStyle}>{L("Expéditeur de la notification (users_id)", "Notification sender (users_id)")}</span>
                <input className={field} style={fieldStyle} inputMode="numeric" value={notifyFrom}
                  aria-label={L("Expéditeur de la notification", "Notification sender")}
                  onChange={(e) => setNotifyFrom(e.target.value)} />
                <FieldError keys={["send_notification_from"]} />
              </label>

              <Toggle label={L("Programmer l'envoi", "Schedule the send")} checked={scheduled} onChange={setScheduled} />
              {scheduled && (
                <label className="block">
                  <span className={labelCls} style={labelStyle}>{L("Envoyer le (America/Toronto)", "Send on (America/Toronto)")}</span>
                  <input type="datetime-local" className={field} style={fieldStyle} value={scheduledAt}
                    aria-label={L("Date d'envoi", "Send date")} onChange={(e) => setScheduledAt(e.target.value)} />
                  <FieldError keys={["scheduled_at"]} />
                </label>
              )}

              <Toggle label={L("Mettre à jour le statut du dossier", "Update the file status")} checked={updateStatus} onChange={setUpdateStatus} />
            </div>
          )}

          {err && <p className="text-xs" role="alert" style={{ color: "var(--pp-danger)" }}>{err}</p>}

          <button type="submit" disabled={busy}
            className="w-full min-h-[48px] rounded-xl font-semibold text-white disabled:opacity-60"
            style={{ background: "var(--pp-brand-accent)" }}>
            {busy ? L("Enregistrement…", "Saving…") : L("Enregistrer", "Save")}
          </button>
        </form>
        )}
      </div>
    </div>
  ), host);
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch" aria-checked={checked} aria-label={label}
      onClick={() => onChange(!checked)}
      className="w-full min-h-[44px] flex items-center justify-between rounded-xl px-3 text-sm"
      style={{ background: "var(--pp-bg-surface)", border: "1px solid var(--pp-bg-border)", color: "var(--pp-text-primary)" }}>
      <span className="text-left pr-2">{label}</span>
      <span className="w-10 h-6 rounded-full flex items-center px-0.5 shrink-0"
        style={{ background: checked ? "var(--pp-brand-accent)" : "var(--pp-bg-border)" }}>
        <span className="w-5 h-5 rounded-full bg-white transition-transform"
          style={{ transform: checked ? "translateX(16px)" : "translateX(0)" }} />
      </span>
    </button>
  );
}
