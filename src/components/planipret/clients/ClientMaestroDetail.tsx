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
import { hasApprovedRecordingConsent } from "@/lib/planipret/recordingConsent";
import { supabase } from "@/integrations/supabase/client";
import { CallRecordingPlayer } from "@/components/planipret/mobile/call/CallRecordingPlayer";

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

  const [tab, setTab] = useState<"all" | "calls" | "sms" | "emails" | "tasks" | "contracts">("all");
  const [contracts, setContracts] = useState<any[] | null>(null);
  const [contractsError, setContractsError] = useState<string | null>(null);
  const [emails, setEmails] = useState<any[]>([]);

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

  const contractClientId = profile?.maestroClientId ?? b?.maestroClientId ?? null;
  useEffect(() => {
    if (!contractClientId) return;
    let alive = true;
    void supabase.functions.invoke("maestro-actions", { body: { action: "client_contracts", payload: { client_id: contractClientId } } })
      .then(({ data }) => {
        if (!alive) return;
        const d = data as any;
        setContracts(Array.isArray(d?.contracts) ? d.contracts : []);
        setContractsError(d?.success === false ? (d?.error ?? "contracts_unavailable") : null);
      })
      .catch(() => { if (alive) { setContracts([]); setContractsError("contracts_unavailable"); } });
    return () => { alive = false; };
  }, [contractClientId]);

  const clientEmail = String(profile?.email ?? b?.email ?? "").trim().toLowerCase();
  useEffect(() => {
    if (!clientEmail || !/^[^\s@,()]+@[^\s@,()]+$/.test(clientEmail) || !idsKey) { setEmails([]); return; }
    let alive = true;
    void supabase.from("planipret_email_messages")
      .select("id, subject, from_email, from_name, body_preview, is_sent_by_me, sent_at, received_at")
      .in("user_id", idsKey.split(","))
      .or(`from_email.ilike.${clientEmail},to_recipients.ilike.%${clientEmail}%`)
      .order("received_at", { ascending: false })
      .limit(100)
      .then(({ data }) => { if (alive) setEmails(data ?? []); });
    return () => { alive = false; };
  }, [clientEmail, idsKey]);

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

      {profile?.raw && (() => {
        const r: any = profile.raw;
        const tels: any[] = Array.isArray(r.telephones) ? r.telephones : [];
        const tel = (...t: string[]) => tels.find((x) => t.includes(String(x?.telephone_type ?? "").toLowerCase()))?.telephone_number;
        const rows: [string, unknown][] = [
          [L("No client Maestro", "Maestro client #"), profile.maestroClientId],
          [L("Cellulaire", "Mobile"), r.cell_phone ?? r.mobile ?? tel("mobile", "cell")],
          [L("Travail", "Work"), r.work_phone ?? tel("work", "office")],
          [L("Domicile", "Home"), r.home_phone ?? tel("home")],
          [L("Courriel", "Email"), r.email ?? r.email_address],
          [L("Adresse", "Address"), r.address_line],
          [L("Langue", "Language"), r.language ?? r.preferred_language],
          [L("Date de naissance", "Birth date"), r.birth_date ? String(r.birth_date).slice(0, 10) : r.date_of_birth ? String(r.date_of_birth).slice(0, 10) : null],
          [L("Employeur", "Employer"), r.company ?? r.employer],
          [L("Occupation", "Occupation"), r.job_title ?? r.occupation],
        ];
        const shown = rows.filter(([, v]) => v !== null && v !== undefined && String(v).trim());
        if (!shown.length) return null;
        return (
          <Card title={L("Coordonnées Maestro", "Maestro details")} surface={surface}>
            <dl className="grid grid-cols-[auto,1fr] gap-x-3 gap-y-1.5 text-[12px]">
              {shown.flatMap(([k, v]) => [<dt key={`k${k}`} style={{ color: "var(--pp-text-muted)" }}>{k}</dt>, <dd key={`v${k}`} className="break-words" style={{ color: "var(--pp-text-primary)" }}>{String(v)}</dd>])}
            </dl>
          </Card>
        );
      })()}

      <section className="grid grid-cols-4 gap-2">
        <Metric icon={<ListIcon />} label={L("Tâches", "Tasks")} value={String(b.tasks.length)} tone={b.overdue ? "danger" : "blue"} />
        <Metric icon={<Phone className="w-4 h-4" />} label={L("Appels", "Calls")} value={String(b.calls.length)} tone="blue" />
        <Metric icon={<MessageSquare className="w-4 h-4" />} label={L("Textos", "Texts")} value={String(b.messages.length)} tone="blue" />
        <Metric icon={<FolderKanban className="w-4 h-4" />} label={L("Contrats", "Contracts")} value={String(contracts?.length ?? b.deals.length)} tone="blue" />
      </section>

      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {([
          ["all", L("Tout", "All")], ["calls", L("Appels", "Calls")], ["sms", L("Textos", "Texts")],
          ["emails", L("Courriels", "Emails")], ["tasks", L("Tâches", "Tasks")], ["contracts", L("Contrats", "Contracts")],
        ] as const).map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)} className="shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold"
            style={tab === k ? { background: "var(--pp-brand-accent)", color: "#fff" } : { background: "var(--pp-bg-surface)", color: "var(--pp-text-muted)", border: "1px solid var(--pp-bg-border)" }}>
            {label}
          </button>
        ))}
      </div>

      {tab === "all" && (
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
      )}

      {(tab === "all" || tab === "tasks") && (
        <Card title={L("Tâches", "Tasks")} surface={surface}>
          {b.tasks.length === 0 ? <Empty text={L("Aucune tâche liée à ce client.", "No task linked to this client.")} /> : (
            <ul className="space-y-1.5">{b.tasks.map((task) => <li key={task.id} className="rounded-xl px-2 py-2" style={{ background: "var(--pp-bg-elevated)" }}><MaestroTaskRow task={task} lang={lang} syncedAt={(task as any)?.raw?.updated_at ?? lastSyncAt ?? null} /></li>)}</ul>
          )}
        </Card>
      )}

      {(tab === "all" || tab === "calls") && (
        <Card title={L("Appels, enregistrements et transcriptions", "Calls, recordings & transcripts")} surface={surface}>
          {b.calls.length === 0 ? <Empty text={L("Aucun appel lié à ce client.", "No call linked to this client.")} /> : <ul className="space-y-1.5">{(tab === "all" ? b.calls.slice(0, 5) : b.calls).map((call) => <CallRow key={call.id} call={call} lang={lang} />)}</ul>}
        </Card>
      )}

      {(tab === "all" || tab === "sms") && (
        <Card title={L("Textos", "Texts")} surface={surface}>
          {b.messages.length === 0 ? <Empty text={L("Aucun texto lié à ce client.", "No text linked to this client.")} /> : (
            <div className="space-y-2">
              {(tab === "all" ? b.messages.slice(0, 5) : b.messages).map((message) => (
                <SmsBubble key={message.id} message={message} lang={lang} />
              ))}
            </div>
          )}
        </Card>
      )}

      {(tab === "all" || tab === "emails") && (
        <Card title={L("Courriels", "Emails")} surface={surface}>
          {!clientEmail ? <Empty text={L("Aucun courriel connu pour ce client dans Maestro.", "No email known for this client in Maestro.")} />
            : emails.length === 0 ? <Empty text={L("Aucun courriel synchronisé avec ce client.", "No synced email with this client.")} />
            : <ul className="space-y-1.5">{(tab === "all" ? emails.slice(0, 5) : emails).map((m) => <li key={m.id} className="rounded-xl px-3 py-2 text-[11.5px]" style={{ background: "var(--pp-bg-elevated)", color: "var(--pp-text-muted)" }}><span className="flex items-center gap-2" style={{ color: "var(--pp-text-primary)", fontWeight: 600 }}><Mail className="w-3.5 h-3.5 shrink-0" style={{ color: m.is_sent_by_me ? "var(--pp-brand-accent)" : "#10B981" }} /><span className="truncate">{m.subject || L("(sans objet)", "(no subject)")}</span></span>{m.body_preview && <p className="mt-1 line-clamp-2 break-words">{m.body_preview}</p>}<span className="block text-[10px] mt-1" style={{ color: "var(--pp-text-faint)" }}>{fmtDate(m.received_at ?? m.sent_at, lang)}</span></li>)}</ul>}
        </Card>
      )}

      {(tab === "all" || tab === "contracts") && (
        <Card title={L("Contrats Maestro", "Maestro contracts")} surface={surface}>
          {contracts === null ? <Empty text={L("Chargement des contrats…", "Loading contracts…")} />
            : contracts.length === 0 ? <Empty text={contractsError ? L("Contrats Maestro indisponibles pour le moment.", "Maestro contracts unavailable right now.") : L("Aucun contrat Maestro pour ce client.", "No Maestro contract for this client.")} />
            : <ul className="space-y-1.5">{contracts.map((c, i) => <li key={c.id ?? i} className="rounded-xl px-3 py-2 text-[11.5px]" style={{ background: "var(--pp-bg-elevated)", color: "var(--pp-text-muted)" }}><span className="flex flex-wrap gap-2 items-center"><span style={{ color: "var(--pp-text-primary)", fontWeight: 600 }}>{c.number ? `#${c.number}` : L("Contrat", "Contract")}</span>{(c.status_of_transaction || c.status) && <Badge tone="info" text={String(c.status_of_transaction || c.status)} />}</span><span className="block mt-1">{[c.application_purpose || c.application_type, c.mortgage_type, c.loan_amount ? cad(c.loan_amount) : null, c.rate ? `${c.rate}%` : null, c.term ? `${c.term}` : null].filter(Boolean).join(" · ") || "—"}</span>{c.date_closing && <span className="block text-[10px] mt-1" style={{ color: "var(--pp-text-faint)" }}>{L("Clôture", "Closing")} : {String(c.date_closing).slice(0, 10)}</span>}</li>)}</ul>}
        </Card>
      )}

      {b.deposits.length > 0 && <Card title={L("Commissions", "Commissions")} surface={surface}><p className="text-sm font-bold" style={{ color: "var(--pp-success)" }}>{cad(b.depositTotal)}</p></Card>}
      {b.brokerIds.length > 0 && <div className="flex flex-wrap gap-1.5">{b.brokerIds.map((id) => <Badge key={id} tone="muted" icon={<User className="w-3 h-3" />} text={brokerNames[id] ?? id.slice(0, 8)} />)}</div>}
    </div>
  );
}

