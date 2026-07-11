// Full-screen in-call UI driven by SIP.js (ppSipProvider).
// Auto-opens for outbound ringing, inbound ringing, active, and held states.
// Provides: mute, hold, DTMF keypad, blind transfer with internal contact search,
// hangup / answer / reject.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import {
  Mic, MicOff, Pause, Play, PhoneForwarded, Grid3X3, PhoneOff, Phone,
  User, Search, X, ChevronLeft, Activity, Volume2, VolumeX,
} from "lucide-react";
import { useMplanipretLang } from "@/hooks/useMplanipretLang";
import type { useMplanipretSoftphone } from "@/hooks/useMplanipretSoftphone";
import PpCallDiagnosticPanel from "./PpCallDiagnosticPanel";

type Contact = {
  id?: string;
  first_name?: string;
  last_name?: string;
  name?: string;
  extension?: string;
  phone?: string;
  cell_phone?: string;
  work_phone?: string;
  home_phone?: string;
  email?: string;
  source?: "personal" | "shared" | "directory";
};

function fmt(sec: number) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function contactName(c: Contact) {
  const n = [c.first_name, c.last_name].filter(Boolean).join(" ").trim();
  return n || c.name || c.email || c.extension || c.phone || "—";
}
function contactDialTarget(c: Contact) {
  return c.extension || c.cell_phone || c.phone || c.work_phone || c.home_phone || "";
}

