import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CalendarClock, ChevronDown, ChevronRight, ExternalLink, FolderKanban, Phone, PhoneIncoming, PhoneMissed, PhoneOutgoing, Search, Wallet } from "lucide-react";
import MaestroTaskRow from "@/components/planipret/mobile/MaestroTaskRow";
import { formatTaskDue, type NormalizedTask } from "@/lib/planipret/tasks";
import {
  buildClientBundles, fetchClientCalls, fetchClientDeals, fetchClientDeposits,
  type ClientBundle, type ClientCall, type ClientDeal, type ClientDeposit,
} from "@/lib/planipret/clientMaestro";
import { supabase } from "@/integrations/supabase/client";

const cad = (n: number) =>
  new Intl.NumberFormat("fr-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 }).format(n || 0);

/**
 * Suivi Maestro par client : tâches (avec alertes d'échéance), dossiers et
 * dépôts de commission. Même format de ligne que la page Tâches Maestro.
 */
export default function ClientMaestro360({
  tasks, userIds, lang, lastSyncAt, loading, onOpenClient,
}: {
  tasks: NormalizedTask[];
  /** Propriétaires des dossiers locaux à inclure. */
  userIds: string[];
  lang: "fr" | "en";
  lastSyncAt?: string | null;
  loading?: boolean;
  /** Ouvre l'écran dédié d'un client (fiche complète). */
  onOpenClient?: (clientKey: string) => void;
}) {
  const en = lang === "en";
  const L = (fr: string, e: string) => (en ? e : fr);

  const [deals, setDeals] = useState<ClientDeal[]>([]);
  const [deposits, setDeposits] = useState<ClientDeposit[]>([]);
  const [calls, setCalls] = useState<ClientCall[]>([]);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [alertsOnly, setAlertsOnly] = useState(false);

  const idsKey = userIds.filter(Boolean).sort().join(",");

  const load = useCallback(async () => {
    const ids = idsKey ? idsKey.split(",") : [];
    const [d, dep, cl] = await Promise.all([
      fetchClientDeals(ids),
      fetchClientDeposits(),
      fetchClientCalls(ids),
    ]);
    setDeals(d); setDeposits(dep); setCalls(cl);
  }, [idsKey]);

  useEffect(() => { void load(); }, [load]);

  // Temps réel : les dossiers et dépôts se rafraîchissent dès que Maestro
  // pousse une modification (même logique que les tâches).
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const bump = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => { void load(); }, 600);
    };
    const ch = supabase
      .channel(`pp-clients-360-rt-${idsKey || "self"}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "planipret_pipeline" }, bump)
      .on("postgres_changes", { event: "*", schema: "public", table: "planipret_commission_register" }, bump)
      .on("postgres_changes", { event: "*", schema: "public", table: "planipret_phone_calls" }, bump)
      .subscribe();
    return () => { if (timer) clearTimeout(timer); void supabase.removeChannel(ch); };
  }, [load, idsKey]);

  const bundles = useMemo(() => buildClientBundles(tasks, deals, deposits, calls), [tasks, deals, deposits, calls]);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return bundles.filter((b) =>
      (!needle || b.name.toLowerCase().includes(needle)) &&
      (!alertsOnly || b.overdue + b.today > 0));
  }, [bundles, q, alertsOnly]);

  const surface = { background: "var(--pp-bg-surface)", border: "1px solid var(--pp-bg-border)", color: "var(--pp-text-primary)" };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <label className="relative flex-1 min-w-[180px]">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: "var(--pp-text-muted)" }} />
          <input
            value={q} onChange={(e) => setQ(e.target.value)}
            placeholder={L("Rechercher un client…", "Search a client…")}
            aria-label={L("Rechercher un client", "Search a client")}
            className="w-full min-h-[38px] rounded-lg pl-8 pr-2 text-xs" style={surface}
          />
        </label>
        <button
          onClick={() => setAlertsOnly((v) => !v)}
          className="min-h-[38px] px-3 rounded-lg text-xs inline-flex items-center gap-1.5"
          style={alertsOnly ? { background: "rgba(239,68,68,0.12)", color: "#B91C1C", border: "1px solid rgba(239,68,68,0.3)" } : surface}
        >
          <AlertTriangle className="w-3.5 h-3.5" /> {L("Échéances critiques", "Due alerts")}
        </button>
        <span className="text-[11px]" style={{ color: "var(--pp-text-muted)" }}>
          {rows.length} {L("clients", "clients")}
          {lastSyncAt ? ` · ${L("synchro", "sync")} ${new Date(lastSyncAt).toLocaleTimeString(en ? "en-CA" : "fr-CA", { timeZone: "America/Toronto" })}` : ""}
        </span>
      </div>

      {loading ? (
        <div className="space-y-2">{[0, 1, 2].map((i) => <div key={i} className="h-14 rounded-lg animate-pulse" style={{ background: "#E2E8F0" }} />)}</div>
      ) : rows.length === 0 ? (
        <p className="text-sm py-6 text-center" style={{ color: "var(--pp-text-muted)" }}>
          {L("Aucun client Maestro trouvé.", "No Maestro client found.")}
        </p>
      ) : (
        <ul className="space-y-1.5">
          {rows.map((b) => (
            <li key={b.key} className="rounded-xl overflow-hidden" style={surface}>
              <button
                onClick={() => setOpen(open === b.key ? null : b.key)}
                className="w-full text-left px-3 py-2.5 flex items-center gap-2"
                aria-expanded={open === b.key}
              >
                {open === b.key ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                <span className="text-sm font-semibold truncate">{b.name}</span>
                <span className="ml-auto flex items-center gap-1.5 flex-wrap justify-end">
                  {b.overdue > 0 && <Badge tone="danger" icon={<AlertTriangle className="w-3 h-3" />} text={`${b.overdue} ${L("en retard", "overdue")}`} />}
                  {b.today > 0 && <Badge tone="warn" icon={<CalendarClock className="w-3 h-3" />} text={L("aujourd'hui", "today")} />}
                  {b.upcoming > 0 && <Badge tone="info" text={`${b.upcoming} ${L("à venir", "upcoming")}`} />}
                  {b.deals.length > 0 && <Badge tone="muted" icon={<FolderKanban className="w-3 h-3" />} text={`${b.deals.length}`} />}
                  {b.calls.length > 0 && <Badge tone="info" icon={<Phone className="w-3 h-3" />} text={`${b.calls.length}`} />}
                  {b.depositTotal > 0 && <Badge tone="ok" icon={<Wallet className="w-3 h-3" />} text={cad(b.depositTotal)} />}
                </span>
              </button>
              {onOpenClient && (
                <div className="px-3 pb-2 -mt-1">
                  <button
                    onClick={() => onOpenClient(b.key)}
                    className="text-[11px] font-semibold inline-flex items-center gap-1"
                    style={{ color: "var(--pp-brand-accent)" }}
                  >
                    {L("Ouvrir la fiche client", "Open client file")} <ChevronRight className="w-3 h-3" />
                  </button>
                </div>
              )}

              {open === b.key && (
                <div className="px-3 pb-3 space-y-3">
                  <Section title={L("Tâches", "Tasks")}>
                    {b.tasks.length === 0 ? <Empty text={L("Aucune tâche.", "No task.")} /> : (
                      <ul className="space-y-1.5">
                        {b.tasks.map((t) => (
                          <li key={t.id} className="rounded-lg px-2 py-2" style={{ background: "#F7F9FC" }}>
                            <MaestroTaskRow task={t} lang={lang} syncedAt={(t as any)?.raw?.updated_at ?? lastSyncAt ?? null} />
                          </li>
                        ))}
                      </ul>
                    )}
                  </Section>

                  <Section title={L("Dossiers", "Files")}>
                    {b.deals.length === 0 ? <Empty text={L("Aucun dossier.", "No file.")} /> : (
                      <ul className="space-y-1">
                        {b.deals.map((d) => (
                          <li key={d.id} className="text-[11.5px] flex flex-wrap gap-x-2" style={{ color: "var(--pp-text-muted)" }}>
                            <span style={{ color: "var(--pp-text-primary)", fontWeight: 600 }}>{d.stage || "—"}</span>
                            <span>{d.contact_number || "—"}</span>
                            <span>{cad(Number(d.value_estimate ?? 0))}</span>
                            <span>{d.updated_at ? new Date(d.updated_at).toLocaleDateString(en ? "en-CA" : "fr-CA") : "—"}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </Section>

                  <Section title={L("Appels et historique", "Calls & history")}>
                    {b.calls.length === 0 ? <Empty text={L("Aucun appel.", "No call.")} /> : (
                      <ul className="space-y-2">
                        {b.calls.slice(0, 20).map((c) => {
                          const missed = c.direction === "missed" || c.status === "missed" || c.status === "no-answer";
                          const out = c.direction === "outbound";
                          const Icon = missed ? PhoneMissed : out ? PhoneOutgoing : PhoneIncoming;
                          const secs = Number(c.duration_seconds ?? 0);
                          const status = missed
                            ? L("Manqué", "Missed")
                            : c.status === "completed"
                              ? L("Terminé", "Completed")
                              : c.status || (out ? L("Sortant", "Outbound") : L("Entrant", "Inbound"));
                          return (
                            <li key={c.id} className="rounded-lg px-2.5 py-2 text-[11.5px]" style={{ background: "var(--pp-bg-elevated)", color: "var(--pp-text-muted)" }}>
                              <div className="flex items-start gap-2">
                                <Icon className="w-3.5 h-3.5 mt-0.5 shrink-0" style={{ color: missed ? "var(--pp-status-danger)" : "var(--pp-brand-accent)" }} />
                                <div className="min-w-0 flex-1">
                                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                                    <span style={{ color: "var(--pp-text-primary)", fontWeight: 600 }}>{status}</span>
                                    <span>{out ? (c.to_number ?? "—") : (c.from_number ?? "—")}</span>
                                    <span>{missed ? "—" : `${Math.floor(secs / 60)}m ${secs % 60}s`}</span>
                                  </div>
                                  <div className="mt-0.5 flex flex-wrap items-center gap-x-2">
                                    <time dateTime={c.started_at ?? undefined}>
                                      {c.started_at ? new Date(c.started_at).toLocaleString(en ? "en-CA" : "fr-CA", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "America/Toronto" }) : "—"}
                                    </time>
                                  </div>
                                </div>
                                {c.recording_url && (
                                  <a href={c.recording_url} target="_blank" rel="noreferrer" aria-label={L("Ouvrir l’enregistrement", "Open recording")} className="shrink-0 inline-flex items-center gap-1 font-semibold" style={{ color: "var(--pp-brand-accent)" }}>
                                    <ExternalLink className="w-3.5 h-3.5" /> {L("Écouter", "Listen")}
                                  </a>
                                )}
                              </div>
                              {c.ai_summary && <span className="block break-words">{c.ai_summary}</span>}
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </Section>

                  <Section title={L("Commissions", "Commissions")}>
                    {b.deposits.length === 0 ? <Empty text={L("Aucun dépôt.", "No deposit.")} /> : (
                      <ul className="space-y-1">
                        {b.deposits.slice(0, 12).map((dep, i) => (
                          <li key={`${dep.id ?? i}`} className="text-[11.5px] flex flex-wrap gap-x-2" style={{ color: "var(--pp-text-muted)" }}>
                            <span style={{ color: "var(--pp-text-primary)", fontWeight: 600 }}>{cad(Number(dep.amount ?? 0))}</span>
                            <span>{dep.date_trans ?? "—"}</span>
                            <span>{dep.institution ?? "—"}</span>
                            <span>{dep.number ?? ""}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </Section>

                  {b.nextDue && (
                    <p className="text-[11px]" style={{ color: "var(--pp-text-muted)" }}>
                      {L("Prochaine échéance", "Next due")} : {formatTaskDue(b.nextDue, lang)}
                    </p>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Badge({ text, icon, tone }: { text: string; icon?: React.ReactNode; tone: "danger" | "warn" | "info" | "ok" | "muted" }) {
  const tones: Record<string, React.CSSProperties> = {
    danger: { background: "rgba(239,68,68,0.12)", color: "#B91C1C" },
    warn: { background: "rgba(245,158,11,0.14)", color: "#B45309" },
    info: { background: "rgba(37,99,235,0.10)", color: "var(--pp-brand-accent)" },
    ok: { background: "rgba(16,185,129,0.12)", color: "#047857" },
    muted: { background: "rgba(100,116,139,0.12)", color: "#475569" },
  };
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full" style={tones[tone]}>
      {icon}{text}
    </span>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide mb-1" style={{ color: "var(--pp-text-muted)" }}>{title}</p>
      {children}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="text-[11.5px]" style={{ color: "var(--pp-text-muted)" }}>{text}</p>;
}
