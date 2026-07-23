import { useEffect, useRef, useState } from "react";
import { Phone, PhoneOff, X, Bot } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";

export type InboundCall = { call_id?: string; from_number?: string; caller_name?: string } | null;

/** Generates the dual-tone ringback via Web Audio. Returns a stop() function. */
function startRingtone(): () => void {
  const Ctx = (window.AudioContext || (window as any).webkitAudioContext);
  if (!Ctx) return () => {};
  const ctx = new Ctx();
  let killed = false;
  const cycle = () => {
    if (killed) return;
    const t = ctx.currentTime;
    const o1 = ctx.createOscillator();
    const o2 = ctx.createOscillator();
    const g = ctx.createGain();
    o1.frequency.value = 440; o2.frequency.value = 480;
    g.gain.setValueAtTime(0.0, t);
    g.gain.linearRampToValueAtTime(0.15, t + 0.05);
    g.gain.setValueAtTime(0.15, t + 1.95);
    g.gain.linearRampToValueAtTime(0, t + 2.0);
    o1.connect(g); o2.connect(g); g.connect(ctx.destination);
    o1.start(t); o2.start(t); o1.stop(t + 2.0); o2.stop(t + 2.0);
    setTimeout(cycle, 6000);
  };
  cycle();
  return () => { killed = true; ctx.close().catch(() => {}); };
}

export default function InboundCallOverlay({ call, onClose }: { call: InboundCall; onClose: () => void }) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [contact, setContact] = useState<{ id?: string; full_name?: string; company?: string; avatar_url?: string; tags?: string[] } | null>(null);
  const stopRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    setContact(null);
    if (!call?.from_number) return;
    const digits = call.from_number.replace(/\D/g, "").slice(-10);
    if (!digits) return;
    (async () => {
      const { data } = await supabase
        .from("planipret_contacts")
        .select("id, full_name, company, avatar_url, tags")
        .ilike("phone", `%${digits}%`)
        .limit(1)
        .maybeSingle();
      if (data) setContact(data as any);
    })();
  }, [call?.from_number]);

  useEffect(() => {
    if (!call) return;
    stopRef.current = startRingtone();
    try { (navigator as any).vibrate?.([400, 200, 400, 200, 400]); } catch (_) { /* */ }
    const t = setTimeout(() => {
      toast(`📞 Appel manqué de ${contact?.full_name ?? call.from_number ?? ""}`);
      handleClose();
    }, 30000);
    return () => {
      clearTimeout(t);
      stopRef.current?.();
      try { (navigator as any).vibrate?.(0); } catch (_) { /* */ }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [call?.call_id]);

  const handleClose = () => { stopRef.current?.(); onClose(); };

  const act = async (action: "answer" | "reject") => {
    if (busy) return;
    setBusy(true);
    try {
      await supabase.functions.invoke("pp-ns-calls", { body: { action, call_id: call?.call_id } });
      handleClose();
      if (action === "answer") navigate(`/mplanipret/calls?call=${call?.call_id ?? ""}`);
    } catch (e: any) {
      toast.error(e?.message ?? "Action impossible");
    } finally {
      setBusy(false);
    }
  };

  const sendToVoicemail = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await supabase.functions.invoke("pp-ns-calls", { body: { action: "reject", call_id: call?.call_id, reason: "voicemail" } });
      toast.success("🤖 Renvoyé vers votre boîte vocale");
      handleClose();
    } catch (e: any) {
      toast.error(e?.message ?? "Action impossible");
    } finally {
      setBusy(false);
    }
  };

  if (!call) return null;
  const displayName = contact?.full_name || call.caller_name || call.from_number || "Inconnu";
  const initials = displayName.split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase();

  return (
    <div className="absolute inset-0 z-[60] flex flex-col items-center justify-between py-10" style={{ background: "linear-gradient(180deg,#0A1628 0%,#020610 100%)" }}>
      <button onClick={handleClose} className="absolute top-4 right-4 text-slate-400 hover:text-white text-xs flex items-center gap-1 px-3 py-2 rounded-full" style={{ background: "rgba(255,255,255,0.05)" }}>
        <X className="w-4 h-4" /> Ignorer
      </button>

      <div className="flex flex-col items-center gap-3 mt-2">
        <span className="text-slate-400 text-[11px] uppercase tracking-[0.2em]">Appel entrant</span>
        <div className="relative w-24 h-24 rounded-full flex items-center justify-center text-white text-2xl font-semibold overflow-hidden" style={{ background: "linear-gradient(135deg,#1A3D5A,#2E9BDC)" }}>
          {contact?.avatar_url ? (
            <img src={contact.avatar_url} alt={displayName} className="absolute inset-0 w-full h-full object-cover" />
          ) : initials ? initials : <Phone className="w-10 h-10" />}
        </div>
        <div className="text-white text-2xl font-bold tracking-tight text-center px-6">{displayName}</div>
        {(contact?.company || (contact?.full_name && call.from_number)) && (
          <div className="text-slate-400 text-sm">{contact?.company ?? call.from_number}</div>
        )}
        {contact?.tags && contact.tags.length > 0 && (
          <div className="flex gap-1.5 flex-wrap justify-center px-6">
            {contact.tags.slice(0, 3).map((t) => (
              <span key={t} className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: "rgba(46,155,220,0.15)", color: "#9BCFEC", border: "1px solid rgba(46,155,220,0.3)" }}>{t}</span>
            ))}
          </div>
        )}
      </div>

      <div className="relative w-44 h-44 flex items-center justify-center">
        <span className="absolute inset-0 rounded-full border-2 border-blue-400/40 animate-ping" />
        <span className="absolute inset-4 rounded-full border-2 border-blue-400/30 animate-ping" style={{ animationDelay: "0.5s" }} />
        <span className="absolute inset-8 rounded-full border-2 border-blue-400/20 animate-ping" style={{ animationDelay: "1s" }} />
      </div>

      <div className="flex flex-col items-center gap-4 mb-4">
        <button onClick={sendToVoicemail} disabled={busy}
          className="flex items-center gap-2 px-4 py-2 rounded-full text-[12px] font-medium active:scale-95 transition disabled:opacity-50"
          style={{ background: "rgba(155,127,232,0.15)", border: "1px solid rgba(155,127,232,0.4)", color: "#C9B6F5" }}>
          <Bot className="w-4 h-4" /> Boîte vocale AVA
        </button>
        <div className="flex items-center gap-16">
          <button onClick={() => act("reject")} disabled={busy}
            className="w-[68px] h-[68px] rounded-full bg-red-500 hover:bg-red-600 active:scale-95 transition flex items-center justify-center shadow-xl disabled:opacity-50">
            <PhoneOff className="w-7 h-7 text-white" />
          </button>
          <button onClick={() => act("answer")} disabled={busy}
            className="w-[68px] h-[68px] rounded-full active:scale-95 transition flex items-center justify-center shadow-xl disabled:opacity-50"
            style={{ background: "linear-gradient(135deg,#0D5C2A,#00D4AA)", boxShadow: "0 4px 24px rgba(0,212,170,0.5)" }}>
            <Phone className="w-7 h-7 text-white" />
          </button>
        </div>
      </div>
    </div>
  );
}
