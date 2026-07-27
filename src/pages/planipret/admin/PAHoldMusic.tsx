import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useMplanipretLang } from "@/hooks/useMplanipretLang";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Music, Sparkles, Wand2, Loader2, Play, Trash2, UploadCloud, RefreshCw, Star,
} from "lucide-react";
import { toast } from "sonner";

type Row = {
  id: string;
  name: string;
  source_text: string | null;
  language: string;
  voice_id: string | null;
  voice_name: string | null;
  music_style: string | null;
  music_volume: number | null;
  duration_seconds: number | null;
  status: "draft" | "generating" | "ready" | "failed";
  error_message: string | null;
  is_default: boolean;
  pushed_at: string | null;
  push_scope: string | null;
  push_result: any;
  audio_url: string | null;
  created_at: string;
};

type Voice = { voice_id: string; name: string };

const MUSIC_STYLES = [
  "piano doux et apaisant",
  "jazz léger instrumental",
  "acoustique chaleureux",
  "corporate moderne discret",
  "ambient minimaliste",
  "cordes cinématiques douces",
];

async function call<T = any>(fn: string, body: any): Promise<T> {
  const { data, error } = await supabase.functions.invoke(fn, { body });
  if (error) throw new Error(error.message);
  if (data && data.success === false) throw new Error(data.error || "Erreur");
  return data as T;
}