/** Bulle de texto : envoyé par le courtier à droite (bleu), reçu à gauche (vert). */
export function SmsBubble({ message, lang }: { message: ClientMessage; lang: "fr" | "en" }) {
  const out = message.direction === "outbound";
  return (
    <div className={`flex ${out ? "justify-end" : "justify-start"}`} data-testid={out ? "sms-outbound" : "sms-inbound"}>
      <div className="max-w-[80%]">
        <div
          data-testid="sms-bubble"
          className="rounded-2xl px-3 py-2 text-[12px] leading-snug"
          style={out
            ? { background: "linear-gradient(135deg, #1A4A8A, #2E9BDC)", color: "#fff", borderBottomRightRadius: 6 }
            : { background: "rgba(16,185,129,0.14)", color: "var(--pp-text-primary)", border: "1px solid rgba(16,185,129,0.35)", borderBottomLeftRadius: 6 }}
        >
          <p className="whitespace-pre-wrap break-words">{message.body || "—"}</p>
        </div>
        <p className={`text-[10px] mt-0.5 ${out ? "text-right" : "text-left"}`} style={{ color: "var(--pp-text-faint)" }}>
          {out ? (lang === "en" ? "Sent" : "Envoyé") : (lang === "en" ? "Received" : "Reçu")}
          {message.created_at ? ` · ${fmtDate(message.created_at, lang)}` : ""}
        </p>
      </div>
    </div>
  );
}

