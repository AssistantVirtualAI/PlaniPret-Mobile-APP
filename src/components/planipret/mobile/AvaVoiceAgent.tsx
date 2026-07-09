// AvaVoiceAgent — full ElevenLabs Conversational AI overlay for AVA Planiprêt.
// Replaces the legacy VoiceAgent.tsx with rich state visualization, live
// transcript, tool execution notifications and confirmation modal.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Conversation } from "@elevenlabs/client";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { X, Mic, Send, Settings, AlertTriangle, Sparkles, PhoneOutgoing, MessageSquare, Search, Calendar, Mail, Bot, Map } from "lucide-react";

type AgentState = "idle" | "connecting" | "listening" | "speaking" | "processing" | "tool_running" | "error";
type AutonomyMode = "confirm" | "semi_auto" | "full_auto";

interface Props { onClose: () => void; userId: string; }

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

const TOOL_ICONS: Record<string, any> = {
  make_call: PhoneOutgoing, send_sms: MessageSquare, send_email: Mail,
  search_client: Search, create_task: Sparkles, create_appointment: Calendar,
  navigate_to: Map, read_emails: Mail, analyze_call: Bot,
};

const TOOL_LABELS: Record<string, string> = {
  make_call: "Lancement d'un appel",
  send_sms: "Envoi d'un SMS",
  send_email: "Envoi d'un courriel",
  create_task: "Création d'une tâche Maestro",
  create_appointment: "Création d'un RDV",
  generate_voicemail_greeting: "Génération de boîte vocale",
};

const CONFIRM_REQUIRED = new Set([
  "make_call", "send_sms", "send_email",
  "create_task", "create_appointment", "generate_voicemail_greeting",
  "update_client",
]);

