import { useEffect, useRef, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Mic, Play, Pause, Phone, Save, Forward, Trash2, FileText, X, Voicemail as VmIcon, Inbox, Bookmark, Sparkles, Loader2, AudioWaveform, PlugZap, CheckCircle2 } from "lucide-react";
import type { PlanipretMobileContext } from "../PlanipretMobile";
import GreetingStudio from "@/components/planipret/mobile/voicemail/GreetingStudio";
import { useMplanipretLang } from "@/hooks/useMplanipretLang";

const PRIMARY = "var(--pp-brand-accent-2)";
const ACCENT = "var(--pp-brand-accent)";

type VM = {
  id: string;
  user_id: string;
  ns_vm_id: string | null;
  folder: string;
  from_number: string | null;
  from_name: string | null;
  duration_seconds: number | null;
  audio_url: string | null;
  transcript: string | null;
  is_read: boolean;
  received_at: string | null;
  created_at: string;
};

const fmtDur = (s: number | null, lang: "fr" | "en") => {
  if (!s) return "—";
  const m = Math.floor(s / 60); const r = s % 60;
  if (m === 0) return lang === "en" ? `${r}s` : `${r} sec`;
  return lang === "en" ? `${m}m ${String(r).padStart(2, "0")}s` : `${m} min ${String(r).padStart(2, "0")} sec`;
};

const fmtDate = (iso: string, lang: "fr" | "en", t: (key: string) => string) => {
  const d = new Date(iso);
  const now = new Date();
  const yest = new Date(); yest.setDate(now.getDate() - 1);
  const locale = lang === "en" ? "en-CA" : "fr-CA";
  const hh = d.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
  if (d.toDateString() === now.toDateString()) return `${t("common.today")} ${hh}`;
  if (d.toDateString() === yest.toDateString()) return `${t("common.yesterday")} ${hh}`;
  return d.toLocaleDateString(locale, { day: "2-digit", month: "short" }) + ` ${hh}`;
};

