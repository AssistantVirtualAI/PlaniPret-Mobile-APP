import { useEffect, useRef, useState } from "react";
import { Conversation } from "@elevenlabs/client";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { X, Mic, MicOff, PhoneOff, Settings, AlertTriangle } from "lucide-react";

type AgentState = "idle" | "connecting" | "listening" | "speaking" | "processing" | "error";

interface Props { onClose: () => void; }

interface TranscriptEntry { id: string; role: "user" | "agent"; text: string; }

const STATE_LABEL: Record<AgentState, string> = {
  idle: "Appuyez pour parler à AVA",
  connecting: "Connexion en cours...",
  listening: "Je vous écoute...",
  speaking: "AVA parle...",
  processing: "AVA réfléchit...",
  error: "Erreur de connexion",
};

const STATE_COLOR: Record<AgentState, string> = {
  idle: "#94A3B8",
  connecting: "#94A3B8",
  listening: "#2E86C1",
  speaking: "#27AE60",
  processing: "#8B5CF6",
  error: "#E74C3C",
};

export default function VoiceAgent({ onClose }: Props) {
  const [state, setState] = useState<AgentState>("connecting");
  const [muted, setMuted] = useState(false);
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [toolToast, setToolToast] = useState<string | null>(null);
  const [autonomy, setAutonomy] = useState<boolean>(() => localStorage.getItem("ava_autonomy") === "1");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);
  const [actionsCount, setActionsCount] = useState(0);
  const convRef = useRef<any>(null);
  const startTimeRef = useRef<number>(Date.now());
  const scrollRef = useRef<HTMLDivElement>(null);

  const showToolToast = (msg: string) => {
    setToolToast(msg);
    window.setTimeout(() => setToolToast(null), 3000);
  };

  const callToolHandler = async (toolName: string, params: any) => {
    showToolToast(`⚡ AVA: ${toolName}…`);
    setActionsCount((c) => c + 1);
    const { data, error } = await supabase.functions.invoke("elevenlabs-tool-handler", {
      body: { tool_name: toolName, parameters: params },
    });
    if (error || !(data as any)?.success) {
      const msg = (data as any)?.error ?? error?.message ?? "Erreur";
      toast.error("❌ " + msg);
      return { success: false, error: msg };
    }
    if ((data as any)?.message) showToolToast("✅ " + (data as any).message);
    return data;
  };

  const clientTools: Record<string, (p: any) => Promise<any>> = {
    make_call: (p) => callToolHandler("make_call", p),
    send_sms: (p) => callToolHandler("send_sms", p),
    send_email: (p) => callToolHandler("send_email", p),
    create_task: (p) => callToolHandler("create_task", p),
    create_calendar_event: (p) => callToolHandler("create_calendar_event", p),
    get_daily_briefing: (p) => callToolHandler("get_daily_briefing", p),
    search_contact: (p) => callToolHandler("search_contact", p),
    read_emails: (p) => callToolHandler("read_emails", p),
    get_call_history: (p) => callToolHandler("get_call_history", p),
    read_voicemails: (p) => callToolHandler("read_voicemails", p),
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // Mic permission
        try { await navigator.mediaDevices.getUserMedia({ audio: true }); }
        catch { setMicError("mic"); setState("error"); return; }

        const { data: cfg, error } = await supabase.functions.invoke("elevenlabs-agent-config", { body: {} });
        if (error || !(cfg as any)?.success) {
          toast.error((cfg as any)?.error ?? "Configuration AVA introuvable");
          setState("error"); return;
        }
        if (cancelled) return;

        const conv = await Conversation.startSession({
          agentId: (cfg as any).agent_id,
          connectionType: "webrtc",
          overrides: { agent: { prompt: { prompt: (cfg as any).system_prompt }, language: "fr" } } as any,
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
            setTranscript((p) => [...p, { id: `${Date.now()}-${Math.random()}`, role: source === "user" ? "user" : "agent", text }]);
          },
        } as any);
        if (cancelled) { try { await conv.endSession(); } catch {} return; }
        convRef.current = conv;
      } catch (e) {
        console.error(e);
        setState("error");
        toast.error("Échec d'initialisation AVA");
      }
    })();

    return () => {
      cancelled = true;
      const c = convRef.current;
      if (c) { c.endSession().catch(() => null); }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { scrollRef.current?.scrollTo({ top: 999999, behavior: "smooth" }); }, [transcript.length]);

  const toggleMute = async () => {
    const c = convRef.current; if (!c) return;
    const next = !muted;
    try { await c.setMicMuted?.(next); } catch {}
    setMuted(next);
  };

  const endSession = async () => {
    const dur = Math.round((Date.now() - startTimeRef.current) / 1000);
    try { await convRef.current?.endSession(); } catch {}
    toast.success(`Session AVA terminée · ${Math.floor(dur / 60)}min${dur % 60}s · ${actionsCount} action(s)`);
    onClose();
  };

  const color = STATE_COLOR[state];

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-between p-6" style={{ background: "rgba(15, 30, 60, 0.97)" }}>
      {/* Top */}
      <div className="w-full flex items-center justify-between">
        <button onClick={() => setSettingsOpen((v) => !v)} className="w-10 h-10 rounded-full bg-white/10 text-white flex items-center justify-center">
          <Settings className="w-4 h-4" />
        </button>
        <button onClick={endSession} className="w-10 h-10 rounded-full bg-white/10 text-white flex items-center justify-center">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Tool toast */}
      {toolToast && (
        <div className="absolute top-20 px-4 py-2 rounded-full bg-white/95 text-slate-800 text-xs font-medium shadow-lg animate-fade-in">
          {toolToast}
        </div>
      )}

      {/* Settings popover */}
      {settingsOpen && (
        <div className="absolute top-20 left-6 right-6 bg-white rounded-2xl p-4 shadow-xl">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-slate-900">AVA peut agir seule</p>
              <p className="text-[11px] text-slate-500 mt-0.5">{autonomy ? "AVA exécute les tâches simples automatiquement" : "AVA demande confirmation pour chaque action"}</p>
            </div>
            <button onClick={() => { const v = !autonomy; setAutonomy(v); localStorage.setItem("ava_autonomy", v ? "1" : "0"); }}
              className={`w-10 h-6 rounded-full p-0.5 transition ${autonomy ? "bg-emerald-500" : "bg-slate-300"}`}>
              <span className={`block w-5 h-5 rounded-full bg-white shadow transition-transform ${autonomy ? "translate-x-4" : ""}`} />
            </button>
          </div>
        </div>
      )}

      {/* Center */}
      <div className="flex-1 flex flex-col items-center justify-center w-full">
        {micError ? (
          <div className="bg-white rounded-2xl p-5 text-center max-w-xs">
            <AlertTriangle className="w-8 h-8 mx-auto text-amber-500 mb-2" />
            <p className="font-semibold text-slate-900">🎙️ Accès au microphone requis</p>
            <p className="text-xs text-slate-600 mt-1">Pour utiliser AVA, autorisez l'accès au microphone dans les paramètres de votre navigateur.</p>
          </div>
        ) : (
          <>
            <div className="relative" style={{ width: 200, height: 200 }}>
              <div className="absolute inset-0 rounded-full animate-ping" style={{ background: color, opacity: 0.25 }} />
              <div className="absolute inset-4 rounded-full animate-pulse" style={{ background: color, opacity: 0.4 }} />
              <div className="absolute inset-8 rounded-full flex items-center justify-center" style={{ background: color }}>
                <Mic className="w-12 h-12 text-white" />
              </div>
            </div>
            <p className="mt-6 text-white text-base font-medium">{STATE_LABEL[state]}</p>

            <div ref={scrollRef} className="mt-6 w-full max-h-32 overflow-y-auto space-y-1.5 px-2">
              {transcript.slice(-8).map((t) => (
                <div key={t.id} className={`text-xs ${t.role === "user" ? "text-right text-white" : "text-left"}`} style={t.role === "agent" ? { color: "#2E86C1" } : undefined}>
                  {t.text}
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Bottom controls */}
      <div className="flex items-center gap-6">
        <button onClick={toggleMute} className="w-12 h-12 rounded-full border-2 border-white/40 text-white flex items-center justify-center">
          {muted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
        </button>
        <button onClick={endSession} className="w-16 h-16 rounded-full bg-red-500 text-white flex items-center justify-center shadow-xl">
          <PhoneOff className="w-7 h-7" />
        </button>
        <div className="w-12 h-12" />
      </div>
    </div>
  );
}
