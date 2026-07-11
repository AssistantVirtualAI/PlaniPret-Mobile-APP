import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Mic, MicOff, Pause, Play, PhoneForwarded, Grid3X3, Volume2, VolumeX, PhoneOff, User, CornerUpRight,
} from "lucide-react";
import { useMplanipretLang } from "@/hooks/useMplanipretLang";
import { useMplanipretSoftphone } from "@/hooks/useMplanipretSoftphone";
import NetworkQualityBadge from "@/components/planipret/mobile/NetworkQualityBadge";
import HandoverIndicator from "@/components/planipret/mobile/HandoverIndicator";

type Call = {
  id: string;
  direction?: string;
  status?: string;
  from_number?: string;
  to_number?: string;
  caller_name?: string;
  started_at?: string;
  answered_at?: string;
};

function formatDuration(sec: number) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function ActiveCallOverlay({ callId, onClosed }: { callId: string | null; onClosed: () => void }) {
  const { t } = useMplanipretLang();
  const { net, quality } = useMplanipretSoftphone();
  const [call, setCall] = useState<Call | null>(null);
  const [muted, setMuted] = useState(false);
  const [held, setHeld] = useState(false);
  const [speaker, setSpeaker] = useState(false);
  const [keypadOpen, setKeypadOpen] = useState(false);
  const [dtmfBuffer, setDtmfBuffer] = useState("");
  const [transferOpen, setTransferOpen] = useState(false);
  const [transferMode, setTransferMode] = useState<"transfer" | "forward">("transfer");
  const [transferTo, setTransferTo] = useState("");
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!callId) { setCall(null); return; }
    let cancelled = false;
    (async () => {
      const { data } = await supabase.from("planipret_phone_calls").select("*").eq("id", callId).maybeSingle();
      if (!cancelled) setCall(data as Call | null);
    })();
    const ch = supabase
      .channel(`mplanipret-call-${callId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "planipret_phone_calls", filter: `id=eq.${callId}` }, (payload) => {
        const row = (payload.new ?? payload.old) as Call;
        setCall(row);
        if (row?.status && ["completed", "ended", "cancelled", "failed", "no_answer"].includes(row.status)) {
          onClosed();
        }
      })
      .subscribe();
    return () => { cancelled = true; supabase.removeChannel(ch); };
  }, [callId, onClosed]);

  useEffect(() => {
    if (!call) return;
    const start = call.answered_at ? new Date(call.answered_at).getTime() : (call.started_at ? new Date(call.started_at).getTime() : Date.now());
    const tick = () => setElapsed(Math.max(0, Math.floor((Date.now() - start) / 1000)));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [call?.id, call?.answered_at, call?.started_at]);

  if (!callId || !call) return null;

  const isRinging = call.status === "ringing";
  const otherParty = call.direction === "inbound" ? call.from_number : call.to_number;
  const displayName = call.caller_name || otherParty || t("common.unknown");

  const invoke = async (action: string, extra: Record<string, unknown> = {}) => {
    const normalized = action === "hangup" ? "disconnect" : action === "resume" ? "unhold" : action;
    const { error } = await supabase.functions.invoke("pp-ns-calls", { body: { action: normalized, call_id: callId, ...extra } });
    if (error) toast.error(error.message);
    return !error;
  };

  const toggleMute = async () => { const next = !muted; if (await invoke("mute", { muted: next })) setMuted(next); };
  const toggleHold = async () => { const next = !held; if (await invoke(next ? "hold" : "resume")) setHeld(next); };
  const toggleSpeaker = () => setSpeaker((v) => !v); // client-side hint only
  const sendDtmf = async (d: string) => { setDtmfBuffer((b) => (b + d).slice(-16)); await invoke("dtmf", { digit: d }); };
  const doTransfer = async () => {
    if (!transferTo.trim()) return;
    const action = transferMode === "forward" ? "forward" : "transfer";
    if (await invoke(action, { destination: transferTo.trim(), target: transferTo.trim() })) {
      toast.success(transferMode === "forward" ? t("call.forwardSent") ?? "Appel renvoyé" : t("call.transferSent"));
      setTransferOpen(false); setTransferTo("");
    }
  };
  const openTransfer = (mode: "transfer" | "forward") => { setTransferMode(mode); setTransferOpen(true); };
  const hangup = async () => { await invoke("disconnect"); onClosed(); };

  const KEYS = ["1","2","3","4","5","6","7","8","9","*","0","#"];

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-50 flex flex-col"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        style={{ background: "linear-gradient(160deg, #060D1A 0%, #0A1425 55%, #0D2540 100%)", color: "white" }}
      >
        <div className="flex-1 flex flex-col items-center justify-center px-6">
          <div className="w-24 h-24 rounded-full flex items-center justify-center mb-4"
            style={{ background: "linear-gradient(135deg, #1A4A8A, #2E9BDC)", boxShadow: "0 10px 40px rgba(46,155,220,0.5)" }}>
            <User className="w-10 h-10" />
          </div>
          <div className="text-2xl font-semibold tracking-tight">{displayName}</div>
          {otherParty && call.caller_name && <div className="text-sm text-white/60 mt-1">{otherParty}</div>}
          <div className="mt-3 text-sm text-white/70">
            {isRinging ? t("call.ringing") : held ? t("call.onHold") : formatDuration(elapsed)}
          </div>
          <div className="mt-3">
            <NetworkQualityBadge net={net} quality={quality} />
          </div>
          <div className="mt-3">
            <HandoverIndicator />
          </div>
          {dtmfBuffer && <div className="mt-2 text-xs text-white/50">DTMF: {dtmfBuffer}</div>}
        </div>

        {keypadOpen ? (
          <div className="px-8 pb-6">
            <div className="grid grid-cols-3 gap-3 mx-auto" style={{ maxWidth: 288 }}>
              {KEYS.map((k) => (
                <button key={k} onClick={() => sendDtmf(k)}
                  className="w-16 h-16 rounded-full text-2xl font-semibold active:scale-95 transition mx-auto"
                  style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.15)" }}>
                  {k}
                </button>
              ))}
            </div>
            <button onClick={() => setKeypadOpen(false)}
              className="mt-4 w-full py-3 rounded-2xl text-sm font-medium"
              style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.15)" }}>
              {t("common.close")}
            </button>
          </div>
        ) : transferOpen ? (
          <div className="px-8 pb-6">
            <input
              autoFocus
              value={transferTo}
              onChange={(e) => setTransferTo(e.target.value)}
              placeholder={t("call.transferPh")}
              className="w-full px-4 py-3 rounded-2xl bg-transparent outline-none text-white"
              style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.2)" }}
            />
            <div className="flex gap-3 mt-3">
              <button onClick={() => { setTransferOpen(false); setTransferTo(""); }}
                className="flex-1 py-3 rounded-2xl text-sm font-medium"
                style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.15)" }}>
                {t("common.cancel")}
              </button>
              <button onClick={doTransfer} disabled={!transferTo.trim()}
                className="flex-1 py-3 rounded-2xl text-sm font-semibold text-white disabled:opacity-50"
                style={{ background: "linear-gradient(135deg, #1A4A8A, #2E9BDC)" }}>
                {transferMode === "forward" ? (t("call.forward") ?? "Renvoyer") : t("call.transfer")}
              </button>
            </div>
          </div>
        ) : (
          <div className="px-6 pb-4">
            <div className="grid grid-cols-3 gap-4">
              <CallBtn active={muted} onClick={toggleMute} icon={muted ? <MicOff /> : <Mic />} label={muted ? t("call.unmute") : t("call.mute")} />
              <CallBtn active={held} onClick={toggleHold} icon={held ? <Play /> : <Pause />} label={held ? t("call.resume") : t("call.hold")} />
              <CallBtn onClick={() => openTransfer("transfer")} icon={<PhoneForwarded />} label={t("call.transfer")} />
              <CallBtn onClick={() => openTransfer("forward")} icon={<CornerUpRight />} label={t("call.forward") ?? "Renvoyer"} />
              <CallBtn onClick={() => setKeypadOpen(true)} icon={<Grid3X3 />} label={t("call.keypad")} />
              <CallBtn active={speaker} onClick={toggleSpeaker} icon={speaker ? <Volume2 /> : <VolumeX />} label={t("call.speaker")} />
            </div>
          </div>
        )}

        <div className="pb-8 flex items-center justify-center">
          <button onClick={hangup}
            className="w-18 h-18 rounded-full flex items-center justify-center active:scale-95 transition"
            style={{ width: 72, height: 72, background: "linear-gradient(135deg, #B91C1C, #E84C4C)", boxShadow: "0 8px 24px rgba(232,76,76,0.5)" }}
            aria-label={t("dialer.hangup")}>
            <PhoneOff className="w-7 h-7" />
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

function CallBtn({ icon, label, onClick, active }: { icon: React.ReactNode; label: string; onClick: () => void; active?: boolean }) {
  return (
    <button onClick={onClick} className="flex flex-col items-center gap-1.5 active:scale-95 transition">
      <div className="w-14 h-14 rounded-full flex items-center justify-center"
        style={{
          background: active ? "rgba(46,155,220,0.25)" : "rgba(255,255,255,0.08)",
          border: `1px solid ${active ? "rgba(46,155,220,0.5)" : "rgba(255,255,255,0.15)"}`,
          color: "white",
        }}>
        <span className="w-6 h-6 flex items-center justify-center [&>svg]:w-6 [&>svg]:h-6">{icon}</span>
      </div>
      <span className="text-[11px] text-white/70">{label}</span>
    </button>
  );
}
