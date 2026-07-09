import { useEffect, useMemo, useRef, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Plus, X, ArrowLeft, Phone, Send, Paperclip, MessageSquare, Zap,
  Users, Bot, Mail, Sparkles, Loader2, RefreshCw, Mic, Reply, History, Circle, CheckCircle2, AlertTriangle, RotateCw,
  UsersRound, Contact,
} from "lucide-react";
import type { PlanipretMobileContext } from "../PlanipretMobile";
import SmsTemplatesSheet from "@/components/planipret/SmsTemplatesSheet";
import AvaSummarizeSheet from "@/components/planipret/ava/AvaSummarizeSheet";
import AvaProposedActionsCard from "@/components/planipret/mobile/AvaProposedActionsCard";
import AvaHistorySheet from "@/components/planipret/ava/AvaHistorySheet";
import CoachOverlay from "@/components/planipret/ava/CoachOverlay";
import { callAva, type AvaSuggestion } from "@/services/avaProactive";
import { useAvaDraft } from "@/hooks/useAvaDraft";
import { useMplanipretLang } from "@/hooks/useMplanipretLang";
import { useCallerNames } from "@/lib/planipret/callerLookup";

type SubTab = "sms" | "team" | "teams365" | "ava" | "emails" | "roster";


type Msg = {
  id: string;
  user_id: string;
  direction: string;
  from_number: string | null;
  to_number: string | null;
  body: string | null;
  media_urls: any;
  read_at: string | null;
  sent_at: string | null;
  created_at: string;
  status?: string | null;
};

const initials = (s: string) => {
  const clean = (s || "").replace(/[^0-9A-Za-z]/g, "");
  if (!clean) return "?";
  return clean.slice(-2).toUpperCase();
};

const fmtTime = (iso: string, lang: "fr" | "en" = "fr", t?: (key: string) => string) => {
  const d = new Date(iso);
  const now = new Date();
  const yest = new Date(); yest.setDate(now.getDate() - 1);
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString(lang === "en" ? "en-CA" : "fr-CA", { hour: "2-digit", minute: "2-digit" });
  }
  if (d.toDateString() === yest.toDateString()) return t ? t("common.yesterday") : (lang === "en" ? "Yesterday" : "Hier");
  return d.toLocaleDateString(lang === "en" ? "en-CA" : "fr-CA", { day: "2-digit", month: "2-digit" });
};

