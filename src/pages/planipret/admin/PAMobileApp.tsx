import { PAPageHeader } from "@/components/planipret/admin/PAPageShell";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  RefreshCw, Rocket, Save, Smartphone, Upload, RotateCcw, CheckCircle2, AlertTriangle,
} from "lucide-react";
import { useMplanipretLang } from "@/hooks/useMplanipretLang";
import { toast } from "sonner";

type Cfg = {
  flags: Record<string, boolean>;
  messages: Record<string, string>;
  settings: Record<string, unknown>;
  min_version: string | null;
  recommended_version: string | null;
  maintenance_mode: boolean;
  maintenance_message: string | null;
  published_at: string | null;
};

type Release = {
  id: string;
  version: string;
  notes: string | null;
  is_active: boolean;
  bundle_path: string;
  bundle_size: number | null;
  rolled_back_at: string | null;
  created_at: string;
};

const APPS = [
  { key: "planipret", label: "Planiprêt Mobile" },
  { key: "lemtel", label: "AVA Softphone" },
];
const CHANNELS = ["prod", "beta"];

/** Interrupteurs pilotables à distance, sans rebuild natif. */
const FLAG_DEFS: Array<{ key: string; fr: string; en: string }> = [
  { key: "tab_ava", fr: "Onglet AVA", en: "AVA tab" },
  { key: "tab_messages", fr: "Onglet Messages", en: "Messages tab" },
  { key: "tab_contacts", fr: "Onglet Contacts", en: "Contacts tab" },
  { key: "tab_stats", fr: "Onglet Statistiques", en: "Stats tab" },
  { key: "feature_recordings", fr: "Enregistrements d'appels", en: "Call recordings" },
  { key: "feature_voicemail", fr: "Boîte vocale", en: "Voicemail" },
  { key: "feature_ms365", fr: "Microsoft 365", en: "Microsoft 365" },
  { key: "feature_maestro", fr: "Maestro (clients)", en: "Maestro (clients)" },
  { key: "feature_ai_assist", fr: "Assistance IA (textes)", en: "AI writing assist" },
];

const SETTING_DEFS: Array<{ key: string; fr: string; en: string; unit?: string }> = [
  { key: "ring_timeout_seconds", fr: "Durée de sonnerie", en: "Ring timeout", unit: "s" },
  { key: "refresh_interval_seconds", fr: "Rafraîchissement auto", en: "Auto refresh", unit: "s" },
  { key: "support_url", fr: "URL de support", en: "Support URL" },
];