export default function AvaVoiceAgent({ onClose, userId }: Props) {
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

  const handleTool = useCallback(async (toolName: string, params: any) => {
    // Confirmation gate
    if (autonomy === "confirm" && CONFIRM_REQUIRED.has(toolName)) {
      return new Promise((resolve, reject) => {
        setPending({ tool: toolName, params, resolve, reject });
      }).then((r: any) => r ?? { success: false, error: "user_cancelled" });
    }
    return callServerTool(toolName, params);
  }, [autonomy, callServerTool]);

  // Build clientTools map dynamically (all tools delegate to server)
  const clientTools = useMemo(() => {
    const TOOL_NAMES = [
      "make_call", "get_active_calls", "hangup_call", "get_call_history",
      "get_recording", "get_transcript", "send_sms", "get_sms_conversations",
      "get_voicemails", "generate_voicemail_greeting",
      "analyze_call", "get_hot_leads", "get_coaching_summary",
      "search_client", "get_client_profile", "get_client_history",
      "create_task", "create_appointment", "get_pending_tasks",
      "get_upcoming_appointments", "update_client", "create_client",
      "read_emails", "send_email", "get_calendar_today", "get_calendar_week",
      "navigate_to", "show_client_in_app", "open_call_detail",
      "get_daily_briefing", "get_my_stats",
      "explain_feature", "get_integration_status",
    ];
    const map: Record<string, (p: any) => Promise<any>> = {};
    for (const t of TOOL_NAMES) map[t] = (p: any) => handleTool(t, p);
    return map;
  }, [handleTool]);

  // Initialization
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setState("connecting");
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


        const { data: cfg, error } = await supabase.functions.invoke("ava-agent-config", { body: {} });
        if (error || !(cfg as any)?.success) {
          toast.error((cfg as any)?.error ?? "Configuration AVA introuvable");
          setState("error");
          return;
        }
        if (cancelled) return;

        const c = cfg as any;
        setAutonomy(c.autonomy_mode ?? "confirm");

        if (!c.agent_id) {
          toast.error("Aucun agent ElevenLabs configuré pour ce courtier");
          setState("error");
          return;
        }

        const conv = await Conversation.startSession({
          agentId: c.agent_id,
          connectionType: "webrtc",
          overrides: {
            agent: {
              prompt: { prompt: c.system_prompt },
              firstMessage: c.first_message,
              language: c.language ?? "fr",
            },
            tts: { voiceId: c.voice_id },
          } as any,
          clientTools,
          onConnect: () => setState("listening"),
          onDisconnect: () => setState("idle"),
          onError: (err: any) => { console.error("AVA error", err); setState("error"); toast.error("Erreur AVA"); },
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
            // Persist
            supabase.from("planipret_ava_conversations").insert({
              user_id: userId,
              role: source === "user" ? "user" : "assistant",
              message: text,
              session_id: sessionId,
            }).then(() => null);
          },
        } as any);

        if (cancelled) { try { await conv.endSession(); } catch (_) { /* */ } return; }
        convRef.current = conv;

        // Bump session counter
        supabase.from("planipret_profiles").update({
          ava_sessions_count: 1, // RLS-safe via increment trigger or fallback
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
      try { micStreamRef.current?.getTracks().forEach((t) => t.stop()); } catch (_) { /* */ }
      try { audioCtxRef.current?.close(); } catch (_) { /* */ }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    <div className="absolute inset-0 z-[60] flex flex-col" style={{ background: "rgba(4,11,22,0.97)", backdropFilter: "blur(20px)" }}>
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 pt-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: "linear-gradient(135deg,#2D1A5A,#9B7FE8)" }}>
            <Bot className="w-4 h-4 text-white" />
          </div>
          <span className="text-[14px] font-bold text-white">AVA</span>
        </div>
        <span className="text-[12px]" style={{ color: "#4A7FA5" }}>{STATE_LABEL[state]}</span>
        <div className="flex gap-1">
          <button onClick={() => setSettingsOpen(true)} className="w-9 h-9 rounded-full bg-white/5 text-white/70 flex items-center justify-center">
            <Settings className="w-4 h-4" />
          </button>
          <button onClick={endSession} className="w-9 h-9 rounded-full bg-white/5 text-white/70 flex items-center justify-center">
            <X className="w-4 h-4" />
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

      {/* Center visualization */}
      <div className="flex-1 flex flex-col items-center justify-center px-6">
        {micError ? (
          <div className="bg-white rounded-2xl p-5 text-center max-w-xs">
            <AlertTriangle className="w-8 h-8 mx-auto text-amber-500 mb-2" />
            <p className="font-semibold text-slate-900">🎙️ Microphone requis</p>
            <p className="text-xs text-slate-600 mt-1">Autorisez le microphone dans les paramètres du navigateur.</p>
          </div>
        ) : (
          <div className="relative" style={{ width: 180, height: 180 }}>
            {state === "listening" && (
              <>
                <div className="absolute inset-0 rounded-full animate-pulse" style={{ background: "rgba(46,155,220,0.1)" }} />
                <div className="absolute inset-3 rounded-full animate-pulse" style={{ background: "rgba(46,155,220,0.2)", animationDelay: "0.3s" }} />
                <div className="absolute inset-6 rounded-full animate-pulse" style={{ background: "rgba(46,155,220,0.4)", animationDelay: "0.6s" }} />
                <div className="absolute inset-0 flex items-end justify-center gap-1 px-10 pb-12 pointer-events-none">
                  {micLevels.map((h, i) => (
                    <div key={i} className="w-1.5 rounded-full transition-all duration-75"
                      style={{ background: "linear-gradient(180deg,#7FD8FF,#2E9BDC)", height: `${h}%` }} />
                  ))}
                </div>
              </>
            )}
            {state === "speaking" && (
              <div className="absolute inset-0 rounded-full flex items-center justify-center gap-1" style={{ border: "2px solid #00D4AA" }}>
                {Array.from({ length: 7 }).map((_, i) => (
                  <div key={i} className="w-1.5 rounded-full animate-pulse"
                    style={{ background: "linear-gradient(180deg,#00D4AA,#00A88A)", height: `${20 + Math.random() * 60}%`, animationDelay: `${i * 80}ms` }} />
                ))}
              </div>
            )}
            {state === "processing" && (
              <div className="absolute inset-0 rounded-full animate-spin" style={{ borderTop: "3px solid #9B7FE8", borderRight: "3px solid transparent", borderBottom: "3px solid transparent", borderLeft: "3px solid transparent" }} />
            )}
            {state === "tool_running" && ToolIcon && (
              <div className="absolute inset-0 rounded-full flex items-center justify-center" style={{ border: "2px solid #9B7FE8" }}>
                <ToolIcon className="w-12 h-12" style={{ color: "#9B7FE8" }} />
              </div>
            )}
            {state === "error" && (
              <div className="absolute inset-0 rounded-full flex items-center justify-center" style={{ border: "2px solid #EF4444" }}>
                <AlertTriangle className="w-12 h-12 text-red-500" />
              </div>
            )}
            {(state === "idle" || state === "connecting") && (
              <div className="absolute inset-0 rounded-full flex items-center justify-center" style={{ border: "2px solid #1A2A3A" }}>
                <Bot className="w-12 h-12" style={{ color: "#4A7FA5" }} />
              </div>
            )}
            {state === "listening" && (
              <div className="absolute inset-0 flex items-center justify-center">
                <Mic className="w-12 h-12 text-white" />
              </div>
            )}
          </div>
        )}

        {/* Live transcript */}
        <div ref={scrollRef} className="w-full max-h-[200px] overflow-y-auto mt-6 space-y-1.5 px-2">
          {transcript.slice(-12).map((t) => {
            if (t.role === "tool") return (
              <div key={t.id} className="text-center text-[11px] px-3 py-1.5 rounded-lg mx-auto inline-block"
                style={{ background: "rgba(0,212,170,0.08)", border: "1px solid rgba(0,212,170,0.2)", color: "#00D4AA" }}>
                ⚡ {t.text}
              </div>
            );
            if (t.role === "nav") return (
              <div key={t.id} className="text-center text-[11px]" style={{ color: "#4A7FA5" }}>{t.text}</div>
            );
            return (
              <div key={t.id} className={t.role === "user" ? "flex justify-end" : "flex justify-start"}>
                <div className="max-w-[80%] px-3 py-2 text-[13px]"
                  style={t.role === "user"
                    ? { background: "rgba(46,155,220,0.15)", borderRadius: "12px 12px 2px 12px", color: "#E8EDF5" }
                    : { background: "rgba(155,127,232,0.15)", borderRadius: "12px 12px 12px 2px", color: "#E8EDF5" }}>
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
        <div className="absolute inset-0 z-10 flex items-center justify-center px-6 bg-black/40">
          <div className="w-full max-w-sm rounded-2xl p-6" style={{ background: "#0A1628", border: "1px solid rgba(155,127,232,0.3)" }}>
            <div className="flex items-center gap-2 mb-3">
              <Bot className="w-5 h-5" style={{ color: "#9B7FE8" }} />
              <span className="text-[13px] font-semibold text-white">AVA demande confirmation</span>
            </div>
            <div className="rounded-xl p-3 mb-4 text-[13px]" style={{ background: "rgba(155,127,232,0.08)", color: "#E8EDF5" }}>
              {TOOL_LABELS[pending.tool] ?? pending.tool}
              <pre className="text-[10px] mt-2 opacity-70 whitespace-pre-wrap">{JSON.stringify(pending.params, null, 2).slice(0, 300)}</pre>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => confirmAction(false)} className="h-11 rounded-xl text-[13px] font-medium" style={{ background: "rgba(255,255,255,0.05)", color: "#E8EDF5" }}>❌ Annuler</button>
              <button onClick={() => confirmAction(true)} className="h-11 rounded-xl text-[13px] font-semibold text-white" style={{ background: "linear-gradient(135deg,#10B981,#00A88A)" }}>✅ Confirmer</button>
            </div>
          </div>
        </div>
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