export default function MMessages() {
  const { t } = useMplanipretLang();
  const { profile, openDialer, openAva, registerRefresh } = useOutletContext<PlanipretMobileContext>();
  const [sub, setSub] = useState<SubTab>("sms");

  return (
    <div className="h-full flex flex-col" style={{ background: "var(--pp-bg-base)" }}>
      <div
        className="px-4 pt-5 pb-3"
        style={{ background: "var(--pp-bg-deep)", borderBottom: "1px solid var(--pp-bg-border)" }}
      >
        <h1 className="text-2xl font-bold mb-3" style={{ color: "var(--pp-text-primary)" }}>{t("messages.title")}</h1>
        <div
          className="flex gap-1.5 overflow-x-auto no-scrollbar -mx-1 px-1 pb-1"
          style={{ scrollbarWidth: "none" }}
        >
          {[
            { k: "sms" as SubTab, label: t("messages.tabs.sms"), Icon: MessageSquare },
            { k: "team" as SubTab, label: t("messages.tabs.team"), Icon: UsersRound },
            { k: "teams365" as SubTab, label: "Teams", Icon: Users },
            { k: "roster" as SubTab, label: t("messages.tabs.roster"), Icon: Contact },
            { k: "ava" as SubTab, label: t("messages.tabs.ava"), Icon: Bot },
            { k: "emails" as SubTab, label: t("messages.tabs.emails"), Icon: Mail },
          ].map((item) => {
            const active = sub === item.k;
            return (
              <button
                key={item.k}
                type="button"
                onClick={() => setSub(item.k)}
                className="shrink-0 px-3.5 py-2 text-xs font-semibold rounded-full transition flex items-center gap-1.5 active:scale-95"
                style={
                  active
                    ? {
                        background: "linear-gradient(135deg, var(--pp-brand-accent), var(--pp-brand-accent-2))",
                        color: "white",
                        boxShadow: "0 4px 14px rgba(46,155,220,0.4)",
                      }
                    : {
                        background: "var(--pp-bg-elevated)",
                        border: "1px solid var(--pp-bg-border-2)",
                        color: "var(--pp-text-secondary)",
                      }
                }
              >
                <item.Icon className="w-3.5 h-3.5" /> {item.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex-1 overflow-hidden">
        {sub === "sms" && <SmsList profile={profile} openDialer={openDialer} registerRefresh={registerRefresh} />}
        {sub === "team" && <TeamChat profile={profile} />}
        {sub === "teams365" && <Teams365Panel profile={profile} />}
        {sub === "roster" && <TeamRoster profile={profile} openDialer={openDialer} onSwitchTab={setSub} />}
        {sub === "ava" && <AvaChat profile={profile} openAva={openAva} openDialer={openDialer} />}
        {sub === "emails" && <EmailsList profile={profile} openAva={openAva} />}
      </div>
    </div>
  );
}

// ============================================================
// SMS TAB — branché sur Edge Function pp-ns-sms (NS-API v2)
// ============================================================
type NsThread = {
  id?: string;
  messagesession_id?: string;
  session_id?: string;
  destination?: string;
  remote_party?: string;
  contact?: string;
  last_message?: string;
  preview?: string;
  unread?: number;
  unread_count?: number;
  last_message_at?: string;
  updated_at?: string;
  timestamp?: string;
};

type NsMessage = {
  id?: string;
  message_id?: string;
  direction?: string;
  from?: string;
  to?: string;
  source?: string;
  destination?: string;
  message?: string;
  body?: string;
  text?: string;
  timestamp?: string;
  created_at?: string;
  sent_at?: string;
  read_at?: string | null;
};

const threadId = (t: NsThread) => t.id ?? t.messagesession_id ?? t.session_id ?? t.destination ?? "";
const threadPeer = (t: NsThread) => t.destination ?? t.remote_party ?? t.contact ?? threadId(t);
const threadTime = (t: NsThread) => t.last_message_at ?? t.updated_at ?? t.timestamp ?? new Date().toISOString();
const msgId = (m: NsMessage, i: number) => m.id ?? m.message_id ?? `${m.timestamp ?? m.created_at ?? i}-${i}`;
const msgBody = (m: NsMessage) => m.body ?? m.message ?? m.text ?? "";
const msgTime = (m: NsMessage) => m.timestamp ?? m.created_at ?? m.sent_at ?? new Date().toISOString();
const msgIsOut = (m: NsMessage, myExt: string) => {
  const dir = (m.direction ?? "").toLowerCase();
  if (dir === "outbound" || dir === "out" || dir === "sent") return true;
  if (dir === "inbound" || dir === "in" || dir === "received") return false;
  return (m.from ?? m.source ?? "") === myExt;
};

function SmsList({ profile, openDialer, registerRefresh }: any) {
  const { t } = useMplanipretLang();
  const myExt = profile?.extension ?? "";
  const [threads, setThreads] = useState<NsThread[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeThread, setActiveThread] = useState<{ id: string; number: string } | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [newNumber, setNewNumber] = useState("");

  const load = async () => {
    if (!profile?.user_id) return;
    setLoading(true);
    setError(null);
    try {
      const { data, error: err } = await supabase.functions.invoke("pp-ns-sms", {
        body: { action: "threads" },
      });
      if (err) throw err;
      const list: NsThread[] = (data as any)?.threads ?? [];
      list.sort((a, b) => +new Date(threadTime(b)) - +new Date(threadTime(a)));
      setThreads(list);
    } catch (e: any) {
      console.error("[pp-ns-sms] threads", e);
      setError(e?.message ?? t("messages.sendFailed"));
      toast.error(e?.message ?? t("messages.sendFailed"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [profile?.user_id]);
  useEffect(() => { registerRefresh(load); return () => registerRefresh(null); /* eslint-disable-next-line */ }, [profile?.user_id]);

  if (activeThread) {
    return (
      <ThreadView
        threadId={activeThread.id}
        number={activeThread.number}
        myExt={myExt}
        userId={profile.user_id}
        onBack={() => { setActiveThread(null); load(); }}
        onCall={(n) => openDialer(n)}
      />
    );
  }

  return (
    <div className="h-full overflow-y-auto p-3">
      <div className="flex justify-end mb-2 gap-2">
        <button
          onClick={load}
          className="px-3 py-1.5 rounded-full flex items-center gap-1.5 text-xs font-semibold"
          style={{ background: "var(--pp-bg-surface)", border: "1px solid var(--pp-bg-border-2)", color: "var(--pp-text-secondary)" }}
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
        </button>
        <button
          onClick={() => { setNewNumber(""); setNewOpen(true); }}
          className="px-3 py-1.5 rounded-full flex items-center gap-1.5 text-xs font-semibold text-white"
          style={{
            background: "linear-gradient(135deg, var(--pp-brand-accent), var(--pp-brand-accent-2))",
            boxShadow: "0 2px 12px rgba(46,155,220,0.4)",
          }}
        >
          <Plus className="w-3.5 h-3.5" /> {t("common.new")}
        </button>
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="rounded-2xl h-16 animate-pulse" style={{ background: "var(--pp-bg-surface)" }} />
          ))}
        </div>
      ) : error ? (
        <div className="rounded-2xl p-6 text-center" style={{ background: "var(--pp-bg-surface)", border: "1px solid var(--pp-bg-border-2)" }}>
          <p className="text-sm mb-3" style={{ color: "var(--pp-danger)" }}>{error}</p>
          <button
            onClick={load}
            className="px-4 py-2 rounded-full text-xs font-semibold text-white"
            style={{ background: "linear-gradient(135deg, var(--pp-brand-accent), var(--pp-brand-accent-2))" }}
          >
            {t("common.retry") ?? "Réessayer"}
          </button>
        </div>
      ) : threads.length === 0 ? (
        <EmptyState Icon={MessageSquare} title={t("messages.noMessages")} sub={t("messages.startNew")} />
      ) : (
        <ul className="space-y-1.5">
          {threads.map((th, index) => {
            const id = threadId(th);
            const peer = threadPeer(th);
            const unread = th.unread ?? th.unread_count ?? 0;
            const preview = th.last_message ?? th.preview ?? "";
            return (
              <ThreadRow
                key={`${id || "noid"}-${peer || "nopeer"}-${index}`}
                id={id}
                peer={peer}
                unread={unread}
                preview={preview}
                time={threadTime(th)}
                onOpen={() => setActiveThread({ id, number: peer })}
                emptyLabel={t("messages.noContent")}
              />
            );
          })}
        </ul>
      )}

      {newOpen && (
        <div className="fixed inset-0 z-40 flex items-end md:items-center md:justify-center bg-black/60 backdrop-blur-sm" onClick={() => setNewOpen(false)}>
          <div
            className="w-full md:w-[360px] rounded-t-3xl md:rounded-2xl p-4"
            style={{ background: "var(--pp-bg-surface)", border: "1px solid var(--pp-bg-border-2)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold" style={{ color: "var(--pp-text-primary)" }}>{t("messages.newMessage")}</h2>
              <button onClick={() => setNewOpen(false)} className="p-1 rounded-full" style={{ color: "var(--pp-text-muted)" }} aria-label={t("common.close")}>
                <X className="w-4 h-4" />
              </button>
            </div>
            <input
              type="tel"
              inputMode="tel"
              placeholder={t("messages.phoneNumber")}
              value={newNumber}
              onChange={(e) => setNewNumber(e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg text-sm outline-none"
              style={{
                background: "var(--pp-bg-elevated)",
                border: "1px solid var(--pp-bg-border-2)",
                color: "var(--pp-text-primary)",
              }}
            />
            <button
              disabled={!newNumber.trim()}
              onClick={() => { setActiveThread({ id: "", number: newNumber.trim() }); setNewOpen(false); }}
              className="w-full mt-3 py-2.5 rounded-lg text-white font-medium text-sm disabled:opacity-50"
              style={{ background: "linear-gradient(135deg, var(--pp-brand-accent), var(--pp-brand-accent-2))" }}
            >
              {t("common.continue")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function ThreadRow({ id, peer, unread, preview, time, onOpen, emptyLabel }: {
  id: string; peer: string; unread: number; preview: string; time: string;
  onOpen: () => void; emptyLabel: string;
}) {
  const { lang } = useMplanipretLang();
  const resolved = useCallerNames([peer]);
  const isJustDigits = /^\+?[\d\s().-]+$/.test(peer);
  const label = resolved[peer]
    || (isJustDigits ? peer : peer)
    || (lang === "en" ? "Unresolved number" : "Numéro non résolu");
  return (
    <li>
      <button
        onClick={onOpen}
        className="w-full px-3 py-3 flex items-center gap-3 rounded-2xl text-left active:opacity-80"
        style={{ background: "var(--pp-bg-surface)", border: "1px solid var(--pp-bg-border-2)" }}
      >
        <div
          className="w-11 h-11 rounded-full flex items-center justify-center text-white text-sm font-semibold flex-shrink-0"
          style={{ background: "linear-gradient(135deg, var(--pp-brand-accent), var(--pp-brand-accent-2))" }}
        >
          {initials(peer)}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm truncate" style={{ color: "var(--pp-text-primary)" }}>{label}</p>
          {resolved[peer] && (
            <p className="text-[11px] truncate" style={{ color: "var(--pp-text-faint)" }}>{peer}</p>
          )}
          <p className="text-xs truncate" style={{ color: "var(--pp-text-muted)" }}>{preview || emptyLabel}</p>
        </div>
        <div className="flex flex-col items-end gap-1 flex-shrink-0">
          <span className="text-[11px]" style={{ color: "var(--pp-text-faint)" }}>{fmtTime(time, lang as "fr" | "en")}</span>
          {unread > 0 && (
            <span
              className="min-w-[18px] h-[18px] px-1 rounded-full text-white text-[10px] font-semibold flex items-center justify-center"
              style={{ background: "var(--pp-danger)" }}
            >
              {unread}
            </span>
          )}
        </div>
      </button>
    </li>
  );
}


function ThreadView({ threadId: thId, number, myExt, userId, onBack, onCall }: {
  threadId: string; number: string; myExt: string; userId: string;
  onBack: () => void; onCall: (n: string) => void;
}) {
  const { t, lang } = useMplanipretLang();
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [tplOpen, setTplOpen] = useState(false);
  const [sumOpen, setSumOpen] = useState(false);
  const [messages, setMessages] = useState<NsMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentThreadId, setCurrentThreadId] = useState<string>(thId);
  const bottomRef = useRef<HTMLDivElement>(null);

  const loadMessages = async () => {
    if (!currentThreadId) { setLoading(false); return; }
    setLoading(true);
    setError(null);
    try {
      const { data, error: err } = await supabase.functions.invoke("pp-ns-sms", {
        body: { action: "messages", thread_id: currentThreadId },
      });
      if (err) throw err;
      const list: NsMessage[] = (data as any)?.messages ?? [];
      list.sort((a, b) => +new Date(msgTime(a)) - +new Date(msgTime(b)));
      setMessages(list);
    } catch (e: any) {
      console.error("[pp-ns-sms] messages", e);
      setError(e?.message ?? t("messages.sendFailed"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadMessages(); /* eslint-disable-next-line */ }, [currentThreadId]);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages.length]);

  const send = async () => {
    const body = text.trim();
    if (!body) return;
    setSending(true);
    const optimistic: NsMessage = {
      id: `tmp-${Date.now()}`,
      direction: "outbound",
      from: myExt,
      to: number,
      body,
      timestamp: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimistic]);
    setText("");
    try {
      const { data, error: err } = await supabase.functions.invoke("pp-ns-sms", {
        body: { action: "send", to: number, message: body, ...(currentThreadId ? { thread_id: currentThreadId } : {}) },
      });
      if (err) throw err;
      const newThreadId = (data as any)?.result?.messagesession_id;
      if (newThreadId && !currentThreadId) setCurrentThreadId(newThreadId);
      // Refresh from server to reconcile optimistic message
      setTimeout(() => loadMessages(), 600);
    } catch (e: any) {
      toast.error(e?.message ?? t("messages.sendFailed"));
      setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="absolute inset-0 flex flex-col" style={{ background: "var(--pp-bg-base)" }}>
      <header
        className="flex items-center gap-2 px-3 py-3"
        style={{ background: "var(--pp-bg-deep)", borderBottom: "1px solid var(--pp-bg-border)" }}
      >
        <button onClick={onBack} className="p-1.5 rounded-full" style={{ color: "var(--pp-text-secondary)" }} aria-label={t("common.close")}>
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm truncate" style={{ color: "var(--pp-text-primary)" }}>{number}</p>
          <p className="text-[11px]" style={{ color: "var(--pp-text-muted)" }}>{messages.length} {messages.length > 1 ? t("messages.messages") : t("messages.message")}</p>
        </div>
        <button onClick={loadMessages} className="p-1.5 rounded-full" style={{ color: "var(--pp-text-secondary)" }} title="Refresh">
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
        </button>
        <button
          onClick={() => setSumOpen(true)}
          className="p-1.5 rounded-full"
          style={{ color: "var(--pp-agent)" }}
          title={t("messages.summarizeWithAva")}
        >
          <Sparkles className="w-4 h-4" />
        </button>
        <button
          onClick={() => onCall(number)}
          className="px-3 py-1.5 rounded-full text-white text-xs font-semibold flex items-center gap-1.5"
          style={{ background: "linear-gradient(135deg, var(--pp-success), #00A88A)" }}
        >
          <Phone className="w-3.5 h-3.5" /> {t("common.call")}
        </button>
      </header>

      <div className="flex-1 overflow-y-auto px-3 py-4 space-y-2" style={{ background: "var(--pp-bg-base)" }}>
        {loading && messages.length === 0 ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin" style={{ color: "var(--pp-brand-accent)" }} />
          </div>
        ) : error ? (
          <div className="rounded-xl p-4 text-center text-sm" style={{ background: "var(--pp-bg-surface)", color: "var(--pp-danger)" }}>
            {error}
          </div>
        ) : (
          messages.map((m, i) => {
            const out = msgIsOut(m, myExt);
            const body = msgBody(m);
            return (
              <div key={msgId(m, i)} className={`flex ${out ? "justify-end" : "justify-start"}`}>
                <div className="max-w-[78%]">
                  <div className={out ? "pp-bubble-out" : "pp-bubble-in"} style={{ padding: "8px 12px", fontSize: 14 }}>
                    {body && <p className="whitespace-pre-wrap break-words">{body}</p>}
                  </div>
                  <p className={`text-[10px] mt-1 ${out ? "text-right" : "text-left"}`} style={{ color: "var(--pp-text-faint)" }}>
                    {fmtTime(msgTime(m), lang, t)}{String(m.id ?? "").startsWith("tmp-") ? ` · ${t("common.sending")}` : ""}
                  </p>
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      <Composer
        text={text} setText={setText} onSend={send} sending={sending}
        leftAction={
          <button onClick={() => setTplOpen(true)} className="p-2 rounded-full" style={{ color: "var(--pp-brand-accent)" }} title={t("messages.templates")}>
            <Zap className="w-5 h-5" />
          </button>
        }
        extra={
          <button onClick={() => toast(t("messages.attachmentSoon"))} className="p-2 rounded-full" style={{ color: "var(--pp-text-muted)" }}>
            <Paperclip className="w-5 h-5" />
          </button>
        }
      />
      <SmsTemplatesSheet open={tplOpen} onClose={() => setTplOpen(false)} userId={userId} onPick={(body) => setText((t) => t ? `${t} ${body}` : body)} />
      <AvaSummarizeSheet
        open={sumOpen}
        source="sms"
        title={`${t("messages.smsWith")} ${number}`}
        content={messages.map((m) => `${msgIsOut(m, myExt) ? t("common.me") : number}: ${msgBody(m)}`).join("\n")}
        onClose={() => setSumOpen(false)}
        onInsert={(t) => setText((cur) => cur ? `${cur} ${t}` : t)}
      />
    </div>
  );
}

// ============================================================
// TEAM CHAT TAB
// ============================================================
type TeamMsg = {
  id: string;
  sender_id: string;
  channel: string;
  message: string;
  created_at: string;
};

function TeamChat({ profile }: { profile: any }) {
  const { t, lang } = useMplanipretLang();
  const [msgs, setMsgs] = useState<TeamMsg[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [senderNames, setSenderNames] = useState<Record<string, string>>({});
  const bottomRef = useRef<HTMLDivElement>(null);
  const channel = "general";

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("planipret_team_messages")
      .select("id, sender_id, channel, message, created_at")
      .eq("channel", channel)
      .order("created_at", { ascending: true })
      .limit(200);
    setMsgs((data ?? []) as TeamMsg[]);
    setLoading(false);

    const ids = Array.from(new Set((data ?? []).map((m: any) => m.sender_id)));
    if (ids.length) {
      const { data: profs } = await supabase
        .from("planipret_profiles")
        .select("id, full_name")
        .in("id", ids);
      const map: Record<string, string> = {};
      (profs ?? []).forEach((p: any) => { map[p.id] = p.full_name ?? t("messages.broker"); });
      setSenderNames(map);
    }
  };

  useEffect(() => { load(); }, []);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs.length]);

  useEffect(() => {
    const ch = supabase
      .channel("pp-team-chat")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "planipret_team_messages", filter: `channel=eq.${channel}` }, (payload) => {
        setMsgs((p) => [...p, payload.new as TeamMsg]);
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const send = async () => {
    const body = text.trim();
    if (!body || !profile?.id) return;
    setSending(true);
    const { error } = await supabase.from("planipret_team_messages").insert({
      sender_id: profile.id,
      channel,
      message: body,
    });
    setSending(false);
    if (error) { toast.error(error.message); return; }
    setText("");
  };

  const [sumOpen, setSumOpen] = useState(false);

  return (
    <div className="h-full flex flex-col">

      <div
        className="px-4 py-2 text-[11px] uppercase tracking-wider flex items-center justify-between"
        style={{ color: "var(--pp-text-muted)", borderBottom: "1px solid var(--pp-bg-border)" }}
      >
        <div className="flex items-center gap-2">
          <Users className="w-3 h-3" /> #{channel}
        </div>
        <button
          onClick={() => setSumOpen(true)}
          className="text-[11px] flex items-center gap-1 normal-case tracking-normal"
          style={{ color: "var(--pp-agent)" }}
        >
          <Sparkles className="w-3 h-3" /> {t("messages.summarize")}
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2">
        {loading ? (
          <div className="text-center py-8" style={{ color: "var(--pp-text-muted)" }}>
            <Loader2 className="w-5 h-5 animate-spin mx-auto" />
          </div>
        ) : msgs.length === 0 ? (
          <EmptyState Icon={Users} title={t("messages.teamEmptyTitle")} sub={t("messages.teamEmptySub")} />
        ) : (
          msgs.map((m) => {
            const mine = m.sender_id === profile?.id;
            const name = senderNames[m.sender_id] ?? t("messages.broker");
            return (
              <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                <div className="max-w-[78%]">
                  {!mine && (
                    <div className="text-[10px] mb-0.5 px-1" style={{ color: "var(--pp-brand-accent)" }}>{name}</div>
                  )}
                  <div className={mine ? "pp-bubble-out" : "pp-bubble-in"} style={{ padding: "8px 12px", fontSize: 14 }}>
                    <p className="whitespace-pre-wrap break-words">{m.message}</p>
                  </div>
                  <p className={`text-[10px] mt-1 ${mine ? "text-right" : "text-left"}`} style={{ color: "var(--pp-text-faint)" }}>
                    {fmtTime(m.created_at, lang, t)}
                  </p>
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>
      <Composer text={text} setText={setText} onSend={send} sending={sending} placeholder={t("messages.teamPlaceholder")} />

      <AvaSummarizeSheet
        open={sumOpen}
        source="team"
        title={`#${channel}`}
        content={msgs.map((m) => `${senderNames[m.sender_id] ?? t("messages.member")}: ${m.message}`).join("\n")}
        onClose={() => setSumOpen(false)}
        onInsert={(t) => setText((cur) => cur ? `${cur} ${t}` : t)}
      />
    </div>
  );
}

// ============================================================
// AVA CHAT TAB
// ============================================================
type AvaMsg = {
  id: string;
  user_id: string;
  role: "user" | "assistant";
  message: string;
  created_at: string;
};

function AvaChat({ profile, openAva, openDialer }: { profile: any; openAva: () => void; openDialer: (n?: string) => void }) {
  const { t, lang } = useMplanipretLang();
  const [msgs, setMsgs] = useState<AvaMsg[]>([]);
  const [text, setText] = useAvaDraft(profile?.user_id, "ava-chat");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [coach, setCoach] = useState<{ open: boolean; suggestions: AvaSuggestion[]; title?: string }>({ open: false, suggestions: [] });
  const bottomRef = useRef<HTMLDivElement>(null);
  // setText is the debounced draft updater
  const inputRef = useRef<(v: string) => void>(setText);
  inputRef.current = setText;

  const load = async () => {
    if (!profile?.user_id) return;
    setLoading(true);
    const { data } = await supabase
      .from("planipret_ava_conversations")
      .select("*")
      .eq("user_id", profile.user_id)
      .order("created_at", { ascending: true })
      .limit(100);
    setMsgs((data ?? []) as AvaMsg[]);
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [profile?.user_id]);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs.length]);

  const send = async () => {
    const body = text.trim();
    if (!body || !profile?.user_id) return;
    setSending(true);
    const userMsg = { user_id: profile.user_id, role: "user" as const, message: body };
    const { data: ins } = await supabase.from("planipret_ava_conversations").insert(userMsg).select().single();
    if (ins) setMsgs((p) => [...p, ins as AvaMsg]);
    setText("");

    const r = await callAva({
      mode: "chat",
      message: body,
      history: msgs.slice(-10).map((m) => ({ role: m.role, content: m.message })),
    });

    const { data: ins2 } = await supabase.from("planipret_ava_conversations")
      .insert({ user_id: profile.user_id, role: "assistant", message: r.reply }).select().single();
    if (ins2) setMsgs((p) => [...p, ins2 as AvaMsg]);

    if (r.openVoice) openAva();
    if (r.openCoach || r.suggestions.length) {
      setCoach({ open: true, suggestions: r.suggestions, title: "Coach AVA" });
    }
    setSending(false);
  };

  const clear = async () => {
    if (!profile?.user_id) return;
    await supabase.from("planipret_ava_conversations").delete().eq("user_id", profile.user_id);
    setMsgs([]);
  };

  return (
    <div className="absolute inset-x-0 top-[120px] bottom-0 flex flex-col">
      <div
        className="px-4 py-2 flex items-center justify-between"
        style={{ borderBottom: "1px solid var(--pp-bg-border)" }}
      >
        <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider" style={{ color: "var(--pp-agent)" }}>
          <Sparkles className="w-3 h-3" /> {t("messages.avaAssistant")}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setHistoryOpen(true)}
            className="text-[11px] flex items-center gap-1"
            style={{ color: "var(--pp-text-muted)" }}
            title={t("messages.avaHistory")}
          >
            <History className="w-3.5 h-3.5" /> {t("messages.avaHistory")}
          </button>
          {msgs.length > 0 && (
            <button onClick={clear} className="text-[11px]" style={{ color: "var(--pp-text-muted)" }}>
              {t("messages.clear")}
            </button>
          )}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2">
        {loading ? (
          <div className="text-center py-8" style={{ color: "var(--pp-text-muted)" }}>
            <Loader2 className="w-5 h-5 animate-spin mx-auto" />
          </div>
        ) : msgs.length === 0 ? (
          <div className="text-center py-10 px-6">
            <div
              className="w-14 h-14 mx-auto rounded-2xl flex items-center justify-center mb-3"
              style={{
                background: "linear-gradient(135deg, var(--pp-agent), #6C3CE1)",
                boxShadow: "0 8px 24px rgba(155,127,232,0.4)",
              }}
            >
              <Bot className="w-7 h-7 text-white" />
            </div>
            <p className="font-semibold" style={{ color: "var(--pp-text-primary)" }}>{t("messages.avaHello")}</p>
            <p className="text-xs mt-1" style={{ color: "var(--pp-text-muted)" }}>
              {t("messages.avaHelp")}
            </p>
            <div className="flex flex-wrap justify-center gap-1.5 mt-4">
              {[
                "📊 Brief du jour",
                "🔥 Mes hot leads",
                "📅 Mes RDV",
                "💡 Conseils du jour",
              ].map((chip) => (
                <button
                  key={chip}
                  onClick={() => setText(chip.replace(/^\S+\s/, ""))}
                  className="text-[11px] px-3 py-1.5 rounded-full"
                  style={{
                    background: "rgba(155,127,232,0.10)",
                    border: "1px solid rgba(155,127,232,0.30)",
                    color: "var(--pp-agent)",
                  }}
                >
                  {chip}
                </button>
              ))}
            </div>
          </div>
        ) : (
          msgs.map((m) => {
            const mine = m.role === "user";
            return (
              <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                <div className="max-w-[80%] flex items-end gap-2">
                  {!mine && (
                    <div
                      className="w-6 h-6 rounded-full flex items-center justify-center shrink-0"
                      style={{ background: "linear-gradient(135deg, var(--pp-agent), #6C3CE1)" }}
                    >
                      <Bot className="w-3 h-3 text-white" />
                    </div>
                  )}
                  <div>
                    <div
                      className={mine ? "pp-bubble-out" : ""}
                      style={
                        mine
                          ? { padding: "8px 12px", fontSize: 14 }
                          : {
                              padding: "8px 12px",
                              fontSize: 14,
                              background: "rgba(155,127,232,0.10)",
                              border: "1px solid rgba(155,127,232,0.25)",
                              color: "var(--pp-text-primary)",
                              borderRadius: "16px 16px 16px 4px",
                            }
                      }
                    >
                      <p className="whitespace-pre-wrap break-words">{m.message}</p>
                    </div>
                    <p className={`text-[10px] mt-1 ${mine ? "text-right" : "text-left"}`} style={{ color: "var(--pp-text-faint)" }}>
                      {fmtTime(m.created_at, lang, t)}
                    </p>
                  </div>
                </div>
              </div>
            );
          })
        )}
        {sending && (
          <div className="flex justify-start">
            <div
              className="px-3 py-2 rounded-2xl text-sm flex items-center gap-2"
              style={{
                background: "rgba(155,127,232,0.10)",
                border: "1px solid rgba(155,127,232,0.25)",
                color: "var(--pp-agent)",
              }}
            >
              <Loader2 className="w-3 h-3 animate-spin" /> {t("messages.avaThinking")}
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>
      <Composer
        text={text} setText={setText} onSend={send} sending={sending}
        placeholder={t("messages.avaPlaceholder")} accent="agent"
        leftAction={
          profile?.voice_agent_enabled ? (
            <button
              onClick={openAva}
              className="p-2 rounded-full"
              style={{ color: "var(--pp-agent)" }}
              title={t("messages.voiceMode")}
            >
              <Mic className="w-5 h-5" />
            </button>
          ) : null
        }
      />

      <AvaHistorySheet open={historyOpen} userId={profile?.user_id} onClose={() => setHistoryOpen(false)} />
      <CoachOverlay
        open={coach.open}
        title={coach.title}
        suggestions={coach.suggestions}
        ctx={{ openDialer, openAva, userId: profile?.user_id, profileId: profile?.id }}
        onClose={() => setCoach({ open: false, suggestions: [] })}
      />
    </div>
  );
}


// ============================================================
// EMAILS TAB (M365)
// ============================================================
function EmailsList({ profile, openAva: _openAva }: { profile: any; openAva: () => void }) {
  const { t, lang } = useMplanipretLang();
  const [emails, setEmails] = useState<any[] | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "no_m365" | "error">("loading");
  const [active, setActive] = useState<any | null>(null);
  const [composeOpen, setComposeOpen] = useState(false);
  const [composeInit, setComposeInit] = useState<{ to?: string; subject?: string; body?: string }>({});

  const load = async () => {
    if (!profile?.ms365_access_token) { setState("no_m365"); return; }
    setState((s) => (s === "ready" ? s : "loading"));
    const { data, error } = await supabase.functions.invoke("ms365-actions", {
      body: { action: "read_emails", payload: { top: 25 } },
    });
    if (error || !(data as any)?.success) { setState("error"); return; }
    setEmails(((data as any).emails ?? (data as any).messages ?? []));
    setState("ready");
  };

  useEffect(() => {
    load(); /* eslint-disable-next-line */
    if (!profile?.ms365_access_token) return;
    const id = window.setInterval(() => { load(); }, 60_000);
    const onVis = () => { if (document.visibilityState === "visible") load(); };
    document.addEventListener("visibilitychange", onVis);
    return () => { window.clearInterval(id); document.removeEventListener("visibilitychange", onVis); };
  }, [profile?.ms365_access_token]);

  return (
    <div className="h-full overflow-y-auto p-3">
      <div className="flex items-center justify-between mb-2">
        <button
          onClick={() => { setComposeInit({}); setComposeOpen(true); }}
          className="px-3 py-1.5 rounded-full flex items-center gap-1.5 text-xs font-semibold text-white"
          style={{
            background: "linear-gradient(135deg, var(--pp-brand-accent), var(--pp-brand-accent-2))",
            boxShadow: "0 2px 12px rgba(46,155,220,0.4)",
          }}
        >
          <Plus className="w-3.5 h-3.5" /> {t("messages.emailCompose")}
        </button>
        <button
          onClick={load}
          className="text-xs flex items-center gap-1 px-2 py-1"
          style={{ color: "var(--pp-text-muted)" }}
        >
          <RefreshCw className={`w-3 h-3 ${state === "loading" ? "animate-spin" : ""}`} /> {t("common.refresh")}
        </button>
      </div>

      {state === "loading" && (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-2xl h-20 animate-pulse" style={{ background: "var(--pp-bg-surface)" }} />
          ))}
        </div>
      )}

      {state === "no_m365" && (
        <div
          className="rounded-2xl p-6 text-center mt-6"
          style={{ background: "var(--pp-bg-surface)", border: "1px solid var(--pp-bg-border-2)" }}
        >
          <Mail className="w-10 h-10 mx-auto mb-3" style={{ color: "var(--pp-brand-accent)" }} />
          <p className="font-semibold" style={{ color: "var(--pp-text-primary)" }}>{t("messages.m365NotConnected")}</p>
          <p className="text-xs mt-1 mb-3" style={{ color: "var(--pp-text-muted)" }}>
            {t("messages.m365ConnectDesc")}
          </p>
          <a
            href="/mplanipret/more"
            className="inline-block text-xs px-4 py-2 rounded-full text-white font-semibold"
            style={{ background: "linear-gradient(135deg, var(--pp-brand-accent), var(--pp-brand-accent-2))" }}
          >
            {t("messages.connectM365")}
          </a>
        </div>
      )}

      {state === "error" && (
        <div className="text-center py-10">
          <p className="text-sm" style={{ color: "var(--pp-text-muted)" }}>{t("messages.emailsLoadFailed")}</p>
          <button
            onClick={load}
            className="mt-3 text-xs px-3 py-1.5 rounded-full"
            style={{ border: "1px solid var(--pp-bg-border-2)", color: "var(--pp-text-secondary)" }}
          >
            {t("common.retry")}
          </button>
        </div>
      )}

      {state === "ready" && (emails?.length === 0 ? (
        <EmptyState Icon={Mail} title={t("messages.emptyInbox")} sub={t("messages.noRecentEmail")} />
      ) : (
        <ul className="space-y-1.5">
          {emails!.map((e: any, i: number) => {
            const from = e.from?.emailAddress?.name ?? e.from?.emailAddress?.address ?? t("messages.sender");
            const subject = e.subject ?? t("messages.noSubject");
            const preview = e.bodyPreview ?? "";
            const received = e.receivedDateTime ?? e.created_at;
            const unread = e.isRead === false;
            return (
              <li key={e.id ?? i}>
                <button
                  onClick={() => setActive(e)}
                  className="w-full text-left rounded-2xl p-3 active:opacity-80"
                  style={{
                    background: "var(--pp-bg-surface)",
                    border: "1px solid var(--pp-bg-border-2)",
                    borderLeft: unread ? "3px solid var(--pp-brand-accent)" : "1px solid var(--pp-bg-border-2)",
                  }}
                >
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <p className="font-semibold text-sm truncate" style={{ color: "var(--pp-text-primary)" }}>{from}</p>
                    <span className="text-[10px] shrink-0" style={{ color: "var(--pp-text-faint)" }}>
                      {received ? fmtTime(received, lang, t) : ""}
                    </span>
                  </div>
                  <p className="text-xs truncate mb-1" style={{ color: "var(--pp-text-secondary)" }}>{subject}</p>
                  <p className="text-[11px] line-clamp-2" style={{ color: "var(--pp-text-muted)" }}>{preview}</p>
                </button>
              </li>
            );
          })}
        </ul>
      ))}

      {active && (
        <EmailDetailSheet
          email={active}
          onClose={() => setActive(null)}
          onReply={(init) => { setActive(null); setComposeInit(init); setComposeOpen(true); }}
        />
      )}
      {composeOpen && (
        <EmailComposeSheet
          init={composeInit}
          onClose={() => setComposeOpen(false)}
          onSent={() => { setComposeOpen(false); load(); }}
        />
      )}
    </div>
  );
}

function EmailDetailSheet({ email, onClose, onReply }: { email: any; onClose: () => void; onReply: (init: { to?: string; subject?: string; body?: string }) => void }) {
  const { t } = useMplanipretLang();
  const from = email.from?.emailAddress?.name ?? email.from?.emailAddress?.address ?? t("messages.sender");
  const fromAddr = email.from?.emailAddress?.address ?? "";
  const subject = email.subject ?? t("messages.noSubject");
  const preview = email.bodyPreview ?? "";
  const [sumOpen, setSumOpen] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<any | null>(null);

  const analyzeWithAva = async () => {
    if (!email.id) { toast.error("Message ID manquant"); return; }
    setAnalyzing(true);
    try {
      const { data, error } = await supabase.functions.invoke("ava-email-analyzer", {
        body: { ms_message_id: email.id },
      });
      if (error || !(data as any)?.success) {
        throw new Error((data as any)?.error ?? error?.message ?? "Échec de l'analyse");
      }
      setAnalysis((data as any).analysis);
      if ((data as any).cached) toast.info("Analyse récupérée du cache");
    } catch (e: any) {
      toast.error(e?.message ?? "Erreur AVA");
    } finally {
      setAnalyzing(false);
    }
  };


  return (
    <div className="absolute inset-0 z-40 bg-black/60 backdrop-blur-sm flex items-end" onClick={onClose}>
      <div
        className="w-full rounded-t-3xl flex flex-col"
        style={{ background: "var(--pp-bg-base)", border: "1px solid var(--pp-bg-border-2)", height: "92%" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 pt-3 pb-2" style={{ borderBottom: "1px solid var(--pp-bg-border)" }}>
          <button onClick={onClose} className="p-1.5 rounded-full" style={{ color: "var(--pp-text-secondary)" }}>
            <ArrowLeft className="w-5 h-5" />
          </button>
          <p className="text-xs uppercase tracking-wider" style={{ color: "var(--pp-text-muted)" }}>Email</p>
          <div className="w-7" />
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
          <div>
            <p className="text-base font-semibold" style={{ color: "var(--pp-text-primary)" }}>{subject}</p>
            <p className="text-xs mt-1" style={{ color: "var(--pp-text-muted)" }}>
              {t("messages.from")} <span style={{ color: "var(--pp-text-secondary)" }}>{from}</span> {fromAddr && `<${fromAddr}>`}
            </p>
          </div>

          <button
            onClick={analyzeWithAva}
            disabled={analyzing}
            className="w-full px-3 py-2 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-60"
            style={{
              background: "linear-gradient(135deg, #2D1A5A, #9B7FE8)",
              border: "1px solid rgba(155,127,232,0.35)",
              color: "white",
            }}
          >
            {analyzing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            {analyzing ? "AVA analyse…" : "🤖 Analyser avec AVA"}
          </button>

          <button
            onClick={() => setSumOpen(true)}
            className="w-full px-3 py-2 rounded-xl text-xs font-medium flex items-center justify-center gap-2"
            style={{
              background: "rgba(155,127,232,0.12)",
              border: "1px solid rgba(155,127,232,0.30)",
              color: "var(--pp-agent)",
            }}
          >
            <Sparkles className="w-3.5 h-3.5" /> {t("messages.summarizeWithAva")}
          </button>

          {analysis && (
            <AvaProposedActionsCard analysis={analysis} onDismiss={() => setAnalysis(null)} />
          )}

          <div
            className="rounded-xl p-3 text-sm whitespace-pre-wrap"
            style={{ background: "var(--pp-bg-surface)", border: "1px solid var(--pp-bg-border-2)", color: "var(--pp-text-secondary)" }}
          >
            {preview || t("messages.previewUnavailable")}
          </div>
        </div>

        <div className="px-4 py-3 flex gap-2" style={{ borderTop: "1px solid var(--pp-bg-border)" }}>

          <button
            onClick={() => onReply({
              to: fromAddr,
              subject: subject.startsWith("Re:") ? subject : `Re: ${subject}`,
              body: `\n\n---\nDe: ${from}\n${preview}`,
            })}
            className="flex-1 py-2.5 rounded-full text-white font-semibold text-sm flex items-center justify-center gap-2"
            style={{ background: "linear-gradient(135deg, var(--pp-brand-accent), var(--pp-brand-accent-2))" }}
          >
            <Reply className="w-4 h-4" /> {t("messages.reply")}
          </button>
        </div>
      </div>

      <AvaSummarizeSheet
        open={sumOpen}
        source="email"
        title={subject}
        content={`De: ${from} <${fromAddr}>\nObjet: ${subject}\n\n${preview}`}
        onClose={() => setSumOpen(false)}
        onInsert={(text) => {
          setSumOpen(false);
          onReply({
            to: fromAddr,
            subject: subject.startsWith("Re:") ? subject : `Re: ${subject}`,
            body: `${text}\n\n---\nDe: ${from}\n${preview}`,
          });
        }}
      />
    </div>
  );
}


function EmailComposeSheet({ init, onClose, onSent }: { init: { to?: string; subject?: string; body?: string }; onClose: () => void; onSent: () => void }) {
  const { t } = useMplanipretLang();
  const [to, setTo] = useState(init.to ?? "");
  const [subject, setSubject] = useState(init.subject ?? "");
  const [body, setBody] = useState(init.body ?? "");
  const [sending, setSending] = useState(false);

  const send = async () => {
    if (!to.trim()) { toast.error(t("messages.recipientRequired")); return; }
    setSending(true);
    const { data, error } = await supabase.functions.invoke("ms365-actions", {
      body: { action: "send_email", payload: { to: to.split(",").map((s) => s.trim()).filter(Boolean), subject, body: body.replace(/\n/g, "<br/>") } },
    });
    setSending(false);
    if (error || !(data as any)?.success) {
      toast.error(t("messages.emailSendFailed"));
      return;
    }
    toast.success(t("messages.emailSent"));
    onSent();
  };

  return (
    <div className="absolute inset-0 z-40 bg-black/60 backdrop-blur-sm flex items-end" onClick={onClose}>
      <div
        className="w-full rounded-t-3xl flex flex-col"
        style={{ background: "var(--pp-bg-base)", border: "1px solid var(--pp-bg-border-2)", height: "92%" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 pt-3 pb-2" style={{ borderBottom: "1px solid var(--pp-bg-border)" }}>
          <button onClick={onClose} className="p-1.5 rounded-full" style={{ color: "var(--pp-text-secondary)" }}>
            <X className="w-5 h-5" />
          </button>
          <p className="text-xs uppercase tracking-wider" style={{ color: "var(--pp-text-muted)" }}>{t("messages.newEmail")}</p>
          <button
            onClick={send}
            disabled={sending || !to.trim()}
            className="px-3 py-1 rounded-full text-white text-xs font-semibold flex items-center gap-1 disabled:opacity-50"
            style={{ background: "linear-gradient(135deg, var(--pp-brand-accent), var(--pp-brand-accent-2))" }}
          >
            {sending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
            {t("common.send")}
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
          <input
            value={to} onChange={(e) => setTo(e.target.value)} placeholder={t("messages.toPlaceholder")}
            className="w-full px-3 py-2 rounded-lg text-sm outline-none"
            style={{ background: "var(--pp-bg-elevated)", border: "1px solid var(--pp-bg-border-2)", color: "var(--pp-text-primary)" }}
          />
          <input
            value={subject} onChange={(e) => setSubject(e.target.value)} placeholder={t("messages.subject")}
            className="w-full px-3 py-2 rounded-lg text-sm outline-none"
            style={{ background: "var(--pp-bg-elevated)", border: "1px solid var(--pp-bg-border-2)", color: "var(--pp-text-primary)" }}
          />
          <textarea
            value={body} onChange={(e) => setBody(e.target.value)} placeholder={t("messages.yourMessage")}
            rows={14}
            className="w-full px-3 py-2 rounded-lg text-sm outline-none resize-none"
            style={{ background: "var(--pp-bg-elevated)", border: "1px solid var(--pp-bg-border-2)", color: "var(--pp-text-primary)" }}
          />
        </div>
      </div>
    </div>
  );
}

// ============================================================
// SHARED PRIMITIVES
// ============================================================
function Composer({
  text, setText, onSend, sending, placeholder, leftAction, extra, accent = "brand",
}: {
  text: string; setText: (v: string) => void; onSend: () => void; sending: boolean;
  placeholder?: string; leftAction?: React.ReactNode; extra?: React.ReactNode;
  accent?: "brand" | "agent";
}) {
  const { t } = useMplanipretLang();
  const accentBg =
    accent === "agent"
      ? "linear-gradient(135deg, var(--pp-agent), #6C3CE1)"
      : "linear-gradient(135deg, var(--pp-brand-accent), var(--pp-brand-accent-2))";
  return (
    <div
      className="px-3 py-2 flex items-center gap-2"
      style={{ background: "var(--pp-bg-deep)", borderTop: "1px solid var(--pp-bg-border)" }}
    >
      {extra}
      {leftAction}
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); onSend(); } }}
        placeholder={placeholder ?? t("messages.yourMessage")}
        className="flex-1 px-3 py-2 rounded-full text-sm outline-none"
        style={{
          background: "var(--pp-bg-elevated)",
          border: "1px solid var(--pp-bg-border-2)",
          color: "var(--pp-text-primary)",
        }}
      />
      <button
        onClick={onSend}
        disabled={!text.trim() || sending}
        className="w-9 h-9 rounded-full flex items-center justify-center text-white disabled:opacity-50 shrink-0"
        style={{ background: accentBg, boxShadow: "0 2px 12px rgba(46,155,220,0.35)" }}
      >
        {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
      </button>
    </div>
  );
}

function EmptyState({ Icon, title, sub }: { Icon: any; title: string; sub: string }) {
  return (
    <div className="p-10 text-center">
      <div
        className="w-14 h-14 mx-auto rounded-full flex items-center justify-center mb-3"
        style={{ background: "rgba(46,155,220,0.12)", color: "var(--pp-brand-accent)" }}
      >
        <Icon className="w-6 h-6" />
      </div>
      <div className="font-semibold" style={{ color: "var(--pp-text-secondary)" }}>{title}</div>
      <div className="text-xs mt-1" style={{ color: "var(--pp-text-muted)" }}>{sub}</div>
    </div>
  );
}

// ============================================================
// TEAM ROSTER (members directory + quick actions via M365)
// ============================================================
type RosterMember = {
  id: string;
  user_id: string;
  full_name: string | null;
  email: string | null;
  extension: string | null;
  role: string | null;
  avatar_url: string | null;
  voice_agent_enabled: boolean | null;
  organization_id: string | null;
};

function TeamRoster({ profile, openDialer, onSwitchTab }: { profile: any; openDialer: (n?: string) => void; onSwitchTab: (k: SubTab) => void }) {
  const { t } = useMplanipretLang();
  const [members, setMembers] = useState<RosterMember[]>([]);
  const [lastSeen, setLastSeen] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [composeOpen, setComposeOpen] = useState(false);
  const [composeInit, setComposeInit] = useState<{ to?: string; subject?: string; body?: string }>({});

  const load = async () => {
    if (!profile?.organization_id) { setLoading(false); return; }
    setLoading(true);
    const { data } = await supabase
      .from("planipret_profiles")
      .select("id, user_id, full_name, email, extension, role, avatar_url, voice_agent_enabled, organization_id")
      .eq("organization_id", profile.organization_id)
      .order("full_name", { ascending: true })
      .limit(200);
    const list = ((data ?? []) as any[]).filter((m) => m.id !== profile.id) as RosterMember[];
    setMembers(list);

    // Derive "active récemment" from latest phone_call or team_message per user
    const ids = list.map((m) => m.user_id).filter(Boolean);
    if (ids.length) {
      const seen: Record<string, string> = {};
      const [{ data: calls }, { data: tmsgs }] = await Promise.all([
        supabase.from("planipret_phone_calls").select("user_id, created_at").in("user_id", ids).order("created_at", { ascending: false }).limit(500),
        supabase.from("planipret_team_messages").select("sender_id, created_at").in("sender_id", list.map((m) => m.id)).order("created_at", { ascending: false }).limit(500),
      ]);
      for (const r of (calls ?? []) as any[]) {
        if (!seen[r.user_id] || seen[r.user_id] < r.created_at) seen[r.user_id] = r.created_at;
      }
      for (const r of (tmsgs ?? []) as any[]) {
        const u = list.find((m) => m.id === r.sender_id)?.user_id;
        if (u && (!seen[u] || seen[u] < r.created_at)) seen[u] = r.created_at;
      }
      setLastSeen(seen);
    }
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [profile?.organization_id]);

  const statusFor = (userId: string | null) => {
    if (!userId) return { color: "var(--pp-text-faint)", label: "—" };
    const ts = lastSeen[userId];
    if (!ts) return { color: "var(--pp-text-faint)", label: t("home.offline") };
    const age = Date.now() - +new Date(ts);
    if (age < 2 * 60_000) return { color: "var(--pp-success)", label: t("home.online") };
    if (age < 30 * 60_000) return { color: "var(--pp-warning, #F5A623)", label: t("common.inactive") };
    return { color: "var(--pp-text-faint)", label: t("home.offline") };
  };

  const sendMention = async (m: RosterMember) => {
    if (!profile?.id) return;
    const body = `@${m.full_name ?? "membre"} `;
    const { error } = await supabase.from("planipret_team_messages").insert({
      sender_id: profile.id, channel: "general", message: body,
    } as any);
    if (error) { toast.error(error.message); return; }
    toast.success("Mention envoyée dans #general");
    onSwitchTab("team");
  };

  return (
    <div className="h-full overflow-y-auto p-3">
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="rounded-2xl h-20 animate-pulse" style={{ background: "var(--pp-bg-surface)" }} />
          ))}
        </div>
      ) : members.length === 0 ? (
        <EmptyState Icon={Users} title="Annuaire vide" sub="Aucun autre membre dans votre organisation." />
      ) : (
        <ul className="space-y-1.5">
          {members.map((m) => {
            const st = statusFor(m.user_id);
            return (
              <li key={m.id} className="rounded-2xl p-3" style={{ background: "var(--pp-bg-surface)", border: "1px solid var(--pp-bg-border-2)" }}>
                <div className="flex items-center gap-3 mb-2">
                  <div className="relative shrink-0">
                    {m.avatar_url ? (
                      <img src={m.avatar_url} alt="" className="w-11 h-11 rounded-full object-cover" />
                    ) : (
                      <div className="w-11 h-11 rounded-full flex items-center justify-center text-white text-sm font-semibold"
                        style={{ background: "linear-gradient(135deg, var(--pp-brand-accent), var(--pp-brand-accent-2))" }}>
                        {initials(m.full_name ?? m.email ?? "?")}
                      </div>
                    )}
                    <span
                      className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2"
                      style={{ background: st.color, borderColor: "var(--pp-bg-surface)" }}
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm truncate" style={{ color: "var(--pp-text-primary)" }}>{m.full_name ?? m.email ?? "Membre"}</p>
                    <p className="text-[11px] truncate flex items-center gap-1.5" style={{ color: "var(--pp-text-muted)" }}>
                      <Circle className="w-2 h-2" style={{ fill: st.color, color: st.color }} /> {st.label}
                      {m.extension && <span style={{ color: "var(--pp-text-faint)" }}>· ext {m.extension}</span>}
                      {m.role && <span style={{ color: "var(--pp-text-faint)" }}>· {m.role}</span>}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <ActionPill Icon={Phone} label="Appeler" disabled={!m.extension} onClick={() => m.extension && openDialer(m.extension)} />
                  <ActionPill Icon={MessageSquare} label="SMS" disabled={!m.extension} onClick={() => { if (m.extension) { onSwitchTab("sms"); toast(`SMS vers ${m.extension}`); } }} />
                  <ActionPill
                    Icon={Mail}
                    label="Email"
                    disabled={!m.email || !profile?.ms365_access_token}
                    onClick={() => { setComposeInit({ to: m.email ?? "" }); setComposeOpen(true); }}
                  />
                  <ActionPill Icon={Users} label="@Mention" onClick={() => sendMention(m)} />
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {composeOpen && (
        <EmailComposeSheet
          init={composeInit}
          onClose={() => setComposeOpen(false)}
          onSent={() => setComposeOpen(false)}
        />
      )}
    </div>
  );
}

function ActionPill({ Icon, label, onClick, disabled }: { Icon: any; label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex-1 py-1.5 rounded-full text-[11px] font-semibold flex items-center justify-center gap-1 disabled:opacity-40"
      style={{
        background: "var(--pp-bg-elevated)",
        border: "1px solid var(--pp-bg-border-2)",
        color: "var(--pp-text-secondary)",
      }}
    >
      <Icon className="w-3 h-3" /> {label}
    </button>
  );
}

// ============================================================================
// TEAMS 365 PANEL — Microsoft Teams chats + channels via MS Graph
// ============================================================================
function Teams365Panel({ profile }: { profile: any }) {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [chats, setChats] = useState<any[]>([]);
  const [teams, setTeams] = useState<any[]>([]);
  const [active, setActive] = useState<
    | { kind: "chat"; id: string; title: string }
    | { kind: "channel"; teamId: string; channelId: string; title: string }
    | null
  >(null);

  const connected = !!profile?.ms365_access_token;

  const load = async () => {
    if (!connected) { setLoading(false); setErr("ms365_not_connected"); return; }
    setLoading(true);
    setErr(null);
    const { data, error } = await supabase.functions.invoke("ms365-teams-list", { body: {} });
    setLoading(false);
    const payload = (data as any) ?? {};
    if (error && !payload.chats) {
      setErr(error.message || "Erreur");
      return;
    }
    if (payload.connected === false || payload.error === "ms365_not_connected") {
      setErr("ms365_not_connected");
      return;
    }
    if (payload.error) {
      setErr(payload.error);
      return;
    }
    setChats(payload.chats || []);
    setTeams(payload.teams || []);
  };
  useEffect(() => {
    load(); /* eslint-disable-next-line */
    if (!connected) return;
    const id = window.setInterval(() => { load(); }, 60_000);
    return () => window.clearInterval(id);
  }, [connected]);

  if (active) return <TeamsThreadView target={active} onClose={() => setActive(null)} />;

  return (
    <div className="h-full overflow-y-auto px-4 py-3 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold" style={{ color: "var(--pp-text-primary)" }}>Microsoft Teams</h2>
        <button onClick={load} className="text-xs px-2 py-1 rounded-full flex items-center gap-1"
          style={{ background: "var(--pp-bg-elevated)", color: "var(--pp-text-muted)" }}>
          <RefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} /> Recharger
        </button>
      </div>

      {err === "ms365_not_connected" && (
        <div className="rounded-2xl p-6 text-center mt-4" style={{ background: "var(--pp-bg-surface)", border: "1px solid var(--pp-bg-border-2)" }}>
          <Users className="w-10 h-10 mx-auto mb-3" style={{ color: "var(--pp-brand-accent)" }} />
          <p className="font-semibold" style={{ color: "var(--pp-text-primary)" }}>Microsoft 365 non connecté</p>
          <p className="text-xs mt-1 mb-3" style={{ color: "var(--pp-text-muted)" }}>
            Connectez votre compte Microsoft pour voir vos chats Teams, canaux et coéquipiers.
          </p>
          <a
            href="/mplanipret/more"
            className="inline-block text-xs px-4 py-2 rounded-full text-white font-semibold"
            style={{ background: "linear-gradient(135deg, var(--pp-brand-accent), var(--pp-brand-accent-2))" }}
          >
            Connecter Microsoft 365
          </a>
        </div>
      )}
      {err && err !== "ms365_not_connected" && (
        <div className="text-xs p-3 rounded-lg" style={{ background: "rgba(220,38,38,0.08)", color: "#dc2626" }}>{err}</div>
      )}

      {!err && (
        <>
          <div>
            <div className="text-[10px] uppercase tracking-wider mb-2" style={{ color: "var(--pp-text-muted)" }}>Chats récents</div>
            {loading && !chats.length ? (
              <div className="text-xs" style={{ color: "var(--pp-text-muted)" }}>Chargement…</div>
            ) : chats.length === 0 ? (
              <div className="text-xs" style={{ color: "var(--pp-text-muted)" }}>Aucun chat récent.</div>
            ) : (
              <div className="space-y-1">
                {chats.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => setActive({ kind: "chat", id: c.id, title: c.topic })}
                    className="w-full text-left px-3 py-2 rounded-lg flex flex-col"
                    style={{ background: "var(--pp-bg-elevated)", border: "1px solid var(--pp-bg-border)" }}
                  >
                    <div className="text-sm font-medium truncate" style={{ color: "var(--pp-text-primary)" }}>{c.topic}</div>
                    {c.preview && (
                      <div className="text-[11px] truncate" style={{ color: "var(--pp-text-muted)" }} dangerouslySetInnerHTML={{ __html: c.preview }} />
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          {teams.length > 0 && (
            <div>
              <div className="text-[10px] uppercase tracking-wider mb-2" style={{ color: "var(--pp-text-muted)" }}>Équipes & canaux</div>
              <div className="space-y-2">
                {teams.map((tm) => (
                  <div key={tm.id} className="rounded-lg p-2" style={{ background: "var(--pp-bg-elevated)", border: "1px solid var(--pp-bg-border)" }}>
                    <div className="text-xs font-semibold mb-1" style={{ color: "var(--pp-text-primary)" }}>{tm.displayName}</div>
                    <div className="flex flex-wrap gap-1">
                      {tm.channels.map((ch: any) => (
                        <button
                          key={ch.id}
                          onClick={() => setActive({ kind: "channel", teamId: tm.id, channelId: ch.id, title: `${tm.displayName} · ${ch.displayName}` })}
                          className="text-[11px] px-2 py-1 rounded-full"
                          style={{ background: "var(--pp-bg-deep)", color: "var(--pp-text-primary)" }}
                        >
                          #{ch.displayName}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function TeamsThreadView({ target, onClose }: {
  target: { kind: "chat"; id: string; title: string } | { kind: "channel"; teamId: string; channelId: string; title: string };
  onClose: () => void;
}) {
  const [messages, setMessages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [sendStatus, setSendStatus] = useState<null | { kind: "ok" | "err"; message: string; lastText?: string }>(null);

  const invokeBody = target.kind === "chat"
    ? { chat_id: target.id }
    : { team_id: target.teamId, channel_id: target.channelId };

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.functions.invoke("ms365-teams-messages", {
      body: { action: "list", ...invokeBody, top: 40 },
    });
    setLoading(false);
    let payload: any = data ?? {};
    if (error && (error as any).context?.text) {
      try { payload = JSON.parse(await (error as any).context.text()); } catch { /* ignore */ }
    }
    if (payload?.error === "ms365_not_connected") {
      toast.error("Microsoft 365 non connecté. Ouvrez Plus → Microsoft 365.");
      return;
    }
    if (payload?.error) {
      toast.error(payload.error + (payload.detail?.error?.message ? `: ${payload.detail.error.message}` : ""));
      return;
    }
    if (error) { toast.error(error.message || "Erreur"); return; }
    setMessages(((payload.messages) || []).slice().reverse());
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const doSend = async (content: string) => {
    setSending(true);
    setSendStatus(null);
    const { data, error } = await supabase.functions.invoke("ms365-teams-messages", {
      body: { action: "send", ...invokeBody, content, contentType: "text" },
    });
    setSending(false);
    let payload: any = data ?? {};
    if (error && (error as any).context?.text) {
      try { payload = JSON.parse(await (error as any).context.text()); } catch { /* ignore */ }
    }
    if (payload?.error || error) {
      const detail = payload?.detail?.error?.message ? `: ${payload.detail.error.message}` : "";
      const msg = (payload?.error ? payload.error + detail : (error?.message || "Envoi refusé"));
      setSendStatus({ kind: "err", message: msg, lastText: content });
      toast.error(msg);
      return;
    }
    setSendStatus({ kind: "ok", message: "Message envoyé" });
    setText("");
    load();
    setTimeout(() => setSendStatus((s) => (s?.kind === "ok" ? null : s)), 2500);
  };

  const send = () => {
    if (!text.trim() || sending) return;
    doSend(text.trim());
  };

  const retry = () => {
    if (!sendStatus?.lastText || sending) return;
    doSend(sendStatus.lastText);
  };

  return (
    <div className="h-full flex flex-col" style={{ background: "var(--pp-bg-base)" }}>
      <div className="px-4 py-3 flex items-center gap-2" style={{ borderBottom: "1px solid var(--pp-bg-border)" }}>
        <button onClick={onClose} className="p-1"><ArrowLeft className="w-4 h-4" style={{ color: "var(--pp-text-primary)" }} /></button>
        <div className="flex-1 text-sm font-semibold truncate" style={{ color: "var(--pp-text-primary)" }}>{target.title}</div>
        <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: "var(--pp-bg-elevated)", color: "var(--pp-text-muted)" }}>
          {target.kind === "chat" ? "Chat" : "Canal"}
        </span>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
        {loading ? <div className="text-xs" style={{ color: "var(--pp-text-muted)" }}>Chargement…</div> :
          messages.length === 0 ? <div className="text-xs" style={{ color: "var(--pp-text-muted)" }}>Aucun message.</div> :
          messages.map((m) => (
            <div key={m.id} className="rounded-lg px-3 py-2" style={{ background: "var(--pp-bg-elevated)" }}>
              <div className="text-[10px] mb-0.5" style={{ color: "var(--pp-text-muted)" }}>{m.from} · {fmtTime(m.createdAt)}</div>
              <div className="text-sm" style={{ color: "var(--pp-text-primary)" }} dangerouslySetInnerHTML={{ __html: m.content }} />
            </div>
          ))
        }
      </div>
      {sendStatus && (
        <div className="px-3 py-2 flex items-center gap-2 text-xs"
          style={{
            borderTop: "1px solid var(--pp-bg-border)",
            background: sendStatus.kind === "ok" ? "rgba(34,197,94,0.12)" : "rgba(239,68,68,0.12)",
            color: sendStatus.kind === "ok" ? "#22c55e" : "#ef4444",
          }}>
          {sendStatus.kind === "ok" ? <CheckCircle2 className="w-3.5 h-3.5" /> : <AlertTriangle className="w-3.5 h-3.5" />}
          <span className="flex-1 truncate">{sendStatus.message}</span>
          {sendStatus.kind === "err" && sendStatus.lastText && (
            <button onClick={retry} disabled={sending} className="px-2 py-0.5 rounded-full flex items-center gap-1" style={{ background: "rgba(239,68,68,0.2)", color: "#ef4444" }}>
              <RotateCw className="w-3 h-3" /> Réessayer
            </button>
          )}
        </div>
      )}
      <div className="px-3 py-2 flex items-center gap-2" style={{ borderTop: "1px solid var(--pp-bg-border)", background: "var(--pp-bg-deep)" }}>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
          placeholder="Écrire un message…"
          className="flex-1 text-sm px-3 py-2 rounded-full outline-none"
          style={{ background: "var(--pp-bg-elevated)", color: "var(--pp-text-primary)" }}
        />
        <button
          onClick={send}
          disabled={sending || !text.trim()}
          className="p-2 rounded-full"
          style={{ background: "linear-gradient(135deg, var(--pp-brand-accent), var(--pp-brand-accent-2))", color: "white", opacity: sending || !text.trim() ? 0.5 : 1 }}
        >
          {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );
}
