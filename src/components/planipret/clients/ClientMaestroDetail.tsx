import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle, CalendarClock, FolderKanban, Mail, MapPin, MessageSquare,
  Phone, PhoneIncoming, PhoneMissed, PhoneOutgoing, RefreshCw, User, Wallet,
} from "lucide-react";
import MaestroTaskRow from "@/components/planipret/mobile/MaestroTaskRow";
import { formatTaskDue, type NormalizedTask } from "@/lib/planipret/tasks";
import {
  buildClientBundles, clientKey as makeKey, fetchClientCalls, fetchClientContacts, fetchClientDeals, fetchClientDeposits,
  fetchClientMessages, type ClientBundle, type ClientCall, type ClientContact, type ClientDeal, type ClientDeposit, type ClientMessage,
} from "@/lib/planipret/clientMaestro";
import {
  clientProfileErrorMessage, maestroClientProfileFromPayload, mergeClientProfile,
  type MaestroClientProfile,
} from "@/lib/planipret/clientProfile";
import { supabase } from "@/integrations/supabase/client";

const cad = (n: number) =>
  new Intl.NumberFormat("fr-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 }).format(n || 0);

const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((word) => word[0]).join("").toUpperCase() || "CL";

/**
 * Fiche d'un client Maestro. Le profil direct est l'autorité pour l'identité:
 * l'historique local enrichit la fiche, mais ne décide jamais si le client existe.
 */
export default function ClientMaestroDetail({
  clientKey, maestroClientId, tasks, userIds, lang, lastSyncAt, loading, onDraftSms,
}: {
  clientKey: string;
  maestroClientId?: string | null;
  onDraftSms?: (target: {
    name: string; number: string; clientKey: string;
    contractId?: string; contractNumber?: string | null; body?: string;
  }) => void;
  tasks: NormalizedTask[];
  userIds: string[];
  lang: "fr" | "en";
  lastSyncAt?: string | null;
  loading?: boolean;
}) {
  const en = lang === "en";
  const L = (fr: string, e: string) => (en ? e : fr);
  const decodedKey = useMemo(() => decodeURIComponent(clientKey), [clientKey]);

  const [deals, setDeals] = useState<ClientDeal[]>([]);
  const [deposits, setDeposits] = useState<ClientDeposit[]>([]);
  const [calls, setCalls] = useState<ClientCall[]>([]);
  const [messages, setMessages] = useState<ClientMessage[]>([]);
  const [contacts, setContacts] = useState<ClientContact[]>([]);
  const [brokerNames, setBrokerNames] = useState<Record<string, string>>({});
  const [profile, setProfile] = useState<MaestroClientProfile | null>(null);
  const [profileState, setProfileState] = useState<"loading" | "ready" | "not_found" | "error">("loading");
  const [profileError, setProfileError] = useState<string | null>(null);

  const idsKey = userIds.filter(Boolean).sort().join(",");

  const loadActivity = useCallback(async () => {
    const ids = idsKey ? idsKey.split(",") : [];
    const [d, dep, cl, ms, ct] = await Promise.all([
      fetchClientDeals(ids), fetchClientDeposits(), fetchClientCalls(ids), fetchClientMessages(ids), fetchClientContacts(ids, { search: decodedKey, limit: 300 }),
    ]);
    setDeals(d); setDeposits(dep); setCalls(cl); setMessages(ms); setContacts(ct);
  }, [idsKey, decodedKey]);

  const localBundle: ClientBundle | undefined = useMemo(() => {
    const key = makeKey(decodedKey);
    return buildClientBundles(tasks, deals, deposits, calls, messages, contacts).find((b) =>
      b.key === key || (!!maestroClientId && b.maestroClientId === String(maestroClientId)),
    );
  }, [tasks, deals, deposits, calls, messages, contacts, decodedKey, maestroClientId]);

  const fallbackContact = useMemo(() => {
    const key = makeKey(decodedKey);
    return contacts.find((contact) =>
      (!!maestroClientId && String(contact.maestroClientId ?? "") === String(maestroClientId)) || makeKey(contact.name) === key,
    ) ?? (localBundle ? {
      name: localBundle.name, phone: localBundle.phone, email: localBundle.email, maestroClientId: localBundle.maestroClientId,
    } : null);
  }, [contacts, decodedKey, maestroClientId, localBundle]);

  const resolvedMaestroId = maestroClientId || fallbackContact?.maestroClientId || localBundle?.maestroClientId || null;

  const loadProfile = useCallback(async () => {
    setProfileState("loading");
    setProfileError(null);
    try {
      let targetId = resolvedMaestroId;
      let fallback = fallbackContact;
      // Old links contain only a normalized name. Resolve through the official
      // client list once; do not use local activity as proof of existence.
      if (!targetId) {
        const { data, error } = await supabase.functions.invoke("maestro-actions", {
          body: { action: "list_clients", payload: { search: decodedKey, limit: 50 } },
        });
        if (error || (data as any)?.success === false) throw new Error((data as any)?.error ?? error?.message ?? "list_clients_failed");
        const rows = Array.isArray((data as any)?.clients) ? (data as any).clients : [];
        const exact = rows.find((item: any) => makeKey(String(item.full_name ?? item.display_name ?? item.name ?? [item.first_name, item.last_name].filter(Boolean).join(" "))) === makeKey(decodedKey));
        const row = exact ?? (rows.length === 1 ? rows[0] : null);
        if (!row) {
          setProfileState("not_found");
          return;
        }
        fallback = {
          name: String(row.full_name ?? row.display_name ?? row.name ?? [row.first_name, row.last_name].filter(Boolean).join(" ")).trim(),
          phone: row.phone ?? row.mobile ?? row.cell_phone ?? null,
          email: row.email ?? null,
          maestroClientId: String(row.id ?? row.client_id ?? "") || null,
        };
        targetId = fallback.maestroClientId;
      }
      if (!targetId) {
        setProfileState("not_found");
        return;
      }
      const { data, error } = await supabase.functions.invoke("maestro-actions", {
        body: { action: "client_profile", payload: { client_id: targetId } },
      });
      if (error || (data as any)?.success === false) throw new Error((data as any)?.error ?? error?.message ?? "client_profile_failed");
      const next = mergeClientProfile(maestroClientProfileFromPayload(data), fallback);
      if (!next) {
        setProfileState("not_found");
        return;
      }
      setProfile(next);
      setProfileState("ready");
    } catch (error) {
      setProfileState("error");
      setProfileError(clientProfileErrorMessage(error, lang));
    }
  }, [resolvedMaestroId, fallbackContact, decodedKey, lang]);

  useEffect(() => { void loadActivity(); }, [loadActivity]);
  useEffect(() => { void loadProfile(); }, [loadProfile]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const bump = () => { if (timer) clearTimeout(timer); timer = setTimeout(() => { void loadActivity(); }, 600); };
    const ch = supabase
      .channel(`pp-client-detail-rt-${idsKey || "self"}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "planipret_pipeline" }, bump)
      .on("postgres_changes", { event: "*", schema: "public", table: "planipret_commission_register" }, bump)
      .on("postgres_changes", { event: "*", schema: "public", table: "planipret_phone_calls" }, bump)
      .on("postgres_changes", { event: "*", schema: "public", table: "planipret_phone_messages" }, bump)
      .subscribe();
    return () => { if (timer) clearTimeout(timer); void supabase.removeChannel(ch); };
  }, [loadActivity, idsKey]);

  const b = localBundle ?? (profile ? {
    key: makeKey(profile.name), name: profile.name, maestroClientId: profile.maestroClientId,
    phone: profile.phone, email: profile.email,
    tasks: [], overdue: 0, today: 0, upcoming: 0, nextDue: null,
    deals: [], deposits: [], depositTotal: 0, calls: [], messages: [], brokerIds: [],
  } as ClientBundle : null);

  const brokerIdsKey = (b?.brokerIds ?? []).join(",");
  useEffect(() => {
    const ids = brokerIdsKey ? brokerIdsKey.split(",") : [];
    if (!ids.length) return;
    let alive = true;
    void (async () => {
      const { data } = await supabase.from("planipret_profiles").select("user_id, full_name, email").in("user_id", ids);
      if (!alive) return;
      const map: Record<string, string> = {};
      for (const item of (data ?? []) as any[]) map[String(item.user_id)] = item.full_name || item.email || String(item.user_id).slice(0, 8);
      setBrokerNames(map);
    })();
    return () => { alive = false; };
  }, [brokerIdsKey]);

  const surface: React.CSSProperties = { background: "var(--pp-bg-surface)", border: "1px solid var(--pp-bg-border)", color: "var(--pp-text-primary)" };
  if (loading || profileState === "loading") {
    return <div className="space-y-3">{[0, 1, 2].map((i) => <div key={i} className="h-20 rounded-2xl animate-pulse" style={{ background: "var(--pp-bg-surface)" }} />)}</div>;
  }
  if (!b) {
    const text = profileState === "error" ? profileError : L("Client Maestro introuvable pour ce compte.", "Maestro client was not found for this account.");
    return (
      <section className="rounded-2xl p-5 text-center" style={surface}>
        <AlertTriangle className="w-7 h-7 mx-auto mb-2" style={{ color: "var(--pp-warning, #f59e0b)" }} />
        <p className="text-sm font-semibold">{text}</p>
        <button onClick={() => void loadProfile()} className="mt-3 inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold" style={{ background: "var(--pp-bg-elevated)", color: "var(--pp-brand-accent)" }}>
          <RefreshCw className="w-3.5 h-3.5" /> {L("Réessayer", "Retry")}
        </button>
      </section>
    );
  }

  const display = mergeClientProfile(profile, { name: b.name, phone: b.phone, email: b.email, maestroClientId: b.maestroClientId })!;
  const number = display.phone ?? [...b.messages, ...b.calls]
    .map((item) => String((item.direction === "outbound" ? item.to_number : item.from_number) ?? "").trim())
    .find((value) => value.replace(/\D/g, "").length >= 10) ?? "";

  return (
    <div className="space-y-3 pb-4">
      <section className="relative overflow-hidden rounded-3xl p-4" style={{ background: "linear-gradient(135deg, #0B3656 0%, #176FAD 60%, #2E9BDC 100%)", color: "#fff", boxShadow: "0 14px 30px rgba(19, 110, 173, 0.25)" }}>
        <div className="absolute -right-7 -top-9 h-36 w-36 rounded-full bg-white/10" />
        <div className="relative flex gap-3 items-start">
          <div className="w-14 h-14 rounded-2xl bg-white/15 border border-white/25 flex items-center justify-center text-lg font-bold shrink-0">{initials(display.name)}</div>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-bold truncate">{display.name}</h2>
            <p className="text-[11px] text-white/70 mt-0.5">{L("Profil synchronisé depuis Maestro", "Profile loaded from Maestro")}</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {display.phone && <HeroChip icon={<Phone className="w-3 h-3" />} text={display.phone} />}
              {display.email && <HeroChip icon={<Mail className="w-3 h-3" />} text={display.email} />}
              {(display.city || display.province) && <HeroChip icon={<MapPin className="w-3 h-3" />} text={[display.city, display.province].filter(Boolean).join(", ")} />}
            </div>
          </div>
        </div>
        {onDraftSms && number && (
          <button className="relative mt-4 w-full rounded-xl px-3 py-2.5 text-sm font-semibold flex items-center justify-center gap-2 bg-white text-[#0D5F99]" onClick={() => onDraftSms({ name: display.name, number, clientKey: b.key, body: L(`Bonjour ${display.name}, `, `Hello ${display.name}, `) })}>
            <MessageSquare className="w-4 h-4" /> {L("Préparer un texto", "Draft a text")}
          </button>
        )}
      </section>

      <section className="grid grid-cols-3 gap-2">
        <Metric icon={<ListIcon />} label={L("Tâches", "Tasks")} value={String(b.tasks.length)} tone={b.overdue ? "danger" : "blue"} />
        <Metric icon={<Phone className="w-4 h-4" />} label={L("Appels", "Calls")} value={String(b.calls.length)} tone="blue" />
        <Metric icon={<FolderKanban className="w-4 h-4" />} label={L("Dossiers", "Files")} value={String(b.deals.length)} tone="blue" />
      </section>

      <Card title={L("Suivi", "Follow-up")} surface={surface}>
        <div className="flex flex-wrap gap-1.5">
          {b.overdue > 0 && <Badge tone="danger" icon={<AlertTriangle className="w-3 h-3" />} text={`${b.overdue} ${L("en retard", "overdue")}`} />}
          {b.today > 0 && <Badge tone="warn" icon={<CalendarClock className="w-3 h-3" />} text={L("à faire aujourd’hui", "due today")} />}
          {b.upcoming > 0 && <Badge tone="info" text={`${b.upcoming} ${L("à venir", "upcoming")}`} />}
          {!b.overdue && !b.today && !b.upcoming && <Empty text={L("Aucune échéance ouverte.", "No open due date.")} />}
        </div>
        {b.nextDue && <p className="text-[11px] mt-2" style={{ color: "var(--pp-text-muted)" }}>{L("Prochaine échéance", "Next due")} : {formatTaskDue(b.nextDue, lang)}</p>}
        {lastSyncAt && <p className="text-[10px] mt-1" style={{ color: "var(--pp-text-faint)" }}>{L("Activité actualisée", "Activity refreshed")} {new Date(lastSyncAt).toLocaleTimeString(en ? "en-CA" : "fr-CA", { timeZone: "America/Toronto" })}</p>}
      </Card>

      <Card title={L("Tâches", "Tasks")} surface={surface}>
        {b.tasks.length === 0 ? <Empty text={L("Aucune tâche liée à ce client.", "No task linked to this client.")} /> : (
          <ul className="space-y-1.5">{b.tasks.map((task) => <li key={task.id} className="rounded-xl px-2 py-2" style={{ background: "var(--pp-bg-elevated)" }}><MaestroTaskRow task={task} lang={lang} syncedAt={(task as any)?.raw?.updated_at ?? lastSyncAt ?? null} /></li>)}</ul>
        )}
      </Card>

      <Card title={L("Appels et historique", "Calls & history")} surface={surface}>
        {b.calls.length === 0 ? <Empty text={L("Aucun appel lié à ce client.", "No call linked to this client.")} /> : <ul className="space-y-1.5">{b.calls.map((call) => <CallRow key={call.id} call={call} lang={lang} />)}</ul>}
      </Card>

      <Card title={L("Textos", "Texts")} surface={surface}>
        {b.messages.length === 0 ? <Empty text={L("Aucun texto lié à ce client.", "No text linked to this client.")} /> : <ul className="space-y-1.5">{b.messages.map((message) => <li key={message.id} className="rounded-xl px-3 py-2 text-[11.5px]" style={{ background: "var(--pp-bg-elevated)", color: "var(--pp-text-muted)" }}><span className="flex gap-2"><MessageSquare className="w-3.5 h-3.5 shrink-0" style={{ color: message.direction === "outbound" ? "var(--pp-brand-accent)" : "#10B981" }} />{message.body || "—"}</span></li>)}</ul>}
      </Card>

      <Card title={L("Dossiers", "Files")} surface={surface}>
        {b.deals.length === 0 ? <Empty text={L("Aucun dossier local associé.", "No linked local file.")} /> : <ul className="space-y-1.5">{b.deals.map((deal) => <li key={deal.id} className="rounded-xl px-3 py-2 text-[11.5px]" style={{ background: "var(--pp-bg-elevated)", color: "var(--pp-text-muted)" }}><span style={{ color: "var(--pp-text-primary)", fontWeight: 600 }}>{deal.stage || "—"}</span><span className="ml-2">{deal.contact_number || "—"}</span></li>)}</ul>}
      </Card>

      {b.deposits.length > 0 && <Card title={L("Commissions", "Commissions")} surface={surface}><p className="text-sm font-bold" style={{ color: "var(--pp-success)" }}>{cad(b.depositTotal)}</p></Card>}
      {b.brokerIds.length > 0 && <div className="flex flex-wrap gap-1.5">{b.brokerIds.map((id) => <Badge key={id} tone="muted" icon={<User className="w-3 h-3" />} text={brokerNames[id] ?? id.slice(0, 8)} />)}</div>}
    </div>
  );
}

function ListIcon() { return <CalendarClock className="w-4 h-4" />; }
function HeroChip({ icon, text }: { icon: React.ReactNode; text: string }) { return <span className="inline-flex max-w-full items-center gap-1 rounded-full px-2 py-1 text-[10px] bg-white/15 border border-white/15 truncate">{icon}<span className="truncate">{text}</span></span>; }
function Metric({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: string; tone: "blue" | "danger" }) { return <div className="rounded-2xl p-2.5" style={{ background: tone === "danger" ? "rgba(239,68,68,.09)" : "var(--pp-bg-surface)", border: `1px solid ${tone === "danger" ? "rgba(239,68,68,.22)" : "var(--pp-bg-border)"}` }}><div className="flex items-center gap-1.5" style={{ color: tone === "danger" ? "#EF4444" : "var(--pp-brand-accent)" }}>{icon}<span className="text-lg font-bold">{value}</span></div><p className="text-[10px] mt-1" style={{ color: "var(--pp-text-muted)" }}>{label}</p></div>; }
function CallRow({ call, lang }: { call: ClientCall; lang: "fr" | "en" }) { const missed = call.direction === "missed" || call.status === "missed" || call.status === "no-answer"; const outgoing = call.direction === "outbound"; const Icon = missed ? PhoneMissed : outgoing ? PhoneOutgoing : PhoneIncoming; return <li className="rounded-xl px-3 py-2 text-[11.5px]" style={{ background: "var(--pp-bg-elevated)", color: "var(--pp-text-muted)" }}><span className="flex flex-wrap items-center gap-2"><Icon className="w-3.5 h-3.5" style={{ color: missed ? "#EF4444" : outgoing ? "var(--pp-brand-accent)" : "#10B981" }} /><span style={{ color: "var(--pp-text-primary)", fontWeight: 600 }}>{call.started_at ? new Date(call.started_at).toLocaleString(lang === "en" ? "en-CA" : "fr-CA", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "America/Toronto" }) : "—"}</span><span>{missed ? (lang === "en" ? "missed" : "manqué") : call.status ?? (lang === "en" ? "completed" : "terminé")}</span></span>{call.ai_summary && <p className="mt-1 break-words">{call.ai_summary}</p>}</li>; }
function Card({ title, surface, children }: { title: string; surface: React.CSSProperties; children: React.ReactNode }) { return <section className="rounded-2xl px-3.5 py-3.5" style={surface}><p className="text-[10px] uppercase tracking-[0.12em] mb-2" style={{ color: "var(--pp-text-muted)" }}>{title}</p>{children}</section>; }
function Badge({ text, icon, tone }: { text: string; icon?: React.ReactNode; tone: "danger" | "warn" | "info" | "ok" | "muted" }) { const tones: Record<string, React.CSSProperties> = { danger: { background: "rgba(239,68,68,.12)", color: "#EF4444" }, warn: { background: "rgba(245,158,11,.14)", color: "#D97706" }, info: { background: "rgba(46,155,220,.12)", color: "var(--pp-brand-accent)" }, ok: { background: "rgba(16,185,129,.12)", color: "#059669" }, muted: { background: "var(--pp-bg-elevated)", color: "var(--pp-text-muted)" } }; return <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded-full" style={tones[tone]}>{icon}{text}</span>; }
function Empty({ text }: { text: string }) { return <p className="text-[12px]" style={{ color: "var(--pp-text-muted)" }}>{text}</p>; }