export default function MVoicemail() {
  const { t, lang } = useMplanipretLang();
  const { profile, openDialer, registerRefresh, reloadProfile } = useOutletContext<PlanipretMobileContext>();
  const [tab, setTab] = useState<"greeting" | "inbox" | "saved">("greeting");
  const [items, setItems] = useState<VM[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [forwardFor, setForwardFor] = useState<VM | null>(null);

  const load = async () => {
    if (!profile?.user_id) return;
    setLoading(true);
    try {
      // 1) NS-API live via pp-ns-voicemail (segmenté par extension côté serveur)
      const folder = tab === "saved" ? "saved" : "inbox";
      const { data, error } = await supabase.functions.invoke("pp-ns-voicemail", {
        body: { action: "list", folder },
      });
      if (error) throw error;
      const nsItems: any[] = ((data as any)?.items ?? []);

      // 2) Fallback / enrichissement cache local
      const { data: local } = await supabase
        .from("planipret_voicemails")
        .select("*")
        .eq("user_id", profile.user_id)
        .order("created_at", { ascending: false });

      const byVmId = new Map<string, VM>();
      (local ?? []).forEach((r: any) => { if (r.vm_id || r.ns_vm_id) byVmId.set(r.vm_id ?? r.ns_vm_id, r); });

      const merged: VM[] = nsItems.length
        ? nsItems.map((v: any, i: number) => {
            const id = v.vm_id ?? v.id ?? `ns-${i}`;
            const enriched = byVmId.get(id);
            return {
              id: enriched?.id ?? id,
              user_id: profile.user_id,
              ns_vm_id: id,
              folder,
              from_number: v.from_number ?? v.caller ?? null,
              from_name: v.from_name ?? v.caller_name ?? null,
              duration_seconds: v.duration ?? v.duration_seconds ?? null,
              audio_url: enriched?.audio_url ?? null,
              transcript: enriched?.transcript ?? null,
              is_read: v.is_read ?? v.read ?? enriched?.is_read ?? false,
              received_at: v.created_at ?? v.timestamp ?? null,
              created_at: v.created_at ?? new Date().toISOString(),
              ...(enriched ?? {}),
            } as VM;
          })
        : (local ?? []) as VM[];

      setItems(merged);
    } catch (e: any) {
      console.error("[pp-ns-voicemail] list failed", e);
      toast.error(t("voicemail.loadFailed") || "Échec chargement voicemails", { description: e?.message });
      const { data } = await supabase
        .from("planipret_voicemails")
        .select("*")
        .eq("user_id", profile.user_id)
        .order("created_at", { ascending: false });
      setItems((data ?? []) as VM[]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [profile?.user_id, tab]);
  useEffect(() => { registerRefresh(load); return () => registerRefresh(null); }, [profile?.user_id]);

  useEffect(() => {
    if (!profile?.user_id) return;
    const ch = supabase
      .channel("mplanipret-vm")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "planipret_voicemails", filter: `user_id=eq.${profile.user_id}` }, (payload) => {
        const v = payload.new as VM;
        setItems((p) => [v, ...p]);
        toast(`📬 ${t("voicemail.newFrom")} ${v.from_number ?? t("voicemail.unknownLower")}`);
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [profile?.user_id]);

  const filtered = items.filter((v) => v.folder === tab);
  const unreadInbox = items.filter((v) => v.folder === "inbox" && !v.is_read).length;

  const markRead = async (vm: VM) => {
    if (vm.is_read) return;
    setItems((p) => p.map((x) => x.id === vm.id ? { ...x, is_read: true } : x));
    await supabase.from("planipret_voicemails").update({ is_read: true }).eq("id", vm.id);
    if (vm.ns_vm_id) {
      supabase.functions.invoke("pp-ns-voicemail", {
        body: { action: "mark-read", vm_id: vm.ns_vm_id },
      }).catch(() => null);
    }
  };

  const removeVm = async (vm: VM) => {
    if (!confirm(t("voicemail.deleteConfirm"))) return;
    if (vm.ns_vm_id) {
      await supabase.functions.invoke("pp-ns-voicemail", {
        body: { action: "delete", vm_id: vm.ns_vm_id },
      }).catch(() => null);
    }
    await supabase.from("planipret_voicemails").delete().eq("id", vm.id);
    setItems((p) => p.filter((x) => x.id !== vm.id));
    toast.success(t("voicemail.deleted"));
  };

  const saveVm = async (vm: VM) => {
    if (vm.ns_vm_id) {
      await supabase.functions.invoke("pp-ns-voicemail", {
        body: { action: "move", vm_id: vm.ns_vm_id, folder: "saved" },
      }).catch(() => null);
    }
    await supabase.from("planipret_voicemails").update({ folder: "saved" }).eq("id", vm.id);
    setItems((p) => p.map((x) => x.id === vm.id ? { ...x, folder: "saved" } : x));
    toast.success(t("voicemail.saved"));
  };

  const fetchTranscript = async (vm: VM) => {
    const { data, error } = await supabase.functions.invoke("ns-transcription", { body: { vm_id: vm.ns_vm_id ?? vm.id } });
    if (error || (data as any)?.success === false) { toast.error(t("voicemail.transcriptFailed")); return; }
    const txt = (data as any)?.transcript ?? (data as any)?.data?.transcript ?? "";
    if (txt) {
      await supabase.from("planipret_voicemails").update({ transcript: txt }).eq("id", vm.id);
      setItems((p) => p.map((x) => x.id === vm.id ? { ...x, transcript: txt } : x));
    }
  };


  const savedCount = items.filter((v) => v.folder === "saved").length;
  const inboxCount = items.filter((v) => v.folder === "inbox").length;

  const tabMeta: Record<"greeting" | "inbox" | "saved", { icon: React.ReactNode; badge?: number }> = {
    greeting: { icon: <Sparkles className="w-3.5 h-3.5" /> },
    inbox: { icon: <Inbox className="w-3.5 h-3.5" />, badge: inboxCount },
    saved: { icon: <Bookmark className="w-3.5 h-3.5" />, badge: savedCount },
  };

  return (
    <div className="p-4 space-y-4 pb-6">
      {/* Header — cohérent avec les autres pages */}
      <header className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-2xl flex items-center justify-center" style={{ background: "rgba(34,211,238,0.15)", border: "1px solid rgba(34,211,238,0.30)", color: "var(--pp-brand-accent)" }}>
          <VmIcon className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-[18px] font-bold leading-tight" style={{ color: "var(--pp-text-primary)" }}>{t("voicemail.title")}</h1>
          <p className="text-[11px]" style={{ color: "var(--pp-text-muted)" }}>
            {unreadInbox > 0
              ? `${unreadInbox} ${t("voicemail.newFrom") || "nouveaux messages"}`
              : t("voicemail.emptyInbox") || "Boîte à jour"}
          </p>
        </div>
        {unreadInbox > 0 && (
          <span className="pp-pill pp-pill-accent">{unreadInbox}</span>
        )}
      </header>

      {/* Segmented tabs */}
      <div className="pp-segmented w-full flex">
        {(["greeting", "inbox", "saved"] as const).map((k) => {
          const active = tab === k;
          const meta = tabMeta[k];
          return (
            <button
              key={k}
              onClick={() => setTab(k)}
              className={`flex-1 flex items-center justify-center gap-1.5 ${active ? "is-active" : ""}`}
            >
              {meta.icon}
              <span>{t(`voicemail.tabs.${k}`)}</span>
              {!!meta.badge && meta.badge > 0 && (
                <span className="ml-0.5 min-w-[16px] h-[16px] px-1 rounded-full text-[9px] font-bold flex items-center justify-center"
                  style={active ? { background: "rgba(34,211,238,0.25)", color: "var(--pp-brand-accent)" } : { background: "var(--pp-bg-elevated)", color: "var(--pp-text-secondary)" }}>
                  {meta.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div>
        {tab === "greeting" ? (
          <div className="space-y-3">
            <div className="pp-card p-4 overflow-hidden relative">
              <div className="absolute inset-x-0 top-0 h-[2px]" style={{ background: "linear-gradient(90deg, transparent, var(--pp-brand-accent), var(--pp-agent), transparent)" }} />
              <div className="flex items-start gap-3">
                <div className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0" style={{ background: "rgba(46,155,220,0.12)", border: "1px solid rgba(46,155,220,0.28)", color: "var(--pp-brand-accent)" }}>
                  <PlugZap className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h2 className="text-[15px] font-bold" style={{ color: "var(--pp-text-primary)" }}>ElevenLabs</h2>
                    <span className="pp-pill pp-pill-success"><CheckCircle2 className="w-3 h-3" /> Connecté</span>
                  </div>
                  <p className="text-[11px] leading-relaxed mt-1" style={{ color: "var(--pp-text-secondary)" }}>
                    Voix IA, aperçu audio et activation NetSapiens synchronisés au profil du courtier.
                  </p>
                </div>
              </div>
            </div>
            <GreetingStudio profile={profile} onProfileChange={reloadProfile} />
          </div>
        ) : loading ? (
          <div className="space-y-2.5" aria-busy="true" aria-live="polite">
            <div className="flex items-center gap-2 px-1 pb-1">
              <Loader2 className="w-3.5 h-3.5 animate-spin" style={{ color: PRIMARY }} />
              <span className="text-[11px] font-medium" style={{ color: "var(--pp-text-secondary)" }}>
                {t("voicemail.loading") || "Chargement des messages…"}
              </span>
            </div>
              {Array.from({ length: 5 }).map((_, i) => (
                <div
                  key={i}
                  className="bg-white rounded-2xl px-3.5 py-3 flex items-center gap-3 border border-slate-100 shadow-sm overflow-hidden relative"
                  style={{ animation: `pp-vm-pulse 1.4s ease-in-out ${i * 0.08}s infinite` }}
                >
                  <div className="w-11 h-11 rounded-2xl bg-slate-200/70" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3 rounded-full bg-slate-200/70" style={{ width: `${55 + (i % 3) * 12}%` }} />
                    <div className="h-2.5 rounded-full bg-slate-200/60 w-1/3" />
                  </div>
                  <div className="w-9 h-9 rounded-full bg-slate-200/70" />
                </div>
              ))}
              <style>{`@keyframes pp-vm-pulse{0%,100%{opacity:1}50%{opacity:.55}}`}</style>
            </div>
          
          ) : filtered.length === 0 ? (
            <div className="bg-white rounded-3xl p-10 text-center shadow-sm border border-slate-100 mt-4">
              <div
                className="w-16 h-16 mx-auto rounded-2xl flex items-center justify-center mb-3"
                style={{ background: `linear-gradient(135deg, ${PRIMARY}15, ${ACCENT}15)`, color: PRIMARY }}
              >
                {tab === "inbox" ? <Inbox className="w-7 h-7" /> : <Bookmark className="w-7 h-7" />}
              </div>
              <p className="font-semibold text-sm" style={{ color: "var(--pp-text-primary)" }}>
                {tab === "inbox" ? t("voicemail.emptyInbox") : t("voicemail.emptySaved")}
              </p>
              <p className="text-[11px] mt-1 text-slate-500">
                {tab === "inbox" ? "Les nouveaux messages apparaîtront ici" : "Sauvegardez vos messages importants"}
              </p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {filtered.map((vm) => {
                const isOpen = expanded === vm.id;
                return (
                  <div
                    key={vm.id}
                    className={`bg-white rounded-2xl overflow-hidden border transition-all ${
                      isOpen ? "shadow-lg border-transparent ring-1" : "shadow-sm border-slate-100"
                    }`}
                    style={isOpen ? ({ ["--tw-ring-color" as any]: `${PRIMARY}30` } as any) : undefined}
                  >
                    <button
                      onClick={() => { setExpanded(isOpen ? null : vm.id); markRead(vm); }}
                      className="w-full px-3.5 py-3 flex items-center gap-3 active:bg-slate-50 text-left"
                    >
                      <div className="relative flex-shrink-0">
                        <div
                          className="w-11 h-11 rounded-2xl flex items-center justify-center"
                          style={{
                            background: vm.is_read
                              ? "var(--pp-bg-elevated)"
                              : `linear-gradient(135deg, ${PRIMARY}20, ${ACCENT}20)`,
                            color: PRIMARY,
                          }}
                        >
                          <Mic className="w-5 h-5" />
                        </div>
                        {!vm.is_read && (
                          <span
                            className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white"
                            style={{ background: ACCENT }}
                          />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p
                          className={`text-[13px] truncate ${vm.is_read ? "font-medium" : "font-semibold"}`}
                          style={{ color: "var(--pp-text-primary)" }}
                        >
                          {vm.from_name || vm.from_number || t("common.unknown")}
                        </p>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="text-[10.5px] text-slate-500">{fmtDate(vm.received_at ?? vm.created_at, lang, t)}</span>
                          <span className="w-1 h-1 rounded-full bg-slate-300" />
                          <span className="text-[10.5px] text-slate-500 tabular-nums">{fmtDur(vm.duration_seconds, lang)}</span>
                        </div>
                      </div>
                      <div
                        className="w-9 h-9 rounded-full flex items-center justify-center text-white shadow-sm transition-transform"
                        style={{
                          background: `linear-gradient(135deg, ${PRIMARY}, ${ACCENT})`,
                          transform: isOpen ? "scale(1.05)" : "scale(1)",
                        }}
                      >
                        {isOpen ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
                      </div>
                    </button>

                    {isOpen && (
                      <div className="px-3.5 pb-3.5 border-t border-slate-100 animate-fade-in">
                        <AudioPlayer vm={vm} />
                        <div className="mt-3">
                          {vm.transcript ? (
                            <div className="rounded-xl p-3 text-[12px] leading-relaxed whitespace-pre-wrap border" style={{ background: "var(--pp-bg-elevated)", color: "var(--pp-text-primary)", borderColor: "var(--pp-bg-border)" }}>
                              <div className="flex items-center gap-1.5 mb-1.5 text-[10px] font-semibold uppercase tracking-wider" style={{ color: PRIMARY }}>
                                <FileText className="w-3 h-3" /> Transcription
                              </div>
                              {vm.transcript}
                            </div>
                          ) : (
                            <button
                              onClick={() => fetchTranscript(vm)}
                              className="w-full py-2.5 rounded-xl text-[12px] font-semibold flex items-center justify-center gap-1.5 border transition-colors"
                              style={{ background: "var(--pp-bg-elevated)", color: PRIMARY, borderColor: "var(--pp-bg-border)" }}
                            >
                              <FileText className="w-3.5 h-3.5" /> {t("voicemail.getTranscript")}
                            </button>
                          )}
                        </div>
                        <div className="grid grid-cols-4 gap-1.5 mt-3">
                          <ActionBtn icon={<Phone className="w-4 h-4" />} label={t("common.callBack")} onClick={() => openDialer(vm.from_number ?? "")} />
                          {tab === "inbox" && <ActionBtn icon={<Save className="w-4 h-4" />} label={t("voicemail.saveShort")} onClick={() => saveVm(vm)} />}
                          <ActionBtn icon={<Forward className="w-4 h-4" />} label={t("voicemail.forward")} onClick={() => setForwardFor(vm)} />
                          <ActionBtn icon={<Trash2 className="w-4 h-4" />} label={t("voicemail.deleteShort")} onClick={() => removeVm(vm)} danger />
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
      </div>


      {forwardFor && (
        <ForwardModal vm={forwardFor} onClose={() => setForwardFor(null)} />
      )}
    </div>
  );
}

function ActionBtn({ icon, label, onClick, danger }: { icon: React.ReactNode; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      className="py-2.5 rounded-xl text-[10.5px] font-semibold flex flex-col items-center gap-1 border transition-all active:scale-95"
      style={
        danger
          ? { background: "#FEF2F2", color: "#DC2626", borderColor: "#FEE2E2" }
          : { background: "var(--pp-bg-elevated)", color: "var(--pp-text-secondary)", borderColor: "var(--pp-bg-border)" }
      }
    >
      {icon}<span>{label}</span>
    </button>
  );
}

function AudioPlayer({ vm }: { vm: VM }) {
  const { t } = useMplanipretLang();
  const [src, setSrc] = useState<string | null>(vm.audio_url);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [dur, setDur] = useState(vm.duration_seconds ?? 0);
  const [speed, setSpeed] = useState(1);
  const [buffering, setBuffering] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);
  const loadingAudio = !src;

  const fetchAudio = async () => {
    setLoadError(false);
    const id = vm.ns_vm_id ?? vm.id;
    try {
      const { data, error } = await supabase.functions.invoke("pp-ns-voicemail", { body: { action: "audio", vm_id: id } });
      if (error) throw error;
      const url = (data as any)?.url ?? (data as any)?.audio_url;
      if (url) setSrc(url); else setLoadError(true);
    } catch {
      setLoadError(true);
    }
  };

  useEffect(() => {
    if (src) return;
    fetchAudio();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vm.id]);

  const toggle = () => {
    const a = audioRef.current; if (!a) return;
    if (a.paused) { a.play(); setPlaying(true); } else { a.pause(); setPlaying(false); }
  };

  const cycleSpeed = () => {
    const next = speed === 1 ? 1.5 : speed === 1.5 ? 2 : 1;
    setSpeed(next);
    if (audioRef.current) audioRef.current.playbackRate = next;
  };

  const fmtT = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
  const pct = dur > 0 ? Math.min(100, (progress / dur) * 100) : 0;

  // Deterministic pseudo-waveform bars (32 bars, seeded by vm.id length)
  const seed = (vm.id?.length ?? 8) + 3;
  const bars = Array.from({ length: 32 }, (_, i) => 30 + Math.abs(Math.sin(i * 0.7 + seed)) * 70);

  return (
    <div
      className="rounded-2xl p-3 mt-3 border"
      style={{
        background: `linear-gradient(135deg, ${PRIMARY}08, ${ACCENT}08)`,
        borderColor: "var(--pp-bg-border)",
      }}
    >
      {src ? (
        <audio
          ref={audioRef}
          src={src}
          onTimeUpdate={(e) => setProgress(e.currentTarget.currentTime)}
          onLoadedMetadata={(e) => setDur(e.currentTarget.duration)}
          onWaiting={() => setBuffering(true)}
          onPlaying={() => { setBuffering(false); setPlaying(true); }}
          onPause={() => setPlaying(false)}
          onEnded={() => { setPlaying(false); setProgress(0); }}
          onError={() => setLoadError(true)}
          hidden
        />
      ) : null}

      {/* Waveform / skeleton */}
      <div className="flex items-end justify-between h-10 gap-[2px] mb-2">
        {loadingAudio
          ? Array.from({ length: 32 }).map((_, i) => (
              <div
                key={i}
                className="flex-1 rounded-sm bg-slate-200/70"
                style={{
                  height: `${25 + Math.abs(Math.sin(i * 0.9)) * 60}%`,
                  animation: `pp-vm-wave 1.2s ease-in-out ${i * 0.03}s infinite`,
                }}
              />
            ))
          : bars.map((h, i) => {
              const filled = (i / bars.length) * 100 < pct;
              return (
                <div
                  key={i}
                  className="flex-1 rounded-sm transition-colors"
                  style={{
                    height: `${h}%`,
                    background: filled ? `linear-gradient(180deg, ${ACCENT}, ${PRIMARY})` : "rgba(148,163,184,0.35)",
                    opacity: filled ? 1 : 0.7,
                  }}
                />
              );
            })}
        <style>{`@keyframes pp-vm-wave{0%,100%{opacity:.4}50%{opacity:.9}}`}</style>
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={toggle}
          disabled={!src}
          aria-label={playing ? "Pause" : "Play"}
          className="w-11 h-11 rounded-full flex items-center justify-center text-white shadow-md disabled:opacity-40 flex-shrink-0 active:scale-95 transition-transform relative"
          style={{ background: `linear-gradient(135deg, ${PRIMARY}, ${ACCENT})` }}
        >
          {loadingAudio || buffering ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : playing ? (
            <Pause className="w-5 h-5" />
          ) : (
            <Play className="w-5 h-5 ml-0.5" />
          )}
          {playing && !buffering && (
            <span
              className="absolute -bottom-1 -right-1 w-3 h-3 rounded-full border-2 border-white"
              style={{ background: "#22C55E", animation: "pp-vm-pulse 1.2s ease-in-out infinite" }}
            />
          )}
        </button>
        <div className="flex-1 min-w-0">
          <div className="relative h-1.5 rounded-full bg-slate-200/70 overflow-hidden">
            <div
              className="absolute inset-y-0 left-0 rounded-full transition-[width]"
              style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${PRIMARY}, ${ACCENT})` }}
            />
            <input
              type="range"
              min={0}
              max={dur || 0}
              step={0.1}
              value={progress}
              disabled={!src}
              onChange={(e) => { const v = +e.target.value; setProgress(v); if (audioRef.current) audioRef.current.currentTime = v; }}
              className="absolute inset-0 w-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
              aria-label="Position lecture"
            />
          </div>
          <div className="flex items-center justify-between mt-1.5">
            <span className="text-[10px] tabular-nums font-medium flex items-center gap-1" style={{ color: playing ? PRIMARY : "var(--pp-text-secondary)" }}>
              {playing && <AudioWaveform className="w-2.5 h-2.5" />}
              {fmtT(progress)}
            </span>
            <span className="text-[10px] text-slate-400 tabular-nums">-{fmtT(Math.max(0, (dur || 0) - progress))}</span>
          </div>
        </div>
        <button
          onClick={cycleSpeed}
          disabled={!src}
          className="px-2.5 py-1.5 rounded-lg text-[10px] font-bold tabular-nums border transition-colors flex-shrink-0 disabled:opacity-40"
          style={{ background: "#fff", color: PRIMARY, borderColor: `${PRIMARY}30` }}
        >
          {speed}×
        </button>
      </div>

      {loadingAudio && !loadError && (
        <div className="flex items-center gap-2 mt-2.5 px-1">
          <Loader2 className="w-3 h-3 animate-spin" style={{ color: PRIMARY }} />
          <p className="text-[10.5px] font-medium" style={{ color: "var(--pp-text-secondary)" }}>
            {t("voicemail.audioLoading") || "Chargement de l'audio…"}
          </p>
        </div>
      )}
      {loadError && (
        <div className="flex items-center justify-between gap-2 mt-2.5 px-1">
          <p className="text-[10.5px] font-medium" style={{ color: "#DC2626" }}>
            {t("voicemail.audioFailed") || "Audio indisponible"}
          </p>
          <button
            onClick={fetchAudio}
            className="text-[10.5px] font-semibold px-2 py-1 rounded-md"
            style={{ background: "#fff", color: PRIMARY, border: `1px solid ${PRIMARY}30` }}
          >
            {t("common.retry") || "Réessayer"}
          </button>
        </div>
      )}
    </div>
  );
}

function ForwardModal({ vm, onClose }: { vm: VM; onClose: () => void }) {
  const { t } = useMplanipretLang();
  const [ext, setExt] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!ext.trim()) return;
    setBusy(true);
    const { data, error } = await supabase.functions.invoke("pp-ns-voicemail", { body: { action: "forward", vm_id: vm.ns_vm_id ?? vm.id, to_user: ext.trim() } });
    setBusy(false);
    if (error || (data as any)?.success === false) { toast.error(t("voicemail.forwardFailed")); return; }
    toast.success(t("voicemail.forwarded"));
    onClose();
  };
  return (
    <div className="absolute inset-0 z-40 flex items-end md:items-center md:justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white w-full md:w-[360px] rounded-t-2xl md:rounded-2xl p-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold" style={{ color: "var(--pp-text-primary)" }}>{t("voicemail.forwardTitle")}</h2>
          <button onClick={onClose} className="p-1 rounded-full hover:bg-slate-100"><X className="w-4 h-4" /></button>
        </div>
        <input value={ext} onChange={(e) => setExt(e.target.value)} placeholder={t("voicemail.extensionOrUser")} className="w-full px-3 py-2.5 rounded-lg border border-slate-200 text-sm" />
        <button onClick={submit} disabled={!ext.trim() || busy} className="w-full mt-3 py-2.5 rounded-lg text-white text-sm font-medium disabled:opacity-50" style={{ background: PRIMARY }}>
          {busy ? t("voicemail.sending") : t("voicemail.transfer")}
        </button>
      </div>
    </div>
  );
}