export default function PpActiveCallScreen({
  softphone,
}: {
  softphone: ReturnType<typeof useMplanipretSoftphone>;
}) {
  const { t } = useMplanipretLang();
  const { snap, answer, hangup, mute, unmute, hold, unhold, sendDTMF, transfer, setAudioEl } = softphone;

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [view, setView] = useState<"main" | "keypad" | "transfer">("main");
  const [dtmfBuf, setDtmfBuf] = useState("");
  const [transferQuery, setTransferQuery] = useState("");
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loadingContacts, setLoadingContacts] = useState(false);
  const [diagOpen, setDiagOpen] = useState(false);
  const [speakerOn, setSpeakerOn] = useState(false);

  useEffect(() => { setAudioEl(audioRef.current); return () => setAudioEl(null); }, [setAudioEl]);

  const active = snap.callState === "ringing-out" || snap.callState === "ringing-in"
    || snap.callState === "active" || snap.callState === "held";

  // Reset transient state each new call
  useEffect(() => {
    if (!active) { setView("main"); setDtmfBuf(""); setTransferQuery(""); setElapsed(0); }
  }, [active]);

  // Duration timer for connected calls
  useEffect(() => {
    if (snap.callState !== "active" || !snap.startedAt) return;
    const tick = () => setElapsed(Math.max(0, Math.floor((Date.now() - (snap.startedAt ?? Date.now())) / 1000)));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [snap.callState, snap.startedAt]);

  // Load internal contacts when entering transfer view (once)
  useEffect(() => {
    if (view !== "transfer" || contacts.length > 0 || loadingContacts) return;
    let cancelled = false;
    (async () => {
      setLoadingContacts(true);
      try {
        const results: Contact[] = [];
        const [personal, shared, directory] = await Promise.all([
          supabase.functions.invoke("pp-ns-contacts", { body: { action: "list" } }),
          supabase.functions.invoke("pp-ns-contacts", { body: { action: "shared" } }),
          supabase.functions.invoke("pp-ns-contacts", { body: { action: "directory" } }),
        ]);
        for (const c of ((personal.data as any)?.contacts ?? [])) results.push({ ...c, source: "personal" });
        for (const c of ((shared.data as any)?.contacts ?? [])) results.push({ ...c, source: "shared" });
        for (const c of ((directory.data as any)?.directory ?? [])) results.push({ ...c, source: "directory" });
        if (!cancelled) setContacts(results);
      } catch (e) {
        console.error("[PpActiveCallScreen] contacts load failed", e);
      } finally {
        if (!cancelled) setLoadingContacts(false);
      }
    })();
    return () => { cancelled = true; };
  }, [view, contacts.length, loadingContacts]);

  const filteredContacts = useMemo(() => {
    const q = transferQuery.trim().toLowerCase();
    const dedup = new Map<string, Contact>();
    for (const c of contacts) {
      const key = `${c.extension ?? ""}|${c.phone ?? ""}|${contactName(c)}`;
      if (!dedup.has(key)) dedup.set(key, c);
    }
    const list = Array.from(dedup.values());
    if (!q) return list.slice(0, 60);
    return list.filter((c) => {
      const hay = [contactName(c), c.extension, c.phone, c.cell_phone, c.work_phone, c.email]
        .filter(Boolean).join(" ").toLowerCase();
      return hay.includes(q);
    }).slice(0, 60);
  }, [contacts, transferQuery]);

  const pressDtmf = useCallback((k: string) => { setDtmfBuf((b) => (b + k).slice(-16)); sendDTMF(k); }, [sendDTMF]);
  const doTransfer = useCallback((target: string) => {
    const to = target.trim(); if (!to) return;
    transfer(to);
    setView("main");
    setTransferQuery("");
    // Blind transfer → hang up local leg after a short delay
    setTimeout(() => hangup(), 400);
  }, [transfer, hangup]);

  if (!active) {
    return <audio ref={audioRef} autoPlay style={{ display: "none" }} />;
  }

  const isIncoming = snap.callState === "ringing-in";
  const isOutgoingRinging = snap.callState === "ringing-out";
  const isHeld = snap.callState === "held";
  const displayName = snap.remoteIdentity || snap.remoteNumber || "—";
  const displayNumber = snap.remoteNumber && snap.remoteNumber !== displayName ? snap.remoteNumber : null;
  const statusText = isIncoming ? (t("call.incoming") || "Appel entrant")
    : isOutgoingRinging ? (t("call.ringing") || "Sonnerie…")
    : isHeld ? (t("call.onHold") || "En attente")
    : fmt(elapsed);

  const KEYS = ["1","2","3","4","5","6","7","8","9","*","0","#"];

  return (
    <AnimatePresence>
      <motion.div
        key="pp-in-call"
        className="fixed inset-0 z-[80] flex flex-col overflow-hidden"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        style={{
          background: "linear-gradient(160deg, #060D1A 0%, #0A1425 55%, #0D2540 100%)",
          color: "white",
          paddingTop: "env(safe-area-inset-top, 0px)",
          paddingBottom: "env(safe-area-inset-bottom, 0px)",
        }}
      >
        <audio ref={audioRef} autoPlay style={{ display: "none" }} />

        {/* Header */}
        <div className="flex items-center justify-between px-4 pt-4">
          {view !== "main" ? (
            <button onClick={() => setView("main")} className="p-2 rounded-full" style={{ background: "rgba(255,255,255,0.08)" }}>
              <ChevronLeft className="w-5 h-5" />
            </button>
          ) : <div className="w-9" />}
          <div className="text-xs text-white/60 uppercase tracking-widest">
            {view === "keypad" ? "Clavier" : view === "transfer" ? "Transférer" : (isIncoming ? "Entrant" : isOutgoingRinging ? "Sortant" : "En cours")}
          </div>
          <button onClick={() => setDiagOpen(true)} aria-label="Diagnostic" className="p-2 rounded-full" style={{ background: "rgba(255,255,255,0.08)" }}>
            <Activity className="w-4 h-4" />
          </button>
        </div>

        <PpCallDiagnosticPanel open={diagOpen} onClose={() => setDiagOpen(false)} snap={snap} />

        {/* Identity */}
        {view === "main" && (
          <div className="flex-1 min-h-0 flex flex-col items-center justify-center px-6 pb-4">
            <div className="w-28 h-28 rounded-full flex items-center justify-center mb-5"
              style={{ background: "linear-gradient(135deg, #1A4A8A, #2E9BDC)", boxShadow: "0 10px 40px rgba(46,155,220,0.5)" }}>
              <User className="w-12 h-12" />
            </div>
            <div className="text-2xl font-semibold tracking-tight text-center">{displayName}</div>
            {displayNumber && <div className="text-sm text-white/60 mt-1">{displayNumber}</div>}
            <div className="mt-3 text-sm text-white/70">{statusText}</div>
            {dtmfBuf && <div className="mt-2 text-xs text-white/50">DTMF: {dtmfBuf}</div>}
            {snap.errorCause && <div className="mt-2 text-xs" style={{ color: "#FCA5A5" }}>{snap.errorCause}</div>}
          </div>
        )}

        {/* Keypad view */}
        {view === "keypad" && (
          <div className="flex-1 flex flex-col items-center justify-center px-8">
            <div className="text-lg text-white/80 mb-4 min-h-[24px]">{dtmfBuf || "—"}</div>
            <div className="grid grid-cols-3 gap-4" style={{ maxWidth: 300 }}>
              {KEYS.map((k) => (
                <button key={k} onClick={() => pressDtmf(k)}
                  className="w-20 h-20 rounded-full text-3xl font-semibold active:scale-95 transition mx-auto"
                  style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.15)" }}>
                  {k}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Transfer view */}
        {view === "transfer" && (
          <div className="flex-1 flex flex-col px-5 pt-2 min-h-0">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-white/50" />
              <input
                autoFocus value={transferQuery} onChange={(e) => setTransferQuery(e.target.value)}
                placeholder="Nom, extension ou numéro…"
                className="w-full pl-9 pr-9 py-3 rounded-2xl bg-transparent outline-none text-white text-sm"
                style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.2)" }}
              />
              {transferQuery && (
                <button onClick={() => setTransferQuery("")} className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-full" style={{ color: "rgba(255,255,255,0.6)" }}>
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Quick action: transfer to typed string as-is */}
            {transferQuery.trim() && !filteredContacts.some((c) => contactDialTarget(c) === transferQuery.trim()) && (
              <button
                onClick={() => doTransfer(transferQuery.trim())}
                className="mt-3 w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left"
                style={{ background: "rgba(46,155,220,0.15)", border: "1px solid rgba(46,155,220,0.35)" }}
              >
                <PhoneForwarded className="w-4 h-4" />
                <span className="text-sm">Transférer vers <b>{transferQuery.trim()}</b></span>
              </button>
            )}

            <div className="mt-3 flex-1 overflow-y-auto min-h-0">
              {loadingContacts && <div className="text-center text-white/60 text-sm py-6">Chargement…</div>}
              {!loadingContacts && filteredContacts.length === 0 && (
                <div className="text-center text-white/50 text-sm py-6">Aucun contact</div>
              )}
              <div className="flex flex-col gap-1">
                {filteredContacts.map((c, i) => {
                  const tgt = contactDialTarget(c);
                  const name = contactName(c);
                  return (
                    <button
                      key={`${name}-${tgt}-${i}`}
                      onClick={() => tgt && doTransfer(tgt)}
                      disabled={!tgt}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-left active:scale-[0.99] transition disabled:opacity-40"
                      style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}
                    >
                      <div className="w-9 h-9 rounded-full flex items-center justify-center" style={{ background: "rgba(46,155,220,0.2)" }}>
                        <User className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{name}</div>
                        <div className="text-[11px] text-white/50 truncate">
                          {tgt || "—"}{c.source ? ` · ${c.source}` : ""}
                        </div>
                      </div>
                      <PhoneForwarded className="w-4 h-4 text-white/60" />
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Action bar (main view) — market-standard: all controls visible together */}
        {view === "main" && !isIncoming && (
          <div className="shrink-0 px-4 pb-6">
            <div
              className="grid grid-cols-6 gap-2 rounded-[28px] px-3 py-3"
              style={{ background: "rgba(3,10,22,0.72)", border: "1px solid rgba(255,255,255,0.10)", boxShadow: "0 18px 48px rgba(0,0,0,0.42)", backdropFilter: "blur(18px)" }}
            >
              <CallBtn active={snap.muted} onClick={() => (snap.muted ? unmute() : mute())} icon={snap.muted ? <MicOff /> : <Mic />} label={snap.muted ? "Activer" : "Muet"} />
              <CallBtn active={speakerOn} onClick={() => setSpeakerOn((v) => !v)} icon={speakerOn ? <Volume2 /> : <VolumeX />} label="H.-parleur" />
              <CallBtn active={isHeld} onClick={() => (isHeld ? unhold() : hold())} icon={isHeld ? <Play /> : <Pause />} label={isHeld ? "Reprendre" : "Attente"} />
              <CallBtn onClick={() => setView("transfer")} icon={<PhoneForwarded />} label="Transférer" />
              <CallBtn onClick={() => setView("keypad")} icon={<Grid3X3 />} label="Clavier" />
              <CallBtn danger onClick={() => hangup()} icon={<PhoneOff />} label="Raccrocher" />
            </div>
          </div>
        )}

        {/* Bottom bar: answer/reject only for inbound calls */}
        {isIncoming && <div className="pb-8 pt-2 flex items-center justify-center gap-8">
          <>
              <button onClick={() => hangup()} aria-label="Refuser"
                className="rounded-full flex items-center justify-center active:scale-95 transition"
                style={{ width: 72, height: 72, background: "linear-gradient(135deg, #B91C1C, #E84C4C)", boxShadow: "0 8px 24px rgba(232,76,76,0.5)" }}>
                <PhoneOff className="w-7 h-7" />
              </button>
              <button onClick={() => void answer()} aria-label="Répondre"
                className="rounded-full flex items-center justify-center active:scale-95 transition"
                style={{ width: 72, height: 72, background: "linear-gradient(135deg, #15803D, #22C55E)", boxShadow: "0 8px 24px rgba(34,197,94,0.5)" }}>
                <Phone className="w-7 h-7" />
              </button>
          </>
        </div>}
      </motion.div>
    </AnimatePresence>
  );
}

function CallBtn({ icon, label, onClick, active, danger }: { icon: React.ReactNode; label: string; onClick: () => void; active?: boolean; danger?: boolean }) {
  return (
    <button onClick={onClick} className="flex flex-col items-center gap-1.5 active:scale-95 transition">
      <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-full flex items-center justify-center"
        style={{
          background: danger ? "linear-gradient(135deg, #B91C1C, #E84C4C)" : active ? "rgba(46,155,220,0.25)" : "rgba(255,255,255,0.08)",
          border: `1px solid ${danger ? "rgba(232,76,76,0.55)" : active ? "rgba(46,155,220,0.5)" : "rgba(255,255,255,0.15)"}`,
          boxShadow: danger ? "0 8px 22px rgba(232,76,76,0.45)" : undefined,
          color: "white",
        }}>
        <span className="w-5 h-5 sm:w-6 sm:h-6 flex items-center justify-center [&>svg]:w-5 [&>svg]:h-5 sm:[&>svg]:w-6 sm:[&>svg]:h-6">{icon}</span>
      </div>
      <span className="text-[10px] sm:text-[11px] leading-none text-white/80 max-w-[64px] truncate">{label}</span>
    </button>
  );
}
