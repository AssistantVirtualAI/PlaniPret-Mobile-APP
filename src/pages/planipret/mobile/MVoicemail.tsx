import { useEffect, useRef, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Mic, Play, Pause, Phone, Save, Forward, Trash2, FileText, X } from "lucide-react";
import type { PlanipretMobileContext } from "../PlanipretMobile";
import GreetingStudio from "@/components/planipret/mobile/voicemail/GreetingStudio";
import { useMplanipretLang } from "@/hooks/useMplanipretLang";

const PRIMARY = "var(--pp-brand-accent-2)";

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


  return (
    <div className="p-4">
      <header className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-bold" style={{ color: "var(--pp-text-primary)" }}>{t("voicemail.title")}</h1>
          {unreadInbox > 0 && <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-red-500 text-white text-[10px] font-semibold flex items-center justify-center">{unreadInbox}</span>}
        </div>
      </header>

      <div className="flex gap-2 mb-3">
        {(["greeting", "inbox", "saved"] as const).map((k) => (
          <button key={k} onClick={() => setTab(k)}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition ${tab === k ? "text-white shadow-sm" : "bg-white text-slate-600"}`}
            style={tab === k ? { background: PRIMARY } : undefined}>
            {t(`voicemail.tabs.${k}`)}
          </button>
        ))}
      </div>

      {tab === "greeting" ? (
        <GreetingStudio profile={profile} onProfileChange={reloadProfile} />
      ) : loading ? (
        <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="bg-white rounded-2xl h-16 animate-pulse" />)}</div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-2xl p-8 text-center shadow-sm mt-8 text-slate-500 text-sm">
          {tab === "inbox" ? t("voicemail.emptyInbox") : t("voicemail.emptySaved")}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((vm) => (
            <div key={vm.id} className="bg-white rounded-2xl shadow-sm overflow-hidden">
              <button onClick={() => { setExpanded(expanded === vm.id ? null : vm.id); markRead(vm); }}
                className="w-full px-3 py-3 flex items-center gap-3 active:bg-slate-50 text-left">
                <div className="relative flex-shrink-0">
                  <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: `${PRIMARY}15`, color: PRIMARY }}>
                    <Mic className="w-5 h-5" />
                  </div>
                  {!vm.is_read && <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-blue-500 border-2 border-white" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm truncate ${vm.is_read ? "" : "font-semibold"}`} style={{ color: "var(--pp-text-primary)" }}>{vm.from_name || vm.from_number || t("common.unknown")}</p>
                  <p className="text-[11px] text-slate-500">{fmtDate(vm.received_at ?? vm.created_at, lang, t)} · {fmtDur(vm.duration_seconds, lang)}</p>
                </div>
                <div className="w-8 h-8 rounded-full flex items-center justify-center text-white" style={{ background: PRIMARY }}>
                  {expanded === vm.id ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
                </div>
              </button>

              {expanded === vm.id && (
                <div className="px-3 pb-3 border-t border-slate-100 animate-fade-in">
                  <AudioPlayer vm={vm} />
                  <div className="mt-3">
                    {vm.transcript ? (
                      <div className="bg-slate-50 rounded-lg p-2 text-xs text-slate-700 whitespace-pre-wrap">{vm.transcript}</div>
                    ) : (
                      <button onClick={() => fetchTranscript(vm)} className="w-full py-2 rounded-lg bg-slate-100 text-xs font-medium text-slate-700 flex items-center justify-center gap-1.5">
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
          ))}
        </div>
      )}

      {forwardFor && (
        <ForwardModal vm={forwardFor} onClose={() => setForwardFor(null)} />
      )}
    </div>
  );
}

function ActionBtn({ icon, label, onClick, danger }: { icon: React.ReactNode; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button onClick={onClick} className={`py-2 rounded-lg text-[11px] font-medium flex flex-col items-center gap-1 ${danger ? "bg-red-50 text-red-600" : "bg-slate-50 text-slate-700"}`}>
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
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    (async () => {
      if (src) return;
      const id = vm.ns_vm_id ?? vm.id;
      const { data } = await supabase.functions.invoke("pp-ns-voicemail", { body: { action: "audio", vm_id: id } });
      const url = (data as any)?.url ?? (data as any)?.audio_url;
      if (url) setSrc(url);
    })();
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

  return (
    <div className="bg-slate-50 rounded-lg p-3 mt-3">
      {src ? <audio ref={audioRef} src={src} onTimeUpdate={(e) => setProgress(e.currentTarget.currentTime)} onLoadedMetadata={(e) => setDur(e.currentTarget.duration)} onEnded={() => setPlaying(false)} hidden /> : null}
      <div className="flex items-center gap-2">
        <button onClick={toggle} disabled={!src} className="w-9 h-9 rounded-full flex items-center justify-center text-white disabled:opacity-40" style={{ background: PRIMARY }}>
          {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
        </button>
        <input type="range" min={0} max={dur || 0} step={0.1} value={progress} onChange={(e) => { const v = +e.target.value; setProgress(v); if (audioRef.current) audioRef.current.currentTime = v; }} className="flex-1" />
        <span className="text-[10px] text-slate-500 tabular-nums">{fmtT(progress)} / {fmtT(dur || 0)}</span>
        <button onClick={cycleSpeed} className="px-2 py-1 rounded bg-white text-[10px] font-semibold text-slate-700">{speed}x</button>
      </div>
      {!src && <p className="text-[10px] text-slate-400 mt-1">{t("voicemail.audioLoading")}</p>}
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