export default function PAMobileApp() {
  const { lang } = useMplanipretLang();
  const fr = lang !== "en";
  const [appKey, setAppKey] = useState("planipret");
  const [channel, setChannel] = useState("prod");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [cfg, setCfg] = useState<Cfg>({
    flags: {}, messages: {}, settings: {},
    min_version: null, recommended_version: null,
    maintenance_mode: false, maintenance_message: null, published_at: null,
  });
  const [releases, setReleases] = useState<Release[]>([]);
  const [newVersion, setNewVersion] = useState("");
  const [newNotes, setNewNotes] = useState("");
  const [bundle, setBundle] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  const call = useCallback(async (fn: string, body: Record<string, unknown>) => {
    const { data, error } = await supabase.functions.invoke(fn, { body });
    if (error) throw error;
    if ((data as any)?.error) throw new Error((data as any).error);
    return data as any;
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await call("mobile-config-admin", { action: "get", app_key: appKey, channel });
      const c = res.config;
      setCfg({
        flags: c?.flags ?? {},
        messages: c?.messages ?? {},
        settings: c?.settings ?? {},
        min_version: c?.min_version ?? null,
        recommended_version: c?.recommended_version ?? null,
        maintenance_mode: !!c?.maintenance_mode,
        maintenance_message: c?.maintenance_message ?? null,
        published_at: c?.published_at ?? null,
      });
      setReleases(res.releases ?? []);
    } catch (e: any) {
      toast.error(e?.message ?? (fr ? "Chargement impossible" : "Load failed"));
    } finally {
      setLoading(false);
    }
  }, [appKey, channel, call, fr]);

  useEffect(() => { void load(); }, [load]);

  const save = async (publish: boolean) => {
    setSaving(true);
    try {
      await call("mobile-config-admin", {
        action: publish ? "publish" : "save",
        app_key: appKey, channel,
        flags: cfg.flags, messages: cfg.messages, settings: cfg.settings,
        min_version: cfg.min_version, recommended_version: cfg.recommended_version,
        maintenance_mode: cfg.maintenance_mode, maintenance_message: cfg.maintenance_message,
      });
      toast.success(publish
        ? (fr ? "Publié vers l'application" : "Published to the app")
        : (fr ? "Enregistré" : "Saved"));
      await load();
    } catch (e: any) {
      toast.error(e?.message ?? (fr ? "Échec" : "Failed"));
    } finally {
      setSaving(false);
    }
  };

  const uploadBundle = async () => {
    if (!bundle || !newVersion.trim()) {
      toast.error(fr ? "Version et fichier requis" : "Version and file required");
      return;
    }
    setUploading(true);
    try {
      const up = await call("mobile-release-publish", {
        action: "upload_url", app_key: appKey, channel, version: newVersion.trim(),
      });
      const { error: upErr } = await supabase.storage
        .from("mobile-bundles")
        .uploadToSignedUrl(up.path, up.token, bundle);
      if (upErr) throw upErr;

      const buf = await bundle.arrayBuffer();
      const digest = await crypto.subtle.digest("SHA-256", buf);
      const sha = Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");

      await call("mobile-release-publish", {
        action: "register", app_key: appKey, channel,
        version: newVersion.trim(), bundle_path: up.path,
        sha256: sha, size: bundle.size, notes: newNotes || null,
      });
      toast.success(fr ? "Paquet téléversé" : "Bundle uploaded");
      setBundle(null); setNewVersion(""); setNewNotes("");
      await load();
    } catch (e: any) {
      toast.error(e?.message ?? (fr ? "Téléversement échoué" : "Upload failed"));
    } finally {
      setUploading(false);
    }
  };

  const setRelease = async (id: string, action: "activate" | "rollback") => {
    try {
      await call("mobile-release-publish", { action, app_key: appKey, channel, id });
      toast.success(action === "activate"
        ? (fr ? "Version poussée vers l'application" : "Version pushed to the app")
        : (fr ? "Retour arrière effectué" : "Rolled back"));
      await load();
    } catch (e: any) {
      toast.error(e?.message ?? "Erreur");
    }
  };

  const active = useMemo(() => releases.find((r) => r.is_active) ?? null, [releases]);

  return (
    <div className="pa-page">
      <PAPageHeader
        icon={<Smartphone className="h-[18px] w-[18px]" />}
        title={fr ? "Application mobile" : "Mobile app"}
        subtitle={fr
          ? "Poussez des réglages et des mises à jour vers l'app sans passer par l'App Store."
          : "Push settings and updates to the app without an App Store release."}
        actions={
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            {fr ? "Rafraîchir" : "Refresh"}
          </Button>
        }
      />

      <div className="flex flex-wrap gap-2">
        {APPS.map((a) => (
          <Button key={a.key} size="sm" variant={appKey === a.key ? "default" : "outline"}
            onClick={() => setAppKey(a.key)}>{a.label}</Button>
        ))}
        <div className="w-px bg-border mx-1" />
        {CHANNELS.map((c) => (
          <Button key={c} size="sm" variant={channel === c ? "default" : "outline"}
            onClick={() => setChannel(c)}>{c === "prod" ? (fr ? "Production" : "Production") : "Beta"}</Button>
        ))}
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">{fr ? "Fonctionnalités" : "Features"}</CardTitle></CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          {FLAG_DEFS.map((f) => (
            <div key={f.key} className="flex items-center justify-between rounded-lg border p-3">
              <Label htmlFor={f.key} className="text-sm">{fr ? f.fr : f.en}</Label>
              <Switch
                id={f.key}
                checked={cfg.flags[f.key] !== false}
                onCheckedChange={(v) => setCfg((s) => ({ ...s, flags: { ...s.flags, [f.key]: v } }))}
              />
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">{fr ? "Messages et maintenance" : "Messages and maintenance"}</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label className="text-xs">{fr ? "Bannière d'annonce" : "Announcement banner"}</Label>
              <Input value={cfg.messages.banner ?? ""}
                onChange={(e) => setCfg((s) => ({ ...s, messages: { ...s.messages, banner: e.target.value } }))} />
            </div>
            <div>
              <Label className="text-xs">{fr ? "Nouveautés (What's new)" : "What's new"}</Label>
              <Input value={cfg.messages.whats_new ?? ""}
                onChange={(e) => setCfg((s) => ({ ...s, messages: { ...s.messages, whats_new: e.target.value } }))} />
            </div>
          </div>
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <Label className="text-sm">{fr ? "Mode maintenance" : "Maintenance mode"}</Label>
              <p className="text-xs text-muted-foreground">
                {fr ? "Affiche un écran bloquant dans l'application." : "Shows a blocking screen in the app."}
              </p>
            </div>
            <Switch checked={cfg.maintenance_mode}
              onCheckedChange={(v) => setCfg((s) => ({ ...s, maintenance_mode: v }))} />
          </div>
          {cfg.maintenance_mode && (
            <Textarea placeholder={fr ? "Message affiché" : "Displayed message"}
              value={cfg.maintenance_message ?? ""}
              onChange={(e) => setCfg((s) => ({ ...s, maintenance_message: e.target.value }))} />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">{fr ? "Paramètres et versions" : "Settings and versions"}</CardTitle></CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          {SETTING_DEFS.map((s) => (
            <div key={s.key}>
              <Label className="text-xs">{fr ? s.fr : s.en}{s.unit ? ` (${s.unit})` : ""}</Label>
              <Input value={String(cfg.settings[s.key] ?? "")}
                onChange={(e) => setCfg((st) => ({ ...st, settings: { ...st.settings, [s.key]: e.target.value } }))} />
            </div>
          ))}
          <div>
            <Label className="text-xs">{fr ? "Version minimale requise" : "Minimum required version"}</Label>
            <Input placeholder="1.2.0" value={cfg.min_version ?? ""}
              onChange={(e) => setCfg((s) => ({ ...s, min_version: e.target.value }))} />
          </div>
          <div>
            <Label className="text-xs">{fr ? "Version recommandée" : "Recommended version"}</Label>
            <Input placeholder="1.3.0" value={cfg.recommended_version ?? ""}
              onChange={(e) => setCfg((s) => ({ ...s, recommended_version: e.target.value }))} />
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => void save(false)} disabled={saving}>
          <Save className="w-4 h-4 mr-2" />{fr ? "Enregistrer" : "Save"}
        </Button>
        <Button onClick={() => void save(true)} disabled={saving}>
          <Rocket className="w-4 h-4 mr-2" />{fr ? "Publier vers l'application" : "Publish to the app"}
        </Button>
        {cfg.published_at && (
          <span className="text-xs text-muted-foreground self-center">
            {fr ? "Dernière publication : " : "Last published: "}
            {new Date(cfg.published_at).toLocaleString(fr ? "fr-CA" : "en-CA")}
          </span>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            {fr ? "Mises à jour du contenu (OTA)" : "Content updates (OTA)"}
            {active && <Badge variant="secondary">{fr ? "Active : " : "Active: "}{active.version}</Badge>}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg border p-3 text-xs text-muted-foreground flex gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            {fr
              ? "Seul le contenu web (écrans, textes, logique JS) peut être poussé ainsi. Tout changement natif (SIP, CallKit, permissions) exige une nouvelle soumission aux stores."
              : "Only web content (screens, texts, JS logic) can be pushed this way. Native changes still require a store submission."}
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <Input placeholder={fr ? "Version (ex. 1.3.0)" : "Version (e.g. 1.3.0)"}
              value={newVersion} onChange={(e) => setNewVersion(e.target.value)} />
            <Input placeholder={fr ? "Notes de version" : "Release notes"}
              value={newNotes} onChange={(e) => setNewNotes(e.target.value)} />
            <Input type="file" accept=".zip"
              onChange={(e) => setBundle(e.target.files?.[0] ?? null)} />
          </div>
          <Button onClick={() => void uploadBundle()} disabled={uploading}>
            <Upload className="w-4 h-4 mr-2" />
            {uploading ? (fr ? "Téléversement…" : "Uploading…") : (fr ? "Téléverser le paquet" : "Upload bundle")}
          </Button>

          <div className="space-y-2">
            {releases.length === 0 && (
              <p className="text-sm text-muted-foreground">{fr ? "Aucune version publiée." : "No release yet."}</p>
            )}
            {releases.map((r) => (
              <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3">
                <div className="min-w-0">
                  <div className="text-sm font-medium flex items-center gap-2">
                    {r.version}
                    {r.is_active && <Badge className="gap-1"><CheckCircle2 className="w-3 h-3" />{fr ? "En ligne" : "Live"}</Badge>}
                    {r.rolled_back_at && <Badge variant="outline">{fr ? "Retirée" : "Rolled back"}</Badge>}
                  </div>
                  <div className="text-xs text-muted-foreground truncate">
                    {r.notes || "—"} · {new Date(r.created_at).toLocaleString(fr ? "fr-CA" : "en-CA")}
                  </div>
                </div>
                <div className="flex gap-2">
                  {!r.is_active && (
                    <Button size="sm" onClick={() => void setRelease(r.id, "activate")}>
                      <Rocket className="w-3.5 h-3.5 mr-1" />{fr ? "Pousser" : "Push"}
                    </Button>
                  )}
                  {r.is_active && (
                    <Button size="sm" variant="outline" onClick={() => void setRelease(r.id, "rollback")}>
                      <RotateCcw className="w-3.5 h-3.5 mr-1" />{fr ? "Retour arrière" : "Rollback"}
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
