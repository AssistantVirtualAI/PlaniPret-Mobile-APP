// AvaVoiceAgent — full ElevenLabs Conversational AI overlay for AVA Planiprêt.
// Replaces the legacy VoiceAgent.tsx with rich state visualization, live
// transcript, tool execution notifications and confirmation modal.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Conversation } from "@elevenlabs/client";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { X, Mic, Send, Settings, AlertTriangle, Sparkles, PhoneOutgoing, MessageSquare, Search, Calendar, Mail, Bot, Map } from "lucide-react";
import avaLogo from "@/assets/ava-statistics-logo.png.asset.json";
import AvaOrb, { useAnalyserLevel } from "@/components/planipret/mobile/AvaOrb";

type AgentState = "idle" | "connecting" | "listening" | "speaking" | "processing" | "tool_running" | "error";
type AutonomyMode = "confirm" | "semi_auto" | "full_auto";

interface Props { onClose: () => void; userId: string; onFallbackToChat?: () => void; }

interface TranscriptEntry { id: string; role: "user" | "agent" | "tool" | "nav"; text: string; toolIcon?: string; }
interface PendingTool { tool: string; params: any; resolve: (v: any) => void; reject: (e: any) => void; }

const STATE_LABEL: Record<AgentState, string> = {
  idle: "Appuyez pour parler",
  connecting: "Connexion...",
  listening: "Je vous écoute...",
  speaking: "AVA parle...",
  processing: "Traitement...",
  tool_running: "Exécution...",
  error: "Erreur de connexion",
};

// Retry any async op with exponential backoff. Returns the value or throws the
// last error after `attempts` tries. Used to smooth over transient
// ElevenLabs / edge-function hiccups before falling back to text chat.
async function withBackoff<T>(fn: () => Promise<T>, attempts = 3, baseMs = 400): Promise<T> {
  let lastErr: any;
  for (let i = 0; i < attempts; i++) {
    try { return await fn(); }
    catch (e) {
      lastErr = e;
      if (i === attempts - 1) break;
      await new Promise((r) => setTimeout(r, baseMs * Math.pow(2, i)));
    }
  }
  throw lastErr;
}


const TOOL_ICONS: Record<string, any> = {
  make_call: PhoneOutgoing, send_sms: MessageSquare, send_email: Mail,
  search_client: Search, create_task: Sparkles, create_appointment: Calendar,
  navigate_to: Map, read_emails: Mail, get_unread_emails: Mail, get_recent_emails: Mail,
  summarize_email: Mail, analyze_call: Bot,
  create_calendar_event: Calendar, move_calendar_event: Calendar, cancel_calendar_event: Calendar,
  get_upcoming_meetings: Calendar,
};

const TOOL_LABELS: Record<string, string> = {
  make_call: "Lancement d'un appel",
  send_sms: "Envoi d'un SMS",
  send_email: "Envoi d'un courriel",
  summarize_email: "Résumé du courriel",
  read_emails: "Lecture des courriels",
  get_unread_emails: "Courriels non lus",
  get_recent_emails: "Derniers courriels",
  create_task: "Création d'une tâche Maestro",
  create_appointment: "Création d'un RDV",
  create_calendar_event: "Création d'un meeting",
  move_calendar_event: "Déplacement du meeting",
  cancel_calendar_event: "Annulation du meeting",
  get_upcoming_meetings: "Meetings à venir",
  generate_voicemail_greeting: "Génération de boîte vocale",
};

const CONFIRM_REQUIRED = new Set([
  "make_call", "send_sms", "send_email",
  "create_task", "create_appointment", "generate_voicemail_greeting",
  "update_client",
  "create_calendar_event", "move_calendar_event", "cancel_calendar_event",
]);

