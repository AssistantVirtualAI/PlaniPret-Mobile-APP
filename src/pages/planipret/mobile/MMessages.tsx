import { useEffect, useMemo, useRef, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Plus, X, ArrowLeft, Phone, Send, Paperclip, MessageSquare, Zap,
  Users, Mail, Sparkles, Loader2, RefreshCw, Reply, Circle, CheckCircle2, AlertTriangle, RotateCw,
  UsersRound, Contact,
} from "lucide-react";
import type { PlanipretMobileContext } from "../PlanipretMobile";
import SmsTemplatesSheet from "@/components/planipret/SmsTemplatesSheet";
import AvaSummarizeSheet from "@/components/planipret/ava/AvaSummarizeSheet";
import AvaProposedActionsCard from "@/components/planipret/mobile/AvaProposedActionsCard";
import { callAva, type AvaSuggestion } from "@/services/avaProactive";
import { useMplanipretLang } from "@/hooks/useMplanipretLang";
import { useCallerNames } from "@/lib/planipret/callerLookup";

type SubTab = "sms" | "team" | "teams365" | "emails" | "roster";


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
  const { profile, openDialer, registerRefresh } = useOutletContext<PlanipretMobileContext>();
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
        {sub === "emails" && <EmailsList profile={profile} />}
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

const threadId = (t: any) =>
  t.id ?? t.messagesession_id ?? t["messagesession-id"] ?? t.session_id ?? t.destination ?? t.phonenumber ?? t.remote_party ?? "";
const threadPeer = (t: any) => {
  const raw = t.destination ?? t.remote_party ?? t.contact ?? t.phonenumber ?? t.phone_number ?? t.caller_id ?? t.from ?? t.to ?? t.participant ??
    t["messagesession-remote"] ?? t["messagesession-remote-party"] ??
    (Array.isArray(t.participants) && t.participants[0]?.destination) ??
    (Array.isArray(t.session_participants) && t.session_participants[0]?.destination) ??
    "";
  return raw ? String(raw) : "";
};
const threadTime = (t: any) =>
  t.last_message_at ?? t.updated_at ?? t.timestamp ?? t["messagesession-last-datetime"] ?? t["messagesession-start-datetime"] ?? new Date().toISOString();
