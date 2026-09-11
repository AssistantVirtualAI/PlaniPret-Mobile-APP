import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, CalendarClock, ExternalLink, FolderKanban, MessageSquare, Phone, PhoneIncoming, PhoneMissed, PhoneOutgoing, User, Wallet } from "lucide-react";
import MaestroTaskRow from "@/components/planipret/mobile/MaestroTaskRow";
import { formatTaskDue, type NormalizedTask } from "@/lib/planipret/tasks";
import {
  buildClientBundles, clientKey as makeKey, fetchClientCalls, fetchClientDeals, fetchClientDeposits,
  fetchClientMessages,
  type ClientBundle, type ClientCall, type ClientDeal, type ClientDeposit, type ClientMessage,
} from "@/lib/planipret/clientMaestro";
import { supabase } from "@/integrations/supabase/client";
import { maestroContractUrl } from "@/lib/planipret/maestroLinks";

type MaestroContract = {
  contract_id: string;
  contract_number: string | null;
  status: string | null;
  maestro_status: string | null;
  loan_amt: number | null;
  rate: string | null;
  date_closing: string | null;
  date_maturity: string | null;
  clients: { id?: string; name?: string; email?: string | null }[] | null;
  broker_name: string | null;
  last_activity_at: string | null;
};

const cad = (n: number) =>
  new Intl.NumberFormat("fr-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 }).format(n || 0);

/**
 * Écran détaillé d'un seul client Maestro : tâches, dossiers, appels
 * (historique, statut, date) et commissions — même données que le Suivi
 * par client, mais dépliées sur une page dédiée.
 */
export default function ClientMaestroDetail({
  clientKey, tasks, userIds, lang, lastSyncAt, loading, variant = "admin", onDraftSms,
}: {
  clientKey: string;
  tasks: NormalizedTask[];
  userIds: string[];
  lang: "fr" | "en";
  lastSyncAt?: string | null;
  loading?: boolean;
  /** Détermine vers quelles pages pointent les liens « voir la conversation ». */
  variant?: "admin" | "mobile";
  /** Ouvre un brouillon de texto (mobile) : rien n'est envoyé sans confirmation. */
  onDraftSms?: (target: { name: string; number: string; clientKey: string }) => void;
}) {
  const en = lang === "en";
  const L = (fr: string, e: string) => (en ? e : fr);

  const [deals, setDeals] = useState<ClientDeal[]>([]);
  const [deposits, setDeposits] = useState<ClientDeposit[]>([]);
  const [calls, setCalls] = useState<ClientCall[]>([]);
  const [messages, setMessages] = useState<ClientMessage[]>([]);
  const [brokerNames, setBrokerNames] = useState<Record<string, string>>({});
  const [contracts, setContracts] = useState<MaestroContract[]>([]);

  const idsKey = userIds.filter(Boolean).sort().join(",");

  const load = useCallback(async () => {
    const ids = idsKey ? idsKey.split(",") : [];
    const [d, dep, cl, ms] = await Promise.all([
      fetchClientDeals(ids), fetchClientDeposits(), fetchClientCalls(ids), fetchClientMessages(ids),
    ]);
    setDeals(d); setDeposits(dep); setCalls(cl); setMessages(ms);
    const { data: ct } = await supabase
      .from("planipret_contracts")
      .select("contract_id, contract_number, status, maestro_status, loan_amt, rate, date_closing, date_maturity, clients, broker_name, last_activity_at")
      .order("last_activity_at", { ascending: false, nullsFirst: false })
      .limit(1000);
    setContracts((ct ?? []) as unknown as MaestroContract[]);
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
      .on("postgres_changes", { event: "*", schema: "public", table: "planipret_phone_messages" }, bump)
      .subscribe();
    return () => { if (timer) clearTimeout(timer); void supabase.removeChannel(ch); };
  }, [load, idsKey]);

  const bundle: ClientBundle | undefined = useMemo(() => {
    const key = makeKey(decodeURIComponent(clientKey));
    return buildClientBundles(tasks, deals, deposits, calls, messages).find((b) => b.key === key);
  }, [tasks, deals, deposits, calls, messages, clientKey]);

  // Dossiers Maestro rattachés à ce client (correspondance par nom normalisé).
  const clientContracts = useMemo(() => {
    const key = makeKey(decodeURIComponent(clientKey));
    if (!key) return [] as MaestroContract[];
    return contracts.filter((c) =>
      (c.clients ?? []).some((cl) => makeKey(cl?.name) === key),
    );
  }, [contracts, clientKey]);

  const brokerIdsKey = (bundle?.brokerIds ?? []).join(",");
  useEffect(() => {
    const ids = brokerIdsKey ? brokerIdsKey.split(",") : [];
    if (!ids.length) return;
    let alive = true;
    void (async () => {
      const { data } = await supabase
        .from("planipret_profiles").select("user_id, full_name, email").in("user_id", ids);
      if (!alive) return;
      const map: Record<string, string> = {};
      for (const p of (data ?? []) as any[]) map[String(p.user_id)] = p.full_name || p.email || String(p.user_id).slice(0, 8);
      setBrokerNames(map);
    })();
    return () => { alive = false; };
  }, [brokerIdsKey]);

  const surface = { background: "var(--pp-bg-surface)", border: "1px solid var(--pp-bg-border)", color: "var(--pp-text-primary)" };

  if (loading) {
    return <div className="space-y-2">{[0, 1, 2].map((i) => <div key={i} className="h-16 rounded-lg animate-pulse" style={{ background: "#E2E8F0" }} />)}</div>;
  }
  if (!bundle) {
    return <p className="text-sm py-6 text-center" style={{ color: "var(--pp-text-muted)" }}>{L("Client introuvable.", "Client not found.")}</p>;
  }

  const b = bundle;

  // Liens « voir la conversation » : page Appels / Textos de l'admin, ou
  // l'écran correspondant dans l'app mobile.
  const peerOf = (x: { direction: string | null; from_number: string | null; to_number: string | null }) =>
    String((x.direction === "outbound" ? x.to_number : x.from_number) ?? "").trim();
  const callLink = (c: ClientCall) => {
    const peer = peerOf(c);
    return variant === "mobile"
      ? `/mplanipret/calls?tab=recents${peer ? `&peer=${encodeURIComponent(peer)}` : ""}`
      : `/planipret/admin/calls${peer ? `?search=${encodeURIComponent(peer)}` : ""}`;
  };
  const messageLink = (m: ClientMessage) => {
    const peer = peerOf(m);
    return variant === "mobile"
      ? `/mplanipret/messages?tab=sms${peer ? `&to=${encodeURIComponent(peer)}&name=${encodeURIComponent(b.name)}` : ""}`
      : `/planipret/admin/messages${peer ? `?peer=${encodeURIComponent(peer)}` : ""}`;
  };

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
          <Badge tone="info" icon={<MessageSquare className="w-3 h-3" />} text={`${b.messages.length} ${L("textos", "texts")}`} />
          {b.brokerIds.map((id) => (
            <Badge key={id} tone="muted" icon={<User className="w-3 h-3" />} text={brokerNames[id] ?? id.slice(0, 8)} />
          ))}
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
        {onDraftSms && (
          <button
            className="mt-2.5 w-full rounded-xl px-3 py-2.5 text-sm font-semibold flex items-center justify-center gap-2"
            style={{ background: "var(--pp-brand, #2E9BDC)", color: "#fff" }}
            onClick={() => onDraftSms({
              name: b.name,
              number: [...b.messages, ...b.calls].map(peerOf).find((n) => n.replace(/\D/g, "").length >= 10) ?? "",
              clientKey: b.key,
            })}
          >
            <MessageSquare className="w-4 h-4" />
            {L("Préparer un texto", "Draft a text")}
          </button>
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
                  {c.ai_summary && (
                    <span className="block break-words mt-1 rounded-md px-2 py-1.5" style={{ background: "rgba(37,99,235,0.06)", color: "var(--pp-text-primary)" }}>
                      <span className="block text-[10px] uppercase tracking-wide mb-0.5" style={{ color: "var(--pp-brand-accent)" }}>
                        {L("Résumé IA", "AI summary")}
                      </span>
                      {c.ai_summary}
                    </span>
                  )}
                  <span className="flex flex-wrap items-center gap-x-3 mt-1">
                    <Link to={callLink(c)} className="underline" style={{ color: "var(--pp-brand-accent)" }}>
                      {L("Voir la conversation", "Open conversation")}
                    </Link>
                    {c.recording_url && (
                      <a href={c.recording_url} target="_blank" rel="noreferrer" className="underline" style={{ color: "var(--pp-brand-accent)" }}>
                        {L("Écouter l'enregistrement", "Play recording")}
                      </a>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Card title={L("Textos", "Texts")} surface={surface}>
        {b.messages.length === 0 ? <Empty text={L("Aucun texto.", "No text.")} /> : (
          <ul className="space-y-1.5">
            {b.messages.map((m) => (
              <li key={m.id} className="rounded-lg px-2 py-2 text-[11.5px]" style={{ background: "#F7F9FC", color: "var(--pp-text-muted)" }}>
                <span className="flex flex-wrap items-center gap-x-2">
                  <MessageSquare className="w-3.5 h-3.5" style={{ color: m.direction === "outbound" ? "var(--pp-brand-accent)" : "#047857" }} />
                  <span style={{ color: "var(--pp-text-primary)", fontWeight: 600 }}>
                    {m.created_at ? new Date(m.created_at).toLocaleString(en ? "en-CA" : "fr-CA", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "America/Toronto" }) : "—"}
                  </span>
                  <span>{m.direction === "outbound" ? L("envoyé", "sent") : L("reçu", "received")}</span>
                  <span>{m.direction === "outbound" ? (m.to_number ?? "—") : (m.from_number ?? "—")}</span>
                </span>
                {m.body && <span className="block break-words mt-0.5" style={{ color: "var(--pp-text-primary)" }}>{m.body}</span>}
                <Link to={messageLink(m)} className="underline mt-1 inline-block" style={{ color: "var(--pp-brand-accent)" }}>
                  {L("Voir la conversation", "Open conversation")}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title={L("Dossiers Maestro", "Maestro files")} surface={surface}>
        {clientContracts.length === 0 ? <Empty text={L("Aucun dossier Maestro rattaché.", "No linked Maestro file.")} /> : (
          <ul className="space-y-1.5">
            {clientContracts.map((c) => (
              <li key={`${c.contract_id}-${c.contract_number ?? ""}`} className="rounded-lg px-2 py-2" style={{ background: "#F7F9FC" }}>
                <div className="flex flex-wrap items-center gap-x-2 text-[11.5px]" style={{ color: "var(--pp-text-muted)" }}>
                  <span style={{ color: "var(--pp-text-primary)", fontWeight: 600 }}>
                    {c.contract_number ? `${L("Dossier", "File")} ${c.contract_number}` : `${L("Contrat", "Contract")} ${c.contract_id}`}
                  </span>
                  <span>{c.maestro_status || c.status || "—"}</span>
                  {c.loan_amt ? <span>{cad(Number(c.loan_amt))}</span> : null}
                  {c.rate ? <span>{c.rate}%</span> : null}
                  {c.date_closing ? <span>{L("clôture", "closing")} {c.date_closing}</span> : null}
                </div>
                <a
                  href={maestroContractUrl(c.contract_id)}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1.5 inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-[12px] font-semibold min-h-[36px]"
                  style={{ background: "var(--pp-brand, #2E9BDC)", color: "#fff" }}
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  {L("Ouvrir dans Maestro", "Open in Maestro")}
                </a>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title={L("Dossiers locaux", "Local files")} surface={surface}>
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