export default function PAHoldMusic() {
  const { t } = useMplanipretLang();
  const [rows, setRows] = useState<Row[]>([]);
  const [nsFiles, setNsFiles] = useState<any[]>([]);
  const [nsError, setNsError] = useState<string | null>(null);
  const [voices, setVoices] = useState<Voice[]>([]);
  const [loading, setLoading] = useState(true);

  const [name, setName] = useState("");
  const [text, setText] = useState("");
  const [voiceId, setVoiceId] = useState("");
  const [musicStyle, setMusicStyle] = useState(MUSIC_STYLES[0]);
  const [musicVolume, setMusicVolume] = useState(0.25);
  const [improving, setImproving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [pushingId, setPushingId] = useState<string | null>(null);
  const [scope, setScope] = useState<"domain" | "all_brokers">("domain");
  const [slot, setSlot] = useState("1");
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const load = async () => {
    try {
      const d = await call("pp-moh-list", { action: "list" });
      setRows(d.greetings ?? []);
      setNsFiles(d.ns ?? []);
      setNsError(d.ns_error ?? null);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    supabase.functions.invoke("pp-greeting-voices").then(({ data }) => {
      const list = (data?.voices ?? []) as Voice[];
      setVoices(list);
      if (list[0] && !voiceId) setVoiceId(list[0].voice_id);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const hasPending = useMemo(() => rows.some((r) => r.status === "generating"), [rows]);
  useEffect(() => {
    if (!hasPending) return;
    const id = setInterval(load, 4000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasPending]);

  const improve = async () => {
    if (text.trim().length < 5) return;
    setImproving(true);
    try {
      const d = await call("pp-moh-improve", { text, language: "fr" });
      setText(d.improved);
      toast.success(t("adminPortal.holdMusic.improved") || "Texte amélioré par l'IA");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setImproving(false);
    }
  };

  const generate = async () => {
    setGenerating(true);
    try {
      await call("pp-moh-generate", {
        name, text, voice_id: voiceId,
        voice_name: voices.find((v) => v.voice_id === voiceId)?.name,
        music_style: musicStyle, music_volume: musicVolume, language: "fr",
      });
      toast.success(t("adminPortal.holdMusic.generated") || "Musique d'attente générée");
      setText(""); setName("");
      load();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setGenerating(false);
    }
  };

  const push = async (id: string) => {
    setPushingId(id);
    try {
      const d = await call("pp-moh-push", { id, scope, index: Number(slot) });
      toast.success(
        scope === "domain"
          ? "Poussée sur le domaine PBX"
          : `Poussée vers ${d.programmed}/${d.total} courtiers`,
      );
      load();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setPushingId(null);
    }
  };

  const act = async (action: string, payload: any) => {
    try {
      await call("pp-moh-list", { action, ...payload });
      load();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const play = (url: string | null) => {
    if (!url) return;
    audioRef.current?.pause();
    const a = new Audio(url);
    audioRef.current = a;
    a.play().catch(() => toast.error("Lecture impossible"));
  };

  return (
    <div className="pa-page space-y-5">
      <div>
        <h1 className="flex items-center gap-2" style={{ fontFamily: "Inter,sans-serif", fontWeight: 700, fontSize: 22, color: "var(--pp-text-primary)" }}>
          <Music className="w-5 h-5" style={{ color: "#6C3CE1" }} />
          {t("adminPortal.pageTitles.holdMusic") || "Musique d'attente"}
        </h1>
        <p className="mt-0.5" style={{ fontSize: 12, color: "var(--pp-text-faint)" }}>
          {t("adminPortal.holdMusic.subtitle")
            || "Générez une annonce d'attente (voix IA + musique) et poussez-la vers le système téléphonique."}
        </p>
      </div>

      {/* Composer */}
      <Card className="p-5 space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label>{t("adminPortal.holdMusic.name") || "Nom"}</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Attente — Planiprêt 2026" />
          </div>
          <div className="space-y-2">
            <Label>{t("adminPortal.holdMusic.voice") || "Voix"}</Label>
            <Select value={voiceId} onValueChange={setVoiceId}>
              <SelectTrigger><SelectValue placeholder="Choisir une voix" /></SelectTrigger>
              <SelectContent>
                {voices.map((v) => <SelectItem key={v.voice_id} value={v.voice_id}>{v.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>{t("adminPortal.holdMusic.text") || "Texte de l'annonce"}</Label>
            <Button size="sm" variant="outline" onClick={improve} disabled={improving || text.trim().length < 5}>
              {improving ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : <Sparkles className="w-4 h-4 mr-1.5" />}
              {t("adminPortal.holdMusic.improve") || "Corriger avec l'IA"}
            </Button>
          </div>
          <Textarea rows={5} value={text} onChange={(e) => setText(e.target.value)}
            placeholder="Merci de patienter, un conseiller Planiprêt vous répondra dans quelques instants…" />
          <p className="text-xs text-muted-foreground">{text.trim().length} caractères</p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label>{t("adminPortal.holdMusic.style") || "Style musical"}</Label>
            <Select value={musicStyle} onValueChange={setMusicStyle}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {MUSIC_STYLES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>{t("adminPortal.holdMusic.volume") || "Volume de la musique"} — {Math.round(musicVolume * 100)}%</Label>
            <Slider value={[musicVolume]} min={0} max={0.8} step={0.05}
              onValueChange={(v) => setMusicVolume(v[0])} />
          </div>
        </div>

        <Button onClick={generate} disabled={generating || text.trim().length < 10 || !voiceId}>
          {generating ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : <Wand2 className="w-4 h-4 mr-1.5" />}
          {t("adminPortal.holdMusic.generate") || "Générer la musique d'attente"}
        </Button>
      </Card>

      {/* Push settings */}
      <Card className="p-5 space-y-3">
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-2">
            <Label>{t("adminPortal.holdMusic.scope") || "Portée du déploiement"}</Label>
            <Select value={scope} onValueChange={(v) => setScope(v as any)}>
              <SelectTrigger className="w-64"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="domain">Domaine complet (tout le monde)</SelectItem>
                <SelectItem value="all_brokers">Chaque courtier individuellement</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>{t("adminPortal.holdMusic.slot") || "Emplacement MOH"}</Label>
            <Select value={slot} onValueChange={setSlot}>
              <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
              <SelectContent>
                {[1, 2, 3, 4, 5].map((n) => <SelectItem key={n} value={String(n)}>#{n}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <Button variant="outline" onClick={load}>
            <RefreshCw className="w-4 h-4 mr-1.5" />{t("common.refresh") || "Actualiser"}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          {nsError
            ? `PBX: ${nsError}`
            : `${nsFiles.length} fichier(s) MOH actuellement sur le domaine PBX.`}
        </p>
      </Card>

      {/* Library */}
      <Card className="p-0 overflow-hidden">
        <div className="px-5 py-3 border-b text-sm font-semibold">
          {t("adminPortal.holdMusic.library") || "Bibliothèque"}
        </div>
        {loading ? (
          <div className="p-6 text-sm text-muted-foreground flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" /> Chargement…
          </div>
        ) : rows.length === 0 ? (
          <div className="p-6 text-sm text-muted-foreground">Aucune musique d'attente pour l'instant.</div>
        ) : (
          <div className="divide-y">
            {rows.map((r) => (
              <div key={r.id} className="px-5 py-3 flex items-center gap-3 flex-wrap">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium truncate">{r.name}</span>
                    {r.is_default && <Badge variant="secondary"><Star className="w-3 h-3 mr-1" />Défaut</Badge>}
                    <Badge variant={r.status === "ready" ? "default" : r.status === "failed" ? "destructive" : "secondary"}>
                      {r.status === "generating" ? "Génération…" : r.status}
                    </Badge>
                    {r.pushed_at && (
                      <Badge variant="outline">
                        Poussée · {r.push_scope === "domain" ? "domaine" : `${r.push_result?.ok ?? 0}/${r.push_result?.total ?? 0}`}
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground truncate">
                    {r.voice_name ? `${r.voice_name} · ` : ""}{r.music_style ?? "sans musique"}
                    {r.duration_seconds ? ` · ${r.duration_seconds}s` : ""}
                    {r.error_message ? ` · ${r.error_message}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-1.5">
                  <Button size="sm" variant="ghost" disabled={!r.audio_url} onClick={() => play(r.audio_url)}>
                    <Play className="w-4 h-4" />
                  </Button>
                  <Button size="sm" variant="outline" disabled={r.status !== "ready" || pushingId === r.id}
                    onClick={() => push(r.id)}>
                    {pushingId === r.id
                      ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" />
                      : <UploadCloud className="w-4 h-4 mr-1.5" />}
                    Pousser
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => act("set_default", { id: r.id })}>
                    <Star className="w-4 h-4" />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => act("delete", { id: r.id })}>
                    <Trash2 className="w-4 h-4 text-destructive" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