const msgId = (m: any, i: number) => m.id ?? m.message_id ?? m["message-id"] ?? `${m.timestamp ?? m.created_at ?? i}-${i}`;
const msgBody = (m: any) => m.body ?? m.message ?? m.text ?? m["message-text"] ?? "";
const msgTime = (m: any) => {
  const raw = m.timestamp ?? m.created_at ?? m.sent_at ?? m["message-datetime"];
  if (!raw) return new Date().toISOString();
  // NS-API returns "YYYY-MM-DD HH:MM:SS" (UTC) — normalize to ISO
  if (typeof raw === "string" && !raw.includes("T")) return raw.replace(" ", "T") + "Z";
  return raw;
};
const msgIsOut = (m: any, myExt: string) => {
  const dir = (m.direction ?? "").toLowerCase();
  // NS-API: "orig" = originating (outbound from user), "term" = terminating (inbound to user)
  if (dir === "outbound" || dir === "out" || dir === "sent" || dir === "orig") return true;
  if (dir === "inbound" || dir === "in" || dir === "received" || dir === "term") return false;
  const from = m.from ?? m.source ?? m["from-user-id"] ?? m["from-number"] ?? "";
  const fromStr = String(from);
  return fromStr === myExt || fromStr.startsWith(`${myExt}@`);
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
            const preview = (th as any).last_message ?? (th as any).preview ?? (th as any)["messagesession-last-message"] ?? (th as any).last_message_text ?? (th as any).body ?? (th as any).message ?? (th as any).snippet ?? "";
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
// EMAILS TAB (M365)
// ============================================================
function EmailsList({ profile }: { profile: any }) {
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
type Teams365SubTab = "active" | "new" | "teams";

const TEAMS_READS_KEY = "planipret.teams365.lastReads.v1";
function loadTeamsReads(): Record<string, string> {
  try { return JSON.parse(localStorage.getItem(TEAMS_READS_KEY) || "{}") || {}; } catch { return {}; }
}
function saveTeamsReads(map: Record<string, string>) {
  try { localStorage.setItem(TEAMS_READS_KEY, JSON.stringify(map)); } catch { /* ignore */ }
}
function markChatRead(chatId: string) {
  const map = loadTeamsReads();
  map[chatId] = new Date().toISOString();
  saveTeamsReads(map);
}
function isChatUnread(chat: any, reads: Record<string, string>): boolean {
  if (!chat?.lastUpdated) return false;
  const last = reads[chat.id];
  if (!last) return true;
  return new Date(chat.lastUpdated).getTime() > new Date(last).getTime();
}

function Teams365Panel({ profile }: { profile: any }) {
  const [innerTab, setInnerTab] = useState<Teams365SubTab>("active");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [diag, setDiag] = useState<any>({});
  const [chats, setChats] = useState<any[]>([]);
  const [teams, setTeams] = useState<any[]>([]);
  const [people, setPeople] = useState<any[]>([]);
  const [reads, setReads] = useState<Record<string, string>>(() => loadTeamsReads());
  const [search, setSearch] = useState("");
  const [chatSearch, setChatSearch] = useState("");
  const [groupMode, setGroupMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [groupTopic, setGroupTopic] = useState("");
  const [creating, setCreating] = useState(false);
  const prevUnreadIds = useRef<Set<string>>(new Set());
  const [active, setActive] = useState<
    | { kind: "chat"; id: string; title: string }
    | { kind: "channel"; teamId: string; channelId: string; title: string }
    | null
  >(null);

  const connected = !!profile?.ms365_access_token;

  const load = async () => {
    if (!connected) { setLoading(false); setErr("ms365_not_connected"); return; }
    setLoading(true); setErr(null);
    const { data, error } = await supabase.functions.invoke("ms365-teams-list", { body: {} });
    setLoading(false);
    const payload = (data as any) ?? {};
    if (error && !payload.chats) { setErr(error.message || "Erreur"); return; }
    if (payload.connected === false || payload.error === "ms365_not_connected") { setErr("ms365_not_connected"); return; }
    if (payload.error) { setErr(payload.error); return; }
    const nextChats = payload.chats || [];
    // Notify on new unread chats appearing since last load
    const currentReads = loadTeamsReads();
    const nowUnread = new Set<string>(nextChats.filter((c: any) => isChatUnread(c, currentReads)).map((c: any) => c.id));
    const newly: any[] = [];
    for (const c of nextChats) {
      if (nowUnread.has(c.id) && !prevUnreadIds.current.has(c.id)) newly.push(c);
    }
    if (prevUnreadIds.current.size > 0 && newly.length > 0) {
      const first = newly[0];
      toast.message(`Nouveau message · ${first.topic}`, {
        description: first.previewFrom ? `${first.previewFrom}: ${(first.preview || "").replace(/<[^>]*>/g, "").slice(0, 80)}` : undefined,
      });
    }
    prevUnreadIds.current = nowUnread;
    setChats(nextChats);
    setTeams(payload.teams || []);
    setPeople(payload.people || []);
    setDiag(payload.diagnostics || {});
    setReads(currentReads);
  };
  useEffect(() => {
    load(); /* eslint-disable-next-line */
    if (!connected) return;
    const id = window.setInterval(() => { load(); }, 30_000);
    return () => window.clearInterval(id);
  }, [connected]);

  const startChatWith = async (userIds: string[], title: string, topicText?: string) => {
    setCreating(true);
    const { data, error } = await supabase.functions.invoke("ms365-teams-messages", {
      body: { action: "create_chat", user_ids: userIds, ...(topicText ? { topic: topicText } : {}) },
    });
    setCreating(false);
    const p: any = data ?? {};
    if (error || p?.error) { toast.error(p?.error || error?.message || "Impossible de créer le chat"); return; }
    openThread({ kind: "chat", id: p.chat_id, title });
    setGroupMode(false); setSelectedIds(new Set()); setGroupTopic("");
    load();
  };

  const openThread = (t: NonNullable<typeof active>) => {
    if (t.kind === "chat") { markChatRead(t.id); setReads(loadTeamsReads()); }
    setActive(t);
  };

  const presenceColor = (a?: string) =>
    a === "Available" ? "#22c55e" :
    a === "Busy" || a === "DoNotDisturb" ? "#ef4444" :
    a === "Away" || a === "BeRightBack" ? "#f59e0b" :
    "#6b7280";

  if (active) return <TeamsThreadView target={active} onClose={() => { setActive(null); load(); }} />;

  const filteredPeople = people.filter((p) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (p.name || "").toLowerCase().includes(q) || (p.email || "").toLowerCase().includes(q);
  });
  const filteredChats = chats.filter((c) => {
    const q = chatSearch.trim().toLowerCase();
    if (!q) return true;
    return (c.topic || "").toLowerCase().includes(q);
  });
  const unreadCount = chats.filter((c) => isChatUnread(c, reads)).length;

  const tabs: { k: Teams365SubTab; label: string; badge?: number }[] = [
    { k: "active", label: "Discussions actives", badge: unreadCount },
    { k: "new", label: "Nouveau", badge: 0 },
    { k: "teams", label: "Équipes", badge: 0 },
  ];

  return (
    <div className="h-full overflow-y-auto px-4 py-3 space-y-3">
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
            Connectez votre compte Microsoft pour voir vos discussions Teams et coéquipiers.
          </p>
          <a href="/mplanipret/more" className="inline-block text-xs px-4 py-2 rounded-full text-white font-semibold"
            style={{ background: "linear-gradient(135deg, var(--pp-brand-accent), var(--pp-brand-accent-2))" }}>
            Connecter Microsoft 365
          </a>
        </div>
      )}
      {err && err !== "ms365_not_connected" && (
        <div className="text-xs p-3 rounded-lg" style={{ background: "rgba(220,38,38,0.08)", color: "#dc2626" }}>{err}</div>
      )}

      {!err && (
        <>
          {/* Inner tabs */}
          <div className="flex gap-1.5 overflow-x-auto no-scrollbar" style={{ scrollbarWidth: "none" }}>
            {tabs.map((t) => {
              const isActive = innerTab === t.k;
              return (
                <button key={t.k} onClick={() => setInnerTab(t.k)}
                  className="shrink-0 px-3 py-1.5 text-xs font-semibold rounded-full flex items-center gap-1.5"
                  style={isActive
                    ? { background: "linear-gradient(135deg, var(--pp-brand-accent), var(--pp-brand-accent-2))", color: "white" }
                    : { background: "var(--pp-bg-elevated)", color: "var(--pp-text-secondary)", border: "1px solid var(--pp-bg-border-2)" }}>
                  {t.label}
                  {!!t.badge && (
                    <span className="min-w-[16px] h-4 px-1 rounded-full text-[10px] font-bold flex items-center justify-center"
                      style={{ background: isActive ? "rgba(255,255,255,0.25)" : "#ef4444", color: "white" }}>
                      {t.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Active discussions tab */}
          {innerTab === "active" && (
            <div className="space-y-2">
              <input value={chatSearch} onChange={(e) => setChatSearch(e.target.value)} placeholder="Rechercher une discussion…"
                className="w-full text-xs px-3 py-2 rounded-lg outline-none"
                style={{ background: "var(--pp-bg-elevated)", color: "var(--pp-text-primary)", border: "1px solid var(--pp-bg-border-2)" }} />
              {loading && !chats.length ? (
                <div className="text-xs" style={{ color: "var(--pp-text-muted)" }}>Chargement…</div>
              ) : filteredChats.length === 0 ? (
                <div className="rounded-xl p-6 text-center" style={{ background: "var(--pp-bg-surface)", border: "1px solid var(--pp-bg-border-2)" }}>
                  <MessageSquare className="w-8 h-8 mx-auto mb-2" style={{ color: "var(--pp-text-muted)" }} />
                  <p className="text-xs" style={{ color: "var(--pp-text-muted)" }}>Aucune discussion active. Ouvrez l'onglet « Nouveau » pour démarrer.</p>
                </div>
              ) : (
                <div className="space-y-1">
                  {filteredChats.map((c) => {
                    const unread = isChatUnread(c, reads);
                    return (
                      <button key={c.id} onClick={() => openThread({ kind: "chat", id: c.id, title: c.topic })}
                        className="w-full text-left px-3 py-2.5 rounded-lg flex items-center gap-3"
                        style={{ background: "var(--pp-bg-elevated)", border: `1px solid ${unread ? "var(--pp-brand-accent)" : "var(--pp-bg-border)"}` }}>
                        <div className="w-10 h-10 rounded-full flex items-center justify-center text-white text-xs font-semibold shrink-0"
                          style={{ background: "linear-gradient(135deg, var(--pp-brand-accent), var(--pp-brand-accent-2))" }}>
                          {initials(c.topic || "?")}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <div className="text-sm truncate" style={{ color: "var(--pp-text-primary)", fontWeight: unread ? 700 : 500 }}>{c.topic}</div>
                            {c.lastUpdated && (
                              <div className="text-[10px] shrink-0" style={{ color: "var(--pp-text-muted)" }}>{fmtTime(c.lastUpdated)}</div>
                            )}
                          </div>
                          {c.preview && (
                            <div className="text-[11px] truncate" style={{ color: unread ? "var(--pp-text-primary)" : "var(--pp-text-muted)" }}>
                              {c.previewFrom ? `${c.previewFrom}: ` : ""}{String(c.preview).replace(/<[^>]*>/g, "").slice(0, 100)}
                            </div>
                          )}
                        </div>
                        {unread && <span className="w-2 h-2 rounded-full shrink-0" style={{ background: "#ef4444" }} />}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* New chat tab */}
          {innerTab === "new" && (
            <div className="space-y-2">
              <div className="flex justify-end">
                <button onClick={() => { setGroupMode((v) => !v); setSelectedIds(new Set()); }}
                  className="text-xs px-2.5 py-1 rounded-full flex items-center gap-1 text-white"
                  style={{ background: groupMode ? "var(--pp-danger)" : "linear-gradient(135deg, var(--pp-brand-accent), var(--pp-brand-accent-2))" }}>
                  {groupMode ? <><X className="w-3 h-3" /> Annuler groupe</> : <><Plus className="w-3 h-3" /> Chat de groupe</>}
                </button>
              </div>
              {groupMode && (
                <div className="rounded-lg p-3 space-y-2" style={{ background: "var(--pp-bg-surface)", border: "1px solid var(--pp-brand-accent)" }}>
                  <div className="text-xs font-semibold" style={{ color: "var(--pp-text-primary)" }}>
                    Nouveau chat de groupe · {selectedIds.size} sélectionné(s)
                  </div>
                  <input value={groupTopic} onChange={(e) => setGroupTopic(e.target.value)}
                    placeholder="Nom du groupe (optionnel si 1:1)"
                    className="w-full text-xs px-3 py-2 rounded-lg outline-none"
                    style={{ background: "var(--pp-bg-elevated)", color: "var(--pp-text-primary)", border: "1px solid var(--pp-bg-border-2)" }} />
                  <button
                    disabled={selectedIds.size === 0 || creating}
                    onClick={() => {
                      const ids = Array.from(selectedIds);
                      const title = groupTopic || people.filter((p) => selectedIds.has(p.id)).map((p) => p.name).join(", ");
                      startChatWith(ids, title, ids.length > 1 ? (groupTopic || undefined) : undefined);
                    }}
                    className="w-full text-xs py-2 rounded-lg text-white font-semibold disabled:opacity-50"
                    style={{ background: "linear-gradient(135deg, var(--pp-brand-accent), var(--pp-brand-accent-2))" }}>
                    {creating ? "Création…" : "Créer le chat"}
                  </button>
                </div>
              )}
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher un coéquipier…"
                className="w-full text-xs px-3 py-2 rounded-lg outline-none"
                style={{ background: "var(--pp-bg-elevated)", color: "var(--pp-text-primary)", border: "1px solid var(--pp-bg-border-2)" }} />
              {loading && !people.length ? (
                <div className="text-xs" style={{ color: "var(--pp-text-muted)" }}>Chargement…</div>
              ) : filteredPeople.length === 0 ? (
                <div className="text-xs" style={{ color: "var(--pp-text-muted)" }}>Aucun coéquipier trouvé.</div>
              ) : (
                <div className="space-y-1">
                  {filteredPeople.map((p) => {
                    const selected = selectedIds.has(p.id);
                    return (
                      <button key={p.id}
                        onClick={() => {
                          if (groupMode) {
                            setSelectedIds((prev) => { const n = new Set(prev); n.has(p.id) ? n.delete(p.id) : n.add(p.id); return n; });
                          } else {
                            startChatWith([p.id], p.name);
                          }
                        }}
                        className="w-full text-left px-3 py-2 rounded-lg flex items-center gap-2"
                        style={{ background: selected ? "rgba(46,155,220,0.12)" : "var(--pp-bg-elevated)", border: `1px solid ${selected ? "var(--pp-brand-accent)" : "var(--pp-bg-border)"}` }}>
                        <div className="relative">
                          <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-semibold"
                            style={{ background: "linear-gradient(135deg, var(--pp-brand-accent), var(--pp-brand-accent-2))" }}>
                            {initials(p.name || p.email || "?")}
                          </div>
                          <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2"
                            style={{ background: presenceColor(p.presence?.availability), borderColor: "var(--pp-bg-elevated)" }} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium truncate" style={{ color: "var(--pp-text-primary)" }}>{p.name}</div>
                          <div className="text-[10px] truncate" style={{ color: "var(--pp-text-muted)" }}>
                            {p.presence?.availability || "—"} {p.title ? `· ${p.title}` : ""}
                          </div>
                        </div>
                        {groupMode ? (
                          <div className="w-4 h-4 rounded border flex items-center justify-center"
                            style={{ borderColor: "var(--pp-brand-accent)", background: selected ? "var(--pp-brand-accent)" : "transparent" }}>
                            {selected && <CheckCircle2 className="w-3 h-3 text-white" />}
                          </div>
                        ) : (
                          <MessageSquare className="w-4 h-4" style={{ color: "var(--pp-text-muted)" }} />
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Teams & channels */}
          {innerTab === "teams" && (
            <div>
              <div className="text-[10px] uppercase tracking-wider mb-2 flex items-center justify-between" style={{ color: "var(--pp-text-muted)" }}>
                <span>Équipes & canaux ({teams.length})</span>
                {diag.teams_error && <span style={{ color: "#dc2626" }}>Err: {String(diag.teams_error).slice(0, 40)}</span>}
              </div>
              {teams.length === 0 ? (
                <div className="text-xs" style={{ color: "var(--pp-text-muted)" }}>Aucune équipe.</div>
              ) : (
                <div className="space-y-2">
                  {teams.map((tm) => (
                    <div key={tm.id} className="rounded-lg p-2" style={{ background: "var(--pp-bg-elevated)", border: "1px solid var(--pp-bg-border)" }}>
                      <div className="text-xs font-semibold mb-1" style={{ color: "var(--pp-text-primary)" }}>{tm.displayName}</div>
                      <div className="flex flex-wrap gap-1">
                        {tm.channels.map((ch: any) => (
                          <button key={ch.id}
                            onClick={() => openThread({ kind: "channel", teamId: tm.id, channelId: ch.id, title: `${tm.displayName} · ${ch.displayName}` })}
                            className="text-[11px] px-2 py-1 rounded-full"
                            style={{ background: "var(--pp-bg-deep)", color: "var(--pp-text-primary)" }}>
                            #{ch.displayName}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
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
  const [meId, setMeId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [pendingAtts, setPendingAtts] = useState<any[]>([]);
  const [sendStatus, setSendStatus] = useState<null | { kind: "ok" | "err"; message: string; lastText?: string }>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const invokeBody = target.kind === "chat"
    ? { chat_id: target.id }
    : { team_id: target.teamId, channel_id: target.channelId };

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.functions.invoke("ms365-teams-messages", {
      body: { action: "list", ...invokeBody, top: 50 },
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
    setMeId(payload.me_id ?? null);
    setMessages(((payload.messages) || []).slice().reverse());
    setTimeout(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }); }, 50);
  };
  useEffect(() => {
    load();
    if (target.kind === "chat") markChatRead(target.id);
    const id = window.setInterval(() => load(), 15_000);
    return () => window.clearInterval(id);
    /* eslint-disable-next-line */
  }, []);

  const onPickFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        if (file.size > 15 * 1024 * 1024) { toast.error(`${file.name}: trop volumineux (max 15 Mo)`); continue; }
        const buf = await file.arrayBuffer();
        const bytes = new Uint8Array(buf);
        let binary = ""; for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
        const b64 = btoa(binary);
        const { data, error } = await supabase.functions.invoke("ms365-teams-messages", {
          body: { action: "upload_attachment", filename: file.name, mimeType: file.type, contentBase64: b64 },
        });
        const payload: any = data ?? {};
        if (error || payload?.error) { toast.error(`${file.name}: ${payload?.error || error?.message || "échec"}`); continue; }
        if (payload.attachment) setPendingAtts((prev) => [...prev, payload.attachment]);
      }
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const doSend = async (content: string, atts: any[]) => {
    setSending(true);
    setSendStatus(null);
    const { data, error } = await supabase.functions.invoke("ms365-teams-messages", {
      body: { action: "send", ...invokeBody, content, contentType: "text", attachments: atts },
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
    setPendingAtts([]);
    load();
    setTimeout(() => setSendStatus((s) => (s?.kind === "ok" ? null : s)), 2000);
  };

  const send = () => {
    if ((!text.trim() && pendingAtts.length === 0) || sending) return;
    doSend(text.trim(), pendingAtts);
  };

  const retry = () => {
    if (!sendStatus?.lastText || sending) return;
    doSend(sendStatus.lastText, []);
  };

  const removePending = (id: string) => setPendingAtts((prev) => prev.filter((a) => a.id !== id));

  return (
    <div className="h-full flex flex-col" style={{ background: "var(--pp-bg-base)" }}>
      <div className="px-4 py-3 flex items-center gap-2" style={{ borderBottom: "1px solid var(--pp-bg-border)", background: "var(--pp-bg-deep)" }}>
        <button onClick={onClose} className="p-1"><ArrowLeft className="w-4 h-4" style={{ color: "var(--pp-text-primary)" }} /></button>
        <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-semibold"
          style={{ background: "linear-gradient(135deg, var(--pp-brand-accent), var(--pp-brand-accent-2))" }}>
          {initials(target.title || "?")}
        </div>
        <div className="flex-1 text-sm font-semibold truncate" style={{ color: "var(--pp-text-primary)" }}>{target.title}</div>
        <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: "var(--pp-bg-elevated)", color: "var(--pp-text-muted)" }}>
          {target.kind === "chat" ? "Chat" : "Canal"}
        </span>
      </div>
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-2">
        {loading && messages.length === 0 ? <div className="text-xs" style={{ color: "var(--pp-text-muted)" }}>Chargement…</div> :
          messages.length === 0 ? <div className="text-xs text-center py-8" style={{ color: "var(--pp-text-muted)" }}>Aucun message. Envoyez le premier !</div> :
          messages.map((m) => {
            const own = !!m.isMe || (meId && m.fromId === meId);
            return (
              <div key={m.id} className={`flex items-end gap-2 ${own ? "flex-row-reverse" : ""}`}>
                {!own && (
                  <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[10px] font-semibold shrink-0"
                    style={{ background: "linear-gradient(135deg, #6366f1, #8b5cf6)" }}>
                    {initials(m.from || "?")}
                  </div>
                )}
                <div className={`max-w-[78%] rounded-2xl px-3 py-2 ${own ? "rounded-br-sm" : "rounded-bl-sm"}`}
                  style={{
                    background: own ? "linear-gradient(135deg, var(--pp-brand-accent), var(--pp-brand-accent-2))" : "var(--pp-bg-elevated)",
                    color: own ? "white" : "var(--pp-text-primary)",
                  }}>
                  {!own && (
                    <div className="text-[10px] mb-0.5 font-semibold" style={{ color: "var(--pp-brand-accent)" }}>{m.from}</div>
                  )}
                  {m.content && (
                    <div className="text-sm break-words" dangerouslySetInnerHTML={{ __html: m.content }} />
                  )}
                  {(m.attachments || []).length > 0 && (
                    <div className="mt-1.5 space-y-1">
                      {m.attachments.map((a: any) => (
                        <a key={a.id} href={a.contentUrl} target="_blank" rel="noopener noreferrer"
                          className="flex items-center gap-1.5 text-[11px] px-2 py-1 rounded-lg"
                          style={{ background: own ? "rgba(255,255,255,0.2)" : "var(--pp-bg-deep)", color: own ? "white" : "var(--pp-text-primary)" }}>
                          <Paperclip className="w-3 h-3" />
                          <span className="truncate">{a.name || "Fichier"}</span>
                        </a>
                      ))}
                    </div>
                  )}
                  <div className="text-[9px] mt-1 opacity-70">{fmtTime(m.createdAt)}</div>
                </div>
              </div>
            );
          })
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
      {pendingAtts.length > 0 && (
        <div className="px-3 py-2 flex flex-wrap gap-1.5" style={{ borderTop: "1px solid var(--pp-bg-border)", background: "var(--pp-bg-deep)" }}>
          {pendingAtts.map((a) => (
            <span key={a.id} className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-full"
              style={{ background: "var(--pp-bg-elevated)", color: "var(--pp-text-primary)" }}>
              <Paperclip className="w-3 h-3" />
              <span className="max-w-[140px] truncate">{a.name}</span>
              <button onClick={() => removePending(a.id)}><X className="w-3 h-3" /></button>
            </span>
          ))}
        </div>
      )}
      <div className="px-3 py-2 flex items-center gap-2" style={{ borderTop: "1px solid var(--pp-bg-border)", background: "var(--pp-bg-deep)" }}>
        <input ref={fileRef} type="file" multiple className="hidden" onChange={(e) => onPickFiles(e.target.files)} />
        <button onClick={() => fileRef.current?.click()} disabled={uploading} className="p-2 rounded-full"
          style={{ background: "var(--pp-bg-elevated)", color: "var(--pp-text-muted)", opacity: uploading ? 0.5 : 1 }}>
          {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Paperclip className="w-4 h-4" />}
        </button>
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
          disabled={sending || (!text.trim() && pendingAtts.length === 0)}
          className="p-2 rounded-full"
          style={{ background: "linear-gradient(135deg, var(--pp-brand-accent), var(--pp-brand-accent-2))", color: "white", opacity: sending || (!text.trim() && pendingAtts.length === 0) ? 0.5 : 1 }}
        >
          {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );
}