export default function AvaVoiceAgent({ onClose, userId, onFallbackToChat }: Props) {
  const navigate = useNavigate();
  const [state, setState] = useState<AgentState>("idle");
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [toolNotif, setToolNotif] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingTool | null>(null);
  const [textInput, setTextInput] = useState("");
  const [micError, setMicError] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [autonomy, setAutonomy] = useState<AutonomyMode>("confirm");
  const [currentTool, setCurrentTool] = useState<string | null>(null);
  const convRef = useRef<any>(null);
  const sessionIdRef = useRef<string>(`s_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`);
  const scrollRef = useRef<HTMLDivElement>(null);
  const startTimeRef = useRef<number>(Date.now());
  const micStreamRef = useRef<MediaStream | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const [micLevels, setMicLevels] = useState<number[]>(Array.from({ length: 7 }, () => 20));


  const sessionId = sessionIdRef.current;

  const appendTranscript = (entry: Omit<TranscriptEntry, "id">) =>
    setTranscript((p) => [...p.slice(-30), { ...entry, id: `${Date.now()}-${Math.random()}` }]);

  const showToolNotif = (msg: string) => {
    setToolNotif(msg);
    setTimeout(() => setToolNotif(null), 3000);
  };

  const callServerTool = useCallback(async (toolName: string, params: any) => {
    setState("tool_running");
    setCurrentTool(toolName);
    showToolNotif(`${TOOL_LABELS[toolName] ?? toolName}...`);
    appendTranscript({ role: "tool", text: TOOL_LABELS[toolName] ?? toolName });
    const { data, error } = await supabase.functions.invoke("ava-tool-executor", {
      body: { tool_name: toolName, parameters: params, session_id: sessionId },
    });
    setState("listening");
    setCurrentTool(null);
    if (error || !(data as any)?.success) {
      const msg = (data as any)?.error ?? error?.message ?? "Erreur";
      toast.error("❌ " + msg);
      return { success: false, error: msg };
    }
    const d = data as any;
    if (d?.message) showToolNotif("✅ " + d.message);
    if (toolName === "navigate_to") {
      appendTranscript({ role: "nav", text: `🗺️ ${d.message ?? "Navigation"}` });
    }
    return d;
  }, [sessionId]);

  // Client-only tools execute in the browser (no server round-trip).
  const CLIENT_ONLY: Record<string, (p: any) => any> = useMemo(() => ({
    navigate_to: ({ path }: { path?: string }) => {
      if (!path) return { success: false, error: "no_path" };
      const p = path.startsWith("/") ? path : `/mplanipret/${path.replace(/^\/+/, "")}`;
      appendTranscript({ role: "nav", text: `🗺️ ${p}` });
      navigate(p);
      return { success: true, path: p };
    },
    show_toast: ({ message, level }: { message?: string; level?: "info" | "success" | "error" }) => {
      const m = String(message ?? "");
      if (level === "success") toast.success(m);
      else if (level === "error") toast.error(m);
      else toast(m);
      return { success: true };
    },
    open_dialer: ({ number }: { number?: string }) => {
      if (!number) return { success: false, error: "no_number" };
      navigate(`/mplanipret/calls?dial=${encodeURIComponent(number)}`);
      return { success: true };
    },
    open_sms_composer: ({ number, body }: { number?: string; body?: string }) => {
      const q = new URLSearchParams();
      if (number) q.set("to", number);
      if (body) q.set("body", body);
      navigate(`/mplanipret/messages?${q.toString()}`);
      return { success: true };
    },
    show_client_in_app: ({ client_id }: { client_id?: string }) => {
      if (!client_id) return { success: false, error: "no_client_id" };
      navigate(`/mplanipret/contacts?id=${encodeURIComponent(client_id)}`);
      return { success: true };
    },
    open_call_detail: ({ call_id }: { call_id?: string }) => {
      if (!call_id) return { success: false, error: "no_call_id" };
      navigate(`/mplanipret/calls?id=${encodeURIComponent(call_id)}`);
      return { success: true };
    },
    close_ava: () => { onClose(); return { success: true }; },
  }), [navigate, onClose]);

  const handleTool = useCallback(async (toolName: string, params: any) => {
    // Route client-only tools locally (no confirm gate, no server call).
    if (CLIENT_ONLY[toolName]) {
      showToolNotif(TOOL_LABELS[toolName] ?? toolName);
      return CLIENT_ONLY[toolName](params ?? {});
    }
    // Confirmation gate for mutating server tools.
    if (autonomy === "confirm" && CONFIRM_REQUIRED.has(toolName)) {
      return new Promise((resolve, reject) => {
        setPending({ tool: toolName, params, resolve, reject });
      }).then((r: any) => r ?? { success: false, error: "user_cancelled" });
    }
    return callServerTool(toolName, params);
  }, [autonomy, callServerTool, CLIENT_ONLY]);

  // Build clientTools map dynamically (server + client-side tools)
  const clientTools = useMemo(() => {
    const TOOL_NAMES = [
      "make_call", "get_active_calls", "hangup_call", "get_call_history",
      "get_recording", "get_transcript", "send_sms", "get_sms_conversations",
      "get_voicemails", "generate_voicemail_greeting",
      "analyze_call", "get_hot_leads", "get_coaching_summary",
      "search_client", "get_client_profile", "get_client_history",
      "create_task", "create_appointment", "get_pending_tasks",
      "get_upcoming_appointments", "update_client", "create_client",
      "read_emails", "summarize_email", "send_email",
      "get_calendar_today", "get_calendar_week",
      "create_calendar_event", "move_calendar_event", "cancel_calendar_event",
      "navigate_to", "show_client_in_app", "open_call_detail",
      "show_toast", "open_dialer", "open_sms_composer", "close_ava",
      "get_daily_briefing", "get_my_stats",
      "explain_feature", "get_integration_status",
    ];
    const map: Record<string, (p: any) => Promise<any>> = {};
    for (const t of TOOL_NAMES) map[t] = (p: any) => Promise.resolve(handleTool(t, p));
    return map;
  }, [handleTool]);

  // Initialization
  const [initAttempt, setInitAttempt] = useState(0);
  const sessionRowIdRef = useRef<string | null>(null);
  const connectedAtRef = useRef<number>(0);

  const logSession = useCallback(async (patch: {
    connection_type?: string; agent_id?: string;
    disconnect_reason?: string; error_code?: string; error_message?: string;
    ended?: boolean;
  }) => {
    try {
      if (!sessionRowIdRef.current) {
        const { data } = await supabase.from("planipret_ava_sessions").insert({
          user_id: userId,
          session_id: sessionId,
          connection_type: patch.connection_type ?? "websocket",
          agent_id: patch.agent_id ?? null,
        }).select("id").single();
        if (data?.id) sessionRowIdRef.current = data.id;
      }
      if (patch.ended || patch.disconnect_reason || patch.error_code) {
        const durationMs = connectedAtRef.current ? Date.now() - connectedAtRef.current : null;
        await supabase.from("planipret_ava_sessions").update({
          ended_at: new Date().toISOString(),
          duration_ms: durationMs,
          disconnect_reason: patch.disconnect_reason ?? null,
          error_code: patch.error_code ?? null,
          error_message: patch.error_message ?? null,
        }).eq("id", sessionRowIdRef.current!);
      }
    } catch (e) { console.warn("logSession failed", e); }
  }, [sessionId, userId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setState("connecting");
        if (!micStreamRef.current) {
          try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            micStreamRef.current = stream;
            const Ctx = (window.AudioContext || (window as any).webkitAudioContext);
            if (Ctx) {
              const ac = new Ctx();
              audioCtxRef.current = ac;
              const src = ac.createMediaStreamSource(stream);
              const analyser = ac.createAnalyser();
              analyser.fftSize = 64;
              src.connect(analyser);
              analyserRef.current = analyser;
            }
          }
          catch { setMicError(true); setState("error"); return; }
        }

        // Fallback: only after 2 failed attempts do we switch to text chat
        // automatically. First failure surfaces the error + Retry button.
        const isRetry = initAttempt > 0;
        const fallback = (msg: string, code?: string) => {
          logSession({ error_code: code ?? "init_failed", error_message: msg, ended: true });
          if (isRetry && onFallbackToChat) {
            toast.message(msg);
            onFallbackToChat();
          } else {
            toast.error(msg);
            setState("error");
          }
        };

        // 1) Fetch agent config with retry/backoff.
        let cfg: any;
        try {
          cfg = await withBackoff(async () => {
            const { data, error } = await supabase.functions.invoke("ava-agent-config", { body: {} });
            if (error || !(data as any)?.success) throw new Error((data as any)?.error ?? error?.message ?? "ava-agent-config failed");
            return data;
          }, 3, 400);
        } catch (e: any) {
          fallback("AVA vocal indisponible", "config_failed");
          return;
        }
        if (cancelled) return;

        const c = cfg;
        setAutonomy(c.autonomy_mode ?? "confirm");

        if (!c.agent_id) {
          fallback("Agent vocal non provisionné", "no_agent");
          return;
        }

        // 2) Try WebRTC first, then WebSocket. Signed URLs are single-use so
        //    we mint each transport lazily and never reuse an old one.
        const mintToken = async (kind: "webrtc" | "websocket") => {
          const { data, error } = await supabase.functions.invoke("pp-ava-webrtc-token", { body: { type: kind } });
          let d: any = data;
          if (error) {
            try {
              const ctx = (error as any)?.context;
              if (ctx && typeof ctx.text === "function") {
                const txt = await ctx.text();
                try { d = JSON.parse(txt); } catch { d = { error: txt }; }
              }
            } catch { /* ignore */ }
            const code = d?.error ?? error.message ?? "mint_failed";
            const err: any = new Error(code); err.code = code; throw err;
          }
          if (kind === "webrtc" && !d?.token) { const err: any = new Error(d?.error ?? "no_token"); err.code = d?.error ?? "no_token"; throw err; }
          if (kind === "websocket" && !d?.signed_url) { const err: any = new Error(d?.error ?? "no_signed_url"); err.code = d?.error ?? "no_signed_url"; throw err; }
          return d;
        };

        // Build overrides only for the fields the agent actually allows.
        const oa = c.overrides_allowed ?? { prompt: false, first_message: false, language: false, voice: false };
        const overrides: any = { agent: {}, tts: {} };
        if (oa.prompt) overrides.agent.prompt = { prompt: c.system_prompt };
        if (oa.first_message) overrides.agent.firstMessage = c.first_message;
        if (oa.language) overrides.agent.language = c.language ?? "fr";
        if (oa.voice) {
          overrides.tts.voiceId = c.voice_id;
          if (c.voice_settings) {
            overrides.tts.stability = c.voice_settings.stability;
            overrides.tts.similarityBoost = c.voice_settings.similarity_boost;
            overrides.tts.style = c.voice_settings.style;
          }
        }
        const hasOverrides = Object.keys(overrides.agent).length > 0 || Object.keys(overrides.tts).length > 0;

        const commonOptions: any = {
          clientTools,
          onConnect: () => {
            connectedAtRef.current = Date.now();
            setState("listening");
          },
          onDisconnect: (info: any) => {
            const dur = connectedAtRef.current ? Date.now() - connectedAtRef.current : 0;
            const reason = info?.reason ?? info?.code ?? "closed";
            // Premature disconnect (< 2s after connect) = likely overrides
            // or agent config problem. Log and let user retry.
            if (connectedAtRef.current && dur < 2000) {
              logSession({ disconnect_reason: `premature_${reason}`, ended: true });
              setState("error");
              return;
            }
            logSession({ disconnect_reason: reason, ended: true });
            setState("idle");
          },
          onError: (err: any) => {
            console.error("AVA error", err);
            logSession({ error_code: "runtime", error_message: String(err?.message ?? err ?? "unknown") });
            setState("error");
          },
          onModeChange: (m: any) => {
            const mode = m?.mode ?? m;
            if (mode === "speaking") setState("speaking");
            else if (mode === "listening") setState("listening");
            else if (mode === "thinking" || mode === "processing") setState("processing");
          },
          onMessage: (msg: any) => {
            const source = msg?.source ?? msg?.role;
            const text = msg?.message ?? msg?.text;
            if (!text) return;
            appendTranscript({ role: source === "user" ? "user" : "agent", text });
            supabase.from("planipret_ava_conversations").insert({
              user_id: userId,
              role: source === "user" ? "user" : "assistant",
              message: text,
              session_id: sessionId,
            }).then(() => null);
          },
        };
        if (hasOverrides) commonOptions.overrides = overrides;

        let conv: any = null;
        let usedTransport: "webrtc" | "websocket" = "webrtc";

        // Try WebRTC first
        try {
          const tok = await mintToken("webrtc");
          await logSession({ connection_type: "webrtc", agent_id: c.agent_id });
          conv = await Conversation.startSession({
            conversationToken: tok.token,
            connectionType: "webrtc",
            ...commonOptions,
          } as any);
        } catch (webrtcErr: any) {
          console.warn("AVA WebRTC failed, falling back to WebSocket", webrtcErr);
          usedTransport = "websocket";
          try {
            await new Promise((resolve) => setTimeout(resolve, 350));
            const tok = await mintToken("websocket");
            await logSession({ connection_type: "websocket", agent_id: c.agent_id });
            conv = await Conversation.startSession({
              signedUrl: tok.signed_url,
              ...commonOptions,
            } as any);
          } catch (wsErr: any) {
            console.error("AVA startSession failed on both transports", wsErr);
            const code = wsErr?.code ?? webrtcErr?.code;
            if (code === "voice_agent_disabled") {
              fallback("Agent vocal AVA désactivé — contactez votre administrateur pour l'activer.", "voice_agent_disabled");
            } else if (code === "agent_not_provisioned") {
              fallback("Agent vocal non provisionné — contactez votre administrateur.", "agent_not_provisioned");
            } else if (code === "profile_not_found") {
              fallback("Profil courtier introuvable — contactez le support.", "profile_not_found");
            } else {
              fallback("Connexion vocale échouée", "start_failed");
            }
            return;
          }
        }

        if (cancelled) { try { await conv.endSession(); } catch (_) { /* */ } return; }
        convRef.current = conv;
        console.info(`AVA connected via ${usedTransport}`);

        // Phase 9 — push live broker context so AVA knows what's pending.
        try {
          const [missedRes, vmRes, todayCallsRes] = await Promise.all([
            supabase.from("planipret_phone_calls").select("id", { count: "exact", head: true })
              .eq("user_id", userId).eq("status", "missed")
              .gte("started_at", new Date(Date.now() - 24 * 3600e3).toISOString()),
            supabase.from("planipret_voicemails").select("id", { count: "exact", head: true })
              .eq("user_id", userId).eq("is_read", false),
            supabase.from("planipret_phone_calls").select("id", { count: "exact", head: true })
              .eq("user_id", userId)
              .gte("started_at", new Date(new Date().setHours(0, 0, 0, 0)).toISOString()),
          ]);
          const ctx = `Contexte courant du courtier: ${missedRes.count ?? 0} appel(s) manqué(s) dans les dernières 24h, ${vmRes.count ?? 0} message(s) vocal(aux) non lu(s), ${todayCallsRes.count ?? 0} appel(s) aujourd'hui.`;
          conv.sendContextualUpdate?.(ctx);
        } catch (ctxErr) { console.warn("contextual_update failed", ctxErr); }

        // Bump session counter
        supabase.from("planipret_profiles").update({
          ava_sessions_count: 1,
          ava_last_session_at: new Date().toISOString(),
        }).eq("user_id", userId).then(() => null);
      } catch (e) {
        console.error(e);
        setState("error");
        toast.error("Échec d'initialisation AVA");
      }
    })();
    return () => {
      cancelled = true;
      try { convRef.current?.endSession(); } catch (_) { /* */ }
      if (initAttempt === 0) {
        // On unmount (not on retry), release mic.
        try { micStreamRef.current?.getTracks().forEach((t) => t.stop()); micStreamRef.current = null; } catch (_) { /* */ }
        try { audioCtxRef.current?.close(); audioCtxRef.current = null; } catch (_) { /* */ }
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initAttempt]);

  const retryConnection = useCallback(() => {
    sessionRowIdRef.current = null;
    connectedAtRef.current = 0;
    sessionIdRef.current = `s_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    setInitAttempt((n) => n + 1);
  }, []);

  useEffect(() => { scrollRef.current?.scrollTo({ top: 999999, behavior: "smooth" }); }, [transcript.length]);

  // Live mic-level loop while listening
  useEffect(() => {
    if (state !== "listening" || !analyserRef.current) return;
    const analyser = analyserRef.current;
    const buf = new Uint8Array(analyser.frequencyBinCount);
    let raf = 0;
    const tick = () => {
      analyser.getByteFrequencyData(buf);
      const bins = 7;
      const step = Math.floor(buf.length / bins);
      const levels: number[] = [];
      for (let i = 0; i < bins; i++) {
        let sum = 0;
        for (let j = 0; j < step; j++) sum += buf[i * step + j];
        const avg = sum / step;
        levels.push(Math.max(20, Math.min(100, (avg / 255) * 140)));
      }
      setMicLevels(levels);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [state]);

  const endSession = async () => {
    const dur = Math.round((Date.now() - startTimeRef.current) / 1000);
    try { await convRef.current?.endSession(); } catch (_) { /* */ }
    toast.success(`Session AVA · ${Math.floor(dur / 60)}min${String(dur % 60).padStart(2, "0")}s`);
    onClose();
  };

  const sendText = async () => {
    if (!textInput.trim()) return;
    const msg = textInput.trim();
    setTextInput("");
    appendTranscript({ role: "user", text: msg });
    // Fallback: send to ava-assistant (Claude) if no voice session active
    try {
      await convRef.current?.sendUserMessage?.(msg);
    } catch (_) {
      // No voice: text fallback via ava-assistant
      const { data } = await supabase.functions.invoke("ava-assistant", { body: { message: msg, session_id: sessionId } });
      if ((data as any)?.reply) appendTranscript({ role: "agent", text: (data as any).reply });
    }
  };

  const confirmAction = (ok: boolean) => {
    if (!pending) return;
    if (!ok) {
      pending.resolve({ success: false, error: "user_cancelled" });
      setPending(null);
      return;
    }
    const { tool, params, resolve } = pending;
    setPending(null);
    callServerTool(tool, params).then(resolve);
  };

  // ─── render ────────────────────────────────────────────────────
  const ToolIcon = currentTool ? TOOL_ICONS[currentTool] ?? Sparkles : null;

  return (
    <div className="absolute inset-0 z-[60] flex flex-col" style={{ background: "rgba(4,11,22,0.97)", backdropFilter: "blur(20px)", paddingTop: "calc(env(safe-area-inset-top, 0px) + 20px)", paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 8px)" }}>
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 pt-3 pb-2" style={{ marginTop: 8 }}>
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center overflow-hidden" style={{ background: "var(--pp-bg-elevated)", border: "1px solid var(--pp-bg-border-2)" }}>
            <img src={avaLogo.url} alt="AVA" className="w-full h-full object-contain" />
          </div>
          <span className="text-[14px] font-bold text-white">AVA</span>
        </div>
        <span className="text-[12px]" style={{ color: "#4A7FA5" }}>{STATE_LABEL[state]}</span>
        <div className="flex gap-1">
          <button onClick={() => setSettingsOpen(true)} aria-label="Paramètres" className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: "rgba(255,255,255,0.08)", color: "#fff" }}>
            <Settings className="w-4 h-4" />
          </button>
          <button onClick={endSession} aria-label="Fermer" className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: "rgba(232,76,76,0.85)", color: "#fff", boxShadow: "0 2px 10px rgba(232,76,76,0.5)" }}>
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Tool notif */}
      {toolNotif && (
        <div className="mx-4 mt-3 px-4 py-2 rounded-xl text-[12px] flex items-center gap-2 animate-fade-in"
          style={{ background: "rgba(155,127,232,0.15)", borderBottom: "1px solid rgba(155,127,232,0.3)", color: "#E8EDF5" }}>
          <Sparkles className="w-3.5 h-3.5" style={{ color: "#9B7FE8" }} />
          {toolNotif}
        </div>
      )}

      {/* Center visualization — AVA orb */}
      <div className="flex-1 min-h-0 flex flex-col items-center px-4 pt-6 pb-3">
        {micError ? (
          <div className="bg-white rounded-2xl p-5 text-center max-w-xs">
            <AlertTriangle className="w-8 h-8 mx-auto text-amber-500 mb-2" />
            <p className="font-semibold text-slate-900">🎙️ Microphone requis</p>
            <p className="text-xs text-slate-600 mt-1">Autorisez le microphone dans les paramètres du navigateur.</p>
          </div>
        ) : state === "error" ? (
          <div className="bg-white rounded-2xl p-5 text-center max-w-xs">
            <AlertTriangle className="w-8 h-8 mx-auto text-amber-500 mb-2" />
            <p className="font-semibold text-slate-900">Connexion vocale interrompue</p>
            <p className="text-xs text-slate-600 mt-1">Réessaie la connexion ou continue en chat texte.</p>
            <div className="flex gap-2 mt-3">
              <button onClick={retryConnection} className="flex-1 h-10 rounded-lg text-white text-sm font-medium" style={{ background: "linear-gradient(135deg,#2E9BDC,#6C3CE1)" }}>Réessayer</button>
              {onFallbackToChat && (
                <button onClick={onFallbackToChat} className="flex-1 h-10 rounded-lg text-sm font-medium border border-slate-300 text-slate-700">Chat texte</button>
              )}
            </div>
          </div>
        ) : (
          <VoiceOrb state={state} analyser={analyserRef.current} />
        )}


        {/* Live transcript */}
        <div
          ref={scrollRef}
          className="mt-5 w-full flex-1 min-h-[160px] overflow-y-auto rounded-2xl p-3 space-y-2"
          style={{ background: "rgba(10,22,40,0.72)", border: "1px solid var(--pp-bg-border-2)", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.03)" }}
        >
          {transcript.length === 0 && (
            <div className="h-full min-h-[132px] flex items-center justify-center text-center text-[12px] leading-relaxed px-6" style={{ color: "var(--pp-text-muted)" }}>
              La conversation texte avec AVA apparaîtra ici.
            </div>
          )}
          {transcript.slice(-12).map((t) => {
            if (t.role === "tool") return (
              <div key={t.id} className="text-center text-[11px] px-3 py-1.5 rounded-lg mx-auto w-fit"
                style={{ background: "rgba(0,212,170,0.08)", border: "1px solid rgba(0,212,170,0.2)", color: "#00D4AA" }}>
                ⚡ {t.text}
              </div>
            );
            if (t.role === "nav") return (
              <div key={t.id} className="text-center text-[11px]" style={{ color: "#4A7FA5" }}>{t.text}</div>
            );
            return (
              <div key={t.id} className={t.role === "user" ? "flex justify-end" : "flex justify-start"}>
                <div className="max-w-[86%] px-3.5 py-2.5 text-[13px] leading-relaxed whitespace-pre-wrap break-words shadow-sm"
                  style={t.role === "user"
                    ? { background: "linear-gradient(135deg, var(--pp-brand-accent), var(--pp-success))", borderRadius: "14px 14px 4px 14px", color: "var(--pp-bg-deep)", fontWeight: 650 }
                    : { background: "var(--pp-bg-elevated)", border: "1px solid var(--pp-bg-border-2)", borderRadius: "14px 14px 14px 4px", color: "var(--pp-text-primary)" }}>
                  {t.text}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Quick action chips */}
      <div className="px-4 pb-2 flex gap-2 overflow-x-auto">
        {["📊 Mon brief", "🔥 Leads chauds", "📞 Dernier appel", "📅 Mes RDV"].map((chip) => (
          <button key={chip} onClick={async () => {
            appendTranscript({ role: "user", text: chip });
            try { await convRef.current?.sendUserMessage?.(chip); } catch (_) { /* */ }
          }}
            className="text-[11px] px-3 py-1.5 rounded-full whitespace-nowrap text-white/80"
            style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }}>
            {chip}
          </button>
        ))}
      </div>

      {/* Bottom input bar */}
      <div className="px-4 py-3 flex items-center gap-2" style={{ background: "rgba(6,13,26,0.9)", borderTop: "1px solid #0A1E35" }}>
        <input value={textInput} onChange={(e) => setTextInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") sendText(); }}
          placeholder="Écrivez à AVA..."
          className="flex-1 h-11 px-4 rounded-full outline-none text-[14px]"
          style={{ background: "#0A1628", border: "1px solid #0E2A45", color: "#E8EDF5" }} />
        <button onClick={textInput ? sendText : endSession}
          className="w-[52px] h-[52px] rounded-full flex items-center justify-center text-white shadow-lg"
          style={textInput
            ? { background: "linear-gradient(135deg,#1A4A8A,#2E9BDC)" }
            : { background: "linear-gradient(135deg,#1A3D2A,#00D4AA)" }}>
          {textInput ? <Send className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
        </button>
      </div>

      {/* Confirmation modal */}
      {pending && (
        <CalendarAwareConfirm
          pending={pending}
          onCancel={() => confirmAction(false)}
          onConfirm={(patchedParams) => {
            // Overwrite params with patched (tz + confirmed) then execute
            const p = pending;
            setPending(null);
            callServerTool(p.tool, { ...p.params, ...patchedParams }).then(p.resolve);
          }}
        />
      )}

      {/* Settings bottom sheet */}
      {settingsOpen && (
        <div className="absolute inset-0 z-20 flex items-end bg-black/40" onClick={() => setSettingsOpen(false)}>
          <div className="w-full rounded-t-2xl p-5" style={{ background: "#0A1628", border: "1px solid #0E2A45" }} onClick={(e) => e.stopPropagation()}>
            <div className="text-[13px] font-semibold mb-3 text-white">Mode d'autonomie</div>
            {(["confirm", "semi_auto", "full_auto"] as const).map((m) => (
              <button key={m} onClick={async () => {
                setAutonomy(m);
                await supabase.from("planipret_profiles").update({ ava_autonomy_mode: m }).eq("user_id", userId);
              }}
                className="w-full text-left p-3 rounded-xl mb-2 flex items-center justify-between"
                style={{ background: autonomy === m ? "rgba(46,155,220,0.15)" : "rgba(255,255,255,0.03)", border: `1px solid ${autonomy === m ? "#2E9BDC" : "#0E2A45"}` }}>
                <div>
                  <div className="text-[13px] text-white font-medium">{m === "confirm" ? "Confirmation requise" : m === "semi_auto" ? "Semi-automatique" : "Pleinement autonome"}</div>
                  <div className="text-[11px]" style={{ color: "#4A7FA5" }}>
                    {m === "confirm" ? "AVA confirme avant chaque action" : m === "semi_auto" ? "Auto pour lectures, confirme les envois" : "AVA agit sans demander ⚡"}
                  </div>
                </div>
                {autonomy === m && <span className="text-[#2E9BDC]">●</span>}
              </button>
            ))}
            <button onClick={() => setSettingsOpen(false)} className="w-full h-11 mt-2 rounded-xl text-white font-medium" style={{ background: "#2E9BDC" }}>Fermer</button>
          </div>
        </div>
      )}
    </div>
  );
}

function VoiceOrb({ state, analyser }: { state: AgentState; analyser: AnalyserNode | null }) {
  const level = useAnalyserLevel(analyser, state === "listening");
  const orbState: "idle" | "connecting" | "listening" | "speaking" | "processing" | "error" =
    state === "tool_running" ? "processing" : state;
  return (
    <div className="flex flex-col items-center gap-4">
      <AvaOrb state={orbState} level={level} size={260} />
      <div className="text-[15px] font-semibold tracking-wide" style={{ color: "#E8EDF5", fontFamily: "Urbanist,sans-serif" }}>
        {state === "speaking" ? "AVA parle…" : state === "listening" ? "Je vous écoute…" : state === "processing" ? "Réflexion…" : state === "tool_running" ? "Exécution…" : state === "connecting" ? "Connexion…" : state === "error" ? "Erreur" : "Prête"}
      </div>
    </div>
  );
}

// ─── Timezone validation & calendar-aware confirmation ────────────────
const CALENDAR_TOOLS = new Set(["move_calendar_event", "cancel_calendar_event", "create_calendar_event"]);
const COMMON_TZ = [
  "America/Toronto", "America/Montreal", "America/New_York", "America/Vancouver",
  "America/Chicago", "America/Los_Angeles", "America/Halifax", "America/St_Johns",
  "Europe/Paris", "Europe/London", "UTC",
];

function isValidIANATimezone(tz: string): boolean {
  if (!tz || typeof tz !== "string") return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz }).format(new Date());
    return true;
  } catch { return false; }
}

function CalendarAwareConfirm({
  pending, onCancel, onConfirm,
}: {
  pending: PendingTool;
  onCancel: () => void;
  onConfirm: (patched: Record<string, any>) => void;
}) {
  const isCalendar = CALENDAR_TOOLS.has(pending.tool);
  const initialTz = pending.params?.timezone
    ?? Intl.DateTimeFormat().resolvedOptions().timeZone
    ?? "America/Toronto";
  const [tz, setTz] = useState<string>(initialTz);
  const [customTz, setCustomTz] = useState<string>("");
  const [step, setStep] = useState<"tz" | "reformulate">(isCalendar && pending.tool !== "cancel_calendar_event" ? "tz" : "reformulate");

  const effectiveTz = customTz.trim() || tz;
  const tzValid = isValidIANATimezone(effectiveTz);

  const reformulation = useMemo(() => {
    if (!isCalendar) return null;
    const p = pending.params ?? {};
    const startRaw = p.new_start ?? p.start;
    const subj = p.subject ?? p.event_id ?? "meeting";
    if (pending.tool === "cancel_calendar_event") {
      return `Annuler le meeting « ${subj} » (event_id: ${p.event_id ?? "?"}). Confirmer ?`;
    }
    if (!startRaw) return `Action calendrier: ${pending.tool}. Confirmer ?`;
    try {
      const startAt = new Date(startRaw);
      const fmt = new Intl.DateTimeFormat("fr-CA", {
        timeZone: effectiveTz, weekday: "long", day: "numeric", month: "long",
        hour: "numeric", minute: "2-digit", timeZoneName: "short",
      });
      const label = pending.tool === "move_calendar_event" ? "Déplacer" : "Créer";
      return `${label} le meeting « ${subj} » au ${fmt.format(startAt)} (${effectiveTz}). Je confirme ?`;
    } catch { return `Action calendrier: ${pending.tool}.`; }
  }, [pending, effectiveTz, isCalendar]);

  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center px-6 bg-black/40">
      <div className="w-full max-w-sm rounded-2xl p-6" style={{ background: "#0A1628", border: "1px solid rgba(155,127,232,0.3)" }}>
        <div className="flex items-center gap-2 mb-3">
          <Bot className="w-5 h-5" style={{ color: "#9B7FE8" }} />
          <span className="text-[13px] font-semibold text-white">
            {isCalendar && step === "tz" ? "Fuseau horaire requis" : "AVA demande confirmation"}
          </span>
        </div>

        {isCalendar && step === "tz" ? (
          <>
            <div className="text-[12px] mb-2" style={{ color: "#B4C6D8" }}>
              Sélectionne un fuseau horaire IANA valide avant de continuer.
            </div>
            <select value={tz} onChange={(e) => { setTz(e.target.value); setCustomTz(""); }}
              className="w-full mb-2 h-10 px-3 rounded-lg text-[13px]"
              style={{ background: "#0A1E35", border: "1px solid #0E2A45", color: "#E8EDF5" }}>
              {COMMON_TZ.map((z) => <option key={z} value={z}>{z}</option>)}
            </select>
            <input value={customTz} onChange={(e) => setCustomTz(e.target.value)}
              placeholder="ou saisir un fuseau IANA (ex: Europe/Zurich)"
              className="w-full mb-2 h-10 px-3 rounded-lg text-[13px]"
              style={{ background: "#0A1E35", border: `1px solid ${customTz && !tzValid ? "#DC2626" : "#0E2A45"}`, color: "#E8EDF5" }} />
            {!tzValid && (
              <div className="text-[11px] mb-3 flex items-center gap-1.5" style={{ color: "#F87171" }}>
                <AlertTriangle className="w-3.5 h-3.5" />
                Fuseau horaire IANA invalide (ex: America/Toronto, Europe/Paris, UTC).
              </div>
            )}
            <div className="grid grid-cols-2 gap-2 mt-2">
              <button onClick={onCancel} className="h-11 rounded-xl text-[13px] font-medium" style={{ background: "rgba(255,255,255,0.05)", color: "#E8EDF5" }}>❌ Annuler</button>
              <button disabled={!tzValid} onClick={() => setStep("reformulate")}
                className="h-11 rounded-xl text-[13px] font-semibold text-white disabled:opacity-40"
                style={{ background: "linear-gradient(135deg,#1A4A8A,#2E9BDC)" }}>
                Suivant →
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="rounded-xl p-3 mb-3 text-[13px]" style={{ background: "rgba(155,127,232,0.08)", color: "#E8EDF5" }}>
              <div className="font-semibold mb-1">{TOOL_LABELS[pending.tool] ?? pending.tool}</div>
              {reformulation && <div className="text-[12px]" style={{ color: "#B4C6D8" }}>{reformulation}</div>}
              <pre className="text-[10px] mt-2 opacity-60 whitespace-pre-wrap">
                {JSON.stringify({ ...pending.params, timezone: isCalendar ? effectiveTz : pending.params?.timezone }, null, 2).slice(0, 300)}
              </pre>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {isCalendar && pending.tool !== "cancel_calendar_event" ? (
                <button onClick={() => setStep("tz")} className="h-11 rounded-xl text-[13px] font-medium" style={{ background: "rgba(255,255,255,0.05)", color: "#E8EDF5" }}>← Fuseau</button>
              ) : (
                <button onClick={onCancel} className="h-11 rounded-xl text-[13px] font-medium" style={{ background: "rgba(255,255,255,0.05)", color: "#E8EDF5" }}>❌ Annuler</button>
              )}
              <button onClick={() => {
                if (isCalendar && !tzValid) return;
                const patched: Record<string, any> = { confirmed: true };
                if (isCalendar) patched.timezone = effectiveTz;
                onConfirm(patched);
              }}
                className="h-11 rounded-xl text-[13px] font-semibold text-white"
                style={{ background: "linear-gradient(135deg,#10B981,#00A88A)" }}>
                ✅ Confirmer
              </button>
            </div>
            {isCalendar && pending.tool !== "cancel_calendar_event" && (
              <button onClick={onCancel} className="w-full mt-2 h-9 rounded-lg text-[11px]" style={{ color: "#8FA8C0" }}>Annuler</button>
            )}
          </>
        )}
      </div>
    </div>
  );
}


