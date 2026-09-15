import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ChevronLeft, Link2, MessageSquare, Phone, RefreshCw, CheckSquare } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { usePlanipretTasks } from "@/hooks/planipret/usePlanipretTasks";
import MaestroTaskRow from "@/components/planipret/mobile/MaestroTaskRow";
import {
  clientKey as makeKey, digits10, fetchClientCalls, fetchClientContacts, fetchClientMessages,
  type ClientCall, type ClientMessage,
} from "@/lib/planipret/clientMaestro";

type Tab = "calls" | "texts" | "tasks";

const surface = { background: "var(--pp-bg-surface)", border: "1px solid var(--pp-bg-border)", color: "var(--pp-text-primary)" };
const muted = { color: "var(--pp-text-muted)" };

/**
 * Écran Maestro de l'app : appels, textos et tâches du courtier, avec
 * rattachement direct d'un appel (et donc de son fil de textos) à un client.
 */
export default function MMaestro() {
  const navigate = useNavigate();
  const lang = (localStorage.getItem("pp_lang") === "en" ? "en" : "fr") as "fr" | "en";
  const en = lang === "en";
  const L = (fr: string, e: string) => (en ? e : fr);

  const [userId, setUserId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("calls");
  const [calls, setCalls] = useState<ClientCall[]>([]);
  const [messages, setMessages] = useState<ClientMessage[]>([]);
  const [clients, setClients] = useState<{ name: string; phone: string | null }[]>([]);
  const [picked, setPicked] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const { data } = await supabase.auth.getUser();
      if (alive) setUserId(data.user?.id ?? null);
    })();
    return () => { alive = false; };
  }, []);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    const [cl, ms, ct] = await Promise.all([
      fetchClientCalls([userId], 150),
      fetchClientMessages([userId], 150),
      fetchClientContacts([userId], { limit: 300 }),
    ]);
    setCalls(cl); setMessages(ms); setClients(ct);
    setLoading(false);
  }, [userId]);

  useEffect(() => { void load(); }, [load]);

  const { tasks, loading: tasksLoading, lastSyncAt, setFilter } = usePlanipretTasks(userId);
  useEffect(() => { setFilter("all"); }, [setFilter]);

  /** Nom du client déjà rattaché à un numéro (via un appel). */
  const nameByPhone = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of calls) {
      const label = c.maestro_client_name || c.from_name || c.to_name;
      if (!label) continue;
      for (const k of [digits10(c.from_number), digits10(c.to_number)]) if (k && !m.has(k)) m.set(k, label);
    }
    for (const c of clients) {
      const k = digits10(c.phone);
      if (k && !m.has(k)) m.set(k, c.name);
    }
    return m;
  }, [calls, clients]);

  const peerOf = (x: { direction: string | null; from_number: string | null; to_number: string | null }) =>
    String((x.direction === "outbound" ? x.to_number : x.from_number) ?? "").trim();

  const attach = async (call: ClientCall) => {
    const name = picked[call.id];
    if (!name) { toast.error(L("Choisissez un client", "Pick a client")); return; }
    setBusy(call.id);
    const { error } = await supabase
      .from("planipret_phone_calls")
      .update({ maestro_client_name: name })
      .eq("id", call.id);
    setBusy(null);
    if (error) { toast.error(error.message); return; }
    toast.success(L(`Appel rattaché à ${name}`, `Call attached to ${name}`));
    void load();
  };

  const fmt = (iso: string | null) =>
    iso ? new Date(iso).toLocaleString(en ? "en-CA" : "fr-CA", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "America/Toronto" }) : "—";

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center gap-2">
        <button onClick={() => navigate(-1)} aria-label={L("Retour", "Back")}
          className="w-11 h-11 rounded-xl flex items-center justify-center" style={surface}>
          <ChevronLeft className="w-4 h-4" />
        </button>
        <h1 className="text-base font-semibold pp-heading">Maestro</h1>
        <button onClick={() => void load()} aria-label={L("Actualiser", "Refresh")}
          className="ml-auto w-11 h-11 rounded-xl flex items-center justify-center" style={surface}>
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      <div className="flex gap-1.5">
        {([
          { k: "calls" as Tab, label: L("Appels", "Calls"), Icon: Phone, n: calls.length },
          { k: "texts" as Tab, label: L("Textos", "Texts"), Icon: MessageSquare, n: messages.length },
          { k: "tasks" as Tab, label: L("Tâches", "Tasks"), Icon: CheckSquare, n: tasks.length },
        ]).map(({ k, label, Icon, n }) => (
          <button key={k} onClick={() => setTab(k)}
            className="flex-1 min-h-[40px] rounded-xl text-xs font-semibold inline-flex items-center justify-center gap-1.5"
            style={{ ...surface, borderColor: tab === k ? "var(--pp-brand-accent)" : "var(--pp-bg-border)", color: tab === k ? "var(--pp-brand-accent)" : "var(--pp-text-primary)" }}>
            <Icon className="w-3.5 h-3.5" /> {label} <span style={muted}>{n}</span>
          </button>
        ))}
      </div>

      {tab === "calls" && (
        <ul className="space-y-2">
          {calls.length === 0 && !loading && <Empty text={L("Aucun appel.", "No call.")} />}
          {calls.map((c) => {
            const peer = peerOf(c);
            const client = c.maestro_client_name || nameByPhone.get(digits10(peer)) || null;
            return (
              <li key={c.id} className="rounded-xl px-3 py-2.5 text-[11.5px]" style={surface}>
                <div className="flex flex-wrap items-center gap-x-2">
                  <Phone className="w-3.5 h-3.5" style={{ color: "var(--pp-brand-accent)" }} />
                  <span className="font-semibold">{fmt(c.started_at)}</span>
                  <span style={muted}>{peer || "—"}</span>
                  <span style={muted}>{Math.round(Number(c.duration_seconds ?? 0))}s</span>
                </div>
                {c.ai_summary && (
                  <div className="mt-1 rounded-md px-2 py-1.5" style={{ background: "rgba(37,99,235,0.06)" }}>
                    <span className="block text-[10px] uppercase tracking-wide" style={{ color: "var(--pp-brand-accent)" }}>{L("Résumé IA", "AI summary")}</span>
                    {c.ai_summary}
                  </div>
                )}
                <div className="mt-1.5 flex flex-wrap items-center gap-2">
                  {client ? (
                    <Link to={`/mplanipret/clients-360/${encodeURIComponent(makeKey(client))}`} className="underline" style={{ color: "var(--pp-brand-accent)" }}>
                      {client}
                    </Link>
                  ) : (
                    <>
                      <select value={picked[c.id] ?? ""} onChange={(e) => setPicked((p) => ({ ...p, [c.id]: e.target.value }))}
                        className="min-h-[34px] px-2 rounded-lg text-xs flex-1" style={surface}>
                        <option value="">{L("Rattacher à un client…", "Attach to a client…")}</option>
                        {clients.map((x) => <option key={x.name} value={x.name}>{x.name}</option>)}
                      </select>
                      <button onClick={() => void attach(c)} disabled={busy === c.id}
                        className="min-h-[34px] px-3 rounded-lg text-xs inline-flex items-center gap-1" style={surface}>
                        <Link2 className="w-3.5 h-3.5" /> {L("Rattacher", "Attach")}
                      </button>
                    </>
                  )}
                  <Link to={`/mplanipret/calls?tab=recents&peer=${encodeURIComponent(peer)}`} className="underline" style={{ color: "var(--pp-brand-accent)" }}>
                    {L("Voir la conversation", "Open conversation")}
                  </Link>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {tab === "texts" && (
        <ul className="space-y-2">
          {messages.length === 0 && !loading && <Empty text={L("Aucun texto.", "No text.")} />}
          {messages.map((m) => {
            const peer = peerOf(m);
            const client = nameByPhone.get(digits10(peer)) || null;
            return (
              <li key={m.id} className="rounded-xl px-3 py-2.5 text-[11.5px]" style={surface}>
                <div className="flex flex-wrap items-center gap-x-2">
                  <MessageSquare className="w-3.5 h-3.5" style={{ color: "var(--pp-brand-accent)" }} />
                  <span className="font-semibold">{fmt(m.created_at)}</span>
                  <span style={muted}>{peer || "—"}</span>
                  <span style={muted}>{m.direction === "outbound" ? L("envoyé", "sent") : L("reçu", "received")}</span>
                </div>
                {m.body && <p className="mt-0.5 break-words">{m.body}</p>}
                <div className="mt-1.5 flex flex-wrap items-center gap-3">
                  {client && (
                    <Link to={`/mplanipret/clients-360/${encodeURIComponent(makeKey(client))}`} className="underline" style={{ color: "var(--pp-brand-accent)" }}>
                      {client}
                    </Link>
                  )}
                  <Link to={`/mplanipret/messages?tab=sms&to=${encodeURIComponent(peer)}${client ? `&name=${encodeURIComponent(client)}` : ""}`}
                    className="underline" style={{ color: "var(--pp-brand-accent)" }}>
                    {L("Voir la conversation", "Open conversation")}
                  </Link>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {tab === "tasks" && (
        <ul className="space-y-2">
          {tasks.length === 0 && !tasksLoading && <Empty text={L("Aucune tâche.", "No task.")} />}
          {tasks.map((t) => (
            <li key={t.id} className="rounded-xl px-3 py-2.5" style={surface}>
              <MaestroTaskRow task={t} lang={lang} syncedAt={(t as any)?.raw?.updated_at ?? lastSyncAt ?? null} />
              {t.target_name && (
                <Link to={`/mplanipret/clients-360/${encodeURIComponent(makeKey(t.target_name))}`}
                  className="underline text-[11.5px]" style={{ color: "var(--pp-brand-accent)" }}>
                  {t.target_name}
                </Link>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="text-[11.5px] py-6 text-center" style={muted}>{text}</p>;
}