function ListIcon() { return <CalendarClock className="w-4 h-4" />; }
function HeroChip({ icon, text }: { icon: React.ReactNode; text: string }) { return <span className="inline-flex max-w-full items-center gap-1 rounded-full px-2 py-1 text-[10px] bg-white/15 border border-white/15 truncate">{icon}<span className="truncate">{text}</span></span>; }
function Metric({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: string; tone: "blue" | "danger" }) { return <div className="rounded-2xl p-2.5" style={{ background: tone === "danger" ? "rgba(239,68,68,.09)" : "var(--pp-bg-surface)", border: `1px solid ${tone === "danger" ? "rgba(239,68,68,.22)" : "var(--pp-bg-border)"}` }}><div className="flex items-center gap-1.5" style={{ color: tone === "danger" ? "#EF4444" : "var(--pp-brand-accent)" }}>{icon}<span className="text-lg font-bold">{value}</span></div><p className="text-[10px] mt-1" style={{ color: "var(--pp-text-muted)" }}>{label}</p></div>; }
function fmtDate(v: string | null | undefined, lang: "fr" | "en") { return v ? new Date(v).toLocaleString(lang === "en" ? "en-CA" : "fr-CA", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "America/Toronto" }) : "—"; }
function CallRow({ call, lang }: { call: ClientCall; lang: "fr" | "en" }) {
  const [listen, setListen] = useState(false);
  const [showTx, setShowTx] = useState(false);
  const en = lang === "en";
  const missed = call.direction === "missed" || call.status === "missed" || call.status === "no-answer";
  const outgoing = call.direction === "outbound";
  const Icon = missed ? PhoneMissed : outgoing ? PhoneOutgoing : PhoneIncoming;
  const consentOk = hasApprovedRecordingConsent(call.save_consent);
  const canListen = consentOk && (!!call.has_recording || !!call.recording_url);
  return (
    <li className="rounded-xl px-3 py-2 text-[11.5px]" style={{ background: "var(--pp-bg-elevated)", color: "var(--pp-text-muted)" }}>
      <span className="flex flex-wrap items-center gap-2">
        <Icon className="w-3.5 h-3.5" style={{ color: missed ? "#EF4444" : outgoing ? "var(--pp-brand-accent)" : "#10B981" }} />
        <span style={{ color: "var(--pp-text-primary)", fontWeight: 600 }}>{fmtDate(call.started_at, lang)}</span>
        <span>{missed ? (en ? "missed" : "manqué") : call.status ?? (en ? "completed" : "terminé")}</span>
        {call.duration_seconds ? <span>{Math.floor(call.duration_seconds / 60)}:{String(call.duration_seconds % 60).padStart(2, "0")}</span> : null}
      </span>
      {call.ai_summary && <p className="mt-1 break-words">{call.ai_summary}</p>}
      <span className="mt-1.5 flex flex-wrap gap-1.5">
        {canListen && <button onClick={() => setListen((v) => !v)} className="rounded-full px-2 py-1 text-[10px] font-semibold" style={{ background: "rgba(46,155,220,.12)", color: "var(--pp-brand-accent)" }}>{listen ? (en ? "Hide recording" : "Masquer l’enregistrement") : (en ? "Listen" : "Écouter")}</button>}
        {consentOk && call.transcript && <button onClick={() => setShowTx((v) => !v)} className="rounded-full px-2 py-1 text-[10px] font-semibold" style={{ background: "rgba(46,155,220,.12)", color: "var(--pp-brand-accent)" }}>{showTx ? (en ? "Hide transcript" : "Masquer la transcription") : (en ? "Transcript" : "Transcription")}</button>}
        {!consentOk && <span className="text-[10px]">{en ? "Recording consent pending" : "Consentement d’enregistrement en attente"}</span>}
      </span>
      {listen && <div className="mt-2"><CallRecordingPlayer callId={call.id} duration={call.duration_seconds ?? 0} /></div>}
      {showTx && call.transcript && <p className="mt-2 whitespace-pre-wrap break-words max-h-64 overflow-y-auto">{call.transcript}</p>}
    </li>
  );
}
function Card({ title, surface, children }: { title: string; surface: React.CSSProperties; children: React.ReactNode }) { return <section className="rounded-2xl px-3.5 py-3.5" style={surface}><p className="text-[10px] uppercase tracking-[0.12em] mb-2" style={{ color: "var(--pp-text-muted)" }}>{title}</p>{children}</section>; }
function Badge({ text, icon, tone }: { text: string; icon?: React.ReactNode; tone: "danger" | "warn" | "info" | "ok" | "muted" }) { const tones: Record<string, React.CSSProperties> = { danger: { background: "rgba(239,68,68,.12)", color: "#EF4444" }, warn: { background: "rgba(245,158,11,.14)", color: "#D97706" }, info: { background: "rgba(46,155,220,.12)", color: "var(--pp-brand-accent)" }, ok: { background: "rgba(16,185,129,.12)", color: "#059669" }, muted: { background: "var(--pp-bg-elevated)", color: "var(--pp-text-muted)" } }; return <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded-full" style={tones[tone]}>{icon}{text}</span>; }
function Empty({ text }: { text: string }) { return <p className="text-[12px]" style={{ color: "var(--pp-text-muted)" }}>{text}</p>; }
