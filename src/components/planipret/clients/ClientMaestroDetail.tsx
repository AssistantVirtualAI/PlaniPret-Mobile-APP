import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CalendarClock, FolderKanban, Phone, PhoneIncoming, PhoneMissed, PhoneOutgoing, Wallet } from "lucide-react";
import MaestroTaskRow from "@/components/planipret/mobile/MaestroTaskRow";
import { formatTaskDue, type NormalizedTask } from "@/lib/planipret/tasks";
import {
  buildClientBundles, clientKey as makeKey, fetchClientCalls, fetchClientDeals, fetchClientDeposits,
  type ClientBundle, type ClientCall, type ClientDeal, type ClientDeposit,
} from "@/lib/planipret/clientMaestro";
import { supabase } from "@/integrations/supabase/client";

const cad = (n: number) =>
  new Intl.NumberFormat("fr-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 }).format(n || 0);

/**
 * Écran détaillé d'un seul client Maestro : tâches, dossiers, appels
 * (historique, statut, date) et commissions — même données que le Suivi
 * par client, mais dépliées sur une page dédiée.
 */
export default function ClientMaestroDetail({
  clientKey, tasks, userIds, lang, lastSyncAt, loading,
}: {
  clientKey: string;
  tasks: NormalizedTask[];
  userIds: string[];
  lang: "fr" | "en";
  lastSyncAt?: string | null;
  loading?: boolean;
}) {
  const en = lang === "en";
  const L = (fr: string, e: string) => (en ? e : fr);

  const [deals, setDeals] = useState<ClientDeal[]>([]);
  const [deposits, setDeposits] = useState<ClientDeposit[]>([]);
  const [calls, setCalls] = useState<ClientCall[]>([]);

  const idsKey = userIds.filter(Boolean).sort().join(",");

  const load = useCallback(async () => {
    const ids = idsKey ? idsKey.split(",") : [];
    const [d, dep, cl] = await Promise.all([fetchClientDeals(ids), fetchClientDeposits(), fetchClientCalls(ids)]);
    setDeals(d); setDeposits(dep); setCalls(cl);
  }, [idsKey]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const bump = () => { if (timer) clearTimeout(timer); timer = setTimeout(() => { void load(); }, 600); };
    const ch = supabase
      .channel(`pp-client-detail-rt-${idsKey || "self"}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "planipret_pipeline" }, bump)
      .on("postgres_changes", { event: "*", schema: "public", table: "planipret_commission_register" }, bump)
      .on("postgres_changes", { event: "*", schema: "public", table: "planipret_phone_calls" }, bump)
      .subscribe();
    return () => { if (timer) clearTimeout(timer); void supabase.removeChannel(ch); };
  }, [load, idsKey]);

  const bundle: ClientBundle | undefined = useMemo(() => {
    const key = makeKey(decodeURIComponent(clientKey));
    return buildClientBundles(tasks, deals, deposits, calls).find((b) => b.key === key);
  }, [tasks, deals, deposits, calls, clientKey]);

  const surface = { background: "var(--pp-bg-surface)", border: "1px solid var(--pp-bg-border)", color: "var(--pp-text-primary)" };

  if (loading) {
    return <div className="space-y-2">{[0, 1, 2].map((i) => <div key={i} className="h-16 rounded-lg animate-pulse" style={{ background: "#E2E8F0" }} />)}</div>;
  }
  if (!bundle) {
    return <p className="text-sm py-6 text-center" style={{ color: "var(--pp-text-muted)" }}>{L("Client introuvable.", "Client not found.")}</p>;
  }

  const b = bundle;

  return (
    <div className="space-y-3">
      <div className="rounded-xl px-3 py-3" style={surface}>
        <h2 className="text-base font-semibold">{b.name}</h2>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {b.overdue > 0 && <Badge tone="danger" icon={<AlertTriangle className="w-3 h-3" />} text={`${b.overdue} ${L("en retard", "overdue")}`} />}
          {b.today > 0 && <Badge tone="warn" icon={<CalendarClock className="w-3 h-3" />} text={L("aujourd'hui", "today")} />}
          {b.upcoming > 0 && <Badge tone="info" text={`${b.upcoming} ${L("à venir", "upcoming")}`} />}
          <Badge tone="muted" icon={<FolderKanban className="w-3 h-3" />} text={`${b.deals.length} ${L("dossiers", "files")}`} />
          <Badge tone="info" icon={<Phone className="w-3 h-3" />} text={`${b.calls.length} ${L("appels", "calls")}`} />
          {b.depositTotal > 0 && <Badge tone="ok" icon={<Wallet className="w-3 h-3" />} text={cad(b.depositTotal)} />}
        </div>
        {b.nextDue && (
          <p className="text-[11px] mt-1.5" style={{ color: "var(--pp-text-muted)" }}>
            {L("Prochaine échéance", "Next due")} : {formatTaskDue(b.nextDue, lang)}
          </p>
        )}
        {lastSyncAt && (
          <p className="text-[11px]" style={{ color: "var(--pp-text-muted)" }}>
            {L("Synchro", "Sync")} {new Date(lastSyncAt).toLocaleTimeString(en ? "en-CA" : "fr-CA", { timeZone: "America/Toronto" })}
          </p>
        )}
      </div>

      <Card title={L("Tâches", "Tasks")} surface={surface}>
        {b.tasks.length === 0 ? <Empty text={L("Aucune tâche.", "No task.")} /> : (
          <ul className="space-y-1.5">
            {b.tasks.map((t) => (
              <li key={t.id} className="rounded-lg px-2 py-2" style={{ background: "#F7F9FC" }}>
                <MaestroTaskRow task={t} lang={lang} syncedAt={(t as any)?.raw?.updated_at ?? lastSyncAt ?? null} />
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title={L("Appels et historique", "Calls & history")} surface={surface}>
        {b.calls.length === 0 ? <Empty text={L("Aucun appel.", "No call.")} /> : (
          <ul className="space-y-1.5">
            {b.calls.map((c) => {
              const missed = c.direction === "missed" || c.status === "missed" || c.status === "no-answer";
              const out = c.direction === "outbound";
              const Icon = missed ? PhoneMissed : out ? PhoneOutgoing : PhoneIncoming;
              const secs = Number(c.duration_seconds ?? 0);
              return (
                <li key={c.id} className="rounded-lg px-2 py-2 text-[11.5px]" style={{ background: "#F7F9FC", color: "var(--pp-text-muted)" }}>
                  <span className="flex flex-wrap items-center gap-x-2">
                    <Icon className="w-3.5 h-3.5" style={{ color: missed ? "#B91C1C" : out ? "var(--pp-brand-accent)" : "#047857" }} />
                    <span style={{ color: "var(--pp-text-primary)", fontWeight: 600 }}>
                      {c.started_at ? new Date(c.started_at).toLocaleString(en ? "en-CA" : "fr-CA", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "America/Toronto" }) : "—"}
                    </span>
                    <span>{missed ? L("manqué", "missed") : (c.status ?? L("terminé", "completed"))}</span>
                    <span>{missed ? "" : `${Math.floor(secs / 60)}m ${secs % 60}s`}</span>
                    <span>{out ? (c.to_number ?? "—") : (c.from_number ?? "—")}</span>
                  </span>
                  {c.ai_summary && <span className="block break-words mt-0.5">{c.ai_summary}</span>}
                  {c.recording_url && (
                    <a href={c.recording_url} target="_blank" rel="noreferrer" className="underline" style={{ color: "var(--pp-brand-accent)" }}>
                      {L("Écouter l'enregistrement", "Play recording")}
                    </a>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Card title={L("Dossiers", "Files")} surface={surface}>
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
      </Card>

      <Card title={L("Commissions", "Commissions")} surface={surface}>
        {b.deposits.length === 0 ? <Empty text={L("Aucun dépôt.", "No deposit.")} /> : (
          <ul className="space-y-1">
            {b.deposits.map((dep, i) => (
              <li key={`${dep.id ?? i}`} className="text-[11.5px] flex flex-wrap gap-x-2" style={{ color: "var(--pp-text-muted)" }}>
                <span style={{ color: "var(--pp-text-primary)", fontWeight: 600 }}>{cad(Number(dep.amount ?? 0))}</span>
                <span>{dep.date_trans ?? "—"}</span>
                <span>{dep.institution ?? "—"}</span>
                <span>{dep.number ?? ""}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function Card({ title, surface, children }: { title: string; surface: React.CSSProperties; children: React.ReactNode }) {
  return (
    <section className="rounded-xl px-3 py-3" style={surface}>
      <p className="text-[10px] uppercase tracking-wide mb-1.5" style={{ color: "var(--pp-text-muted)" }}>{title}</p>
      {children}
    </section>
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

function Empty({ text }: { text: string }) {
  return <p className="text-[11.5px]" style={{ color: "var(--pp-text-muted)" }}>{text}</p>;
}
