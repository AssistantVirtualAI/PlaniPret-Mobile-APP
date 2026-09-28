import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Bug, Camera as CameraIcon, ChevronDown, ChevronRight, ImagePlus, Loader2, MessageSquare, Plus, RefreshCw, Search, Send, Trash2, X,
} from "lucide-react";
import { useMplanipretLang } from "@/hooks/useMplanipretLang";
import { Capacitor } from "@capacitor/core";
import { Camera as CapCamera, CameraResultType, CameraSource } from "@capacitor/camera";

const isNative = () => { try { return Capacitor.isNativePlatform(); } catch { return false; } };
async function webPathToFile(webPath: string, i: number): Promise<File> {
  const blob = await (await fetch(webPath)).blob();
  const ext = (blob.type.split("/")[1] || "jpeg").replace("jpeg", "jpg");
  return new File([blob], `photo-${Date.now()}-${i}.${ext}`, { type: blob.type || "image/jpeg" });
}

type Status = "new" | "in_progress" | "waiting" | "resolved";
type Severity = "low" | "normal" | "high" | "blocker";
const db = supabase as any;
const BUCKET = "pp-feedback-screenshots";

const STATUS_META: Record<Status, { fr: string; en: string; fg: string; bg: string }> = {
  new:         { fr: "Nouveau",    en: "New",         fg: "#2563EB", bg: "rgba(37,99,235,.12)" },
  in_progress: { fr: "En cours",   en: "In progress", fg: "#B45309", bg: "rgba(245,158,11,.15)" },
  waiting:     { fr: "En attente", en: "Waiting",     fg: "#7C3AED", bg: "rgba(124,58,237,.12)" },
  resolved:    { fr: "Résolu",     en: "Resolved",    fg: "#047857", bg: "rgba(16,185,129,.15)" },
};
const STATUS_ORDER: Status[] = ["new", "in_progress", "waiting", "resolved"];
const SEVERITY_META: Record<Severity, { fr: string; en: string; color: string }> = {
  low:     { fr: "Mineur",   en: "Minor",  color: "#64748B" },
  normal:  { fr: "Normal",   en: "Normal",  color: "#2E9BDC" },
  high:    { fr: "Élevé",    en: "High",    color: "#EA580C" },
  blocker: { fr: "Bloquant", en: "Blocker", color: "#DC2626" },
};
const SEVERITY_ORDER: Severity[] = ["low", "normal", "high", "blocker"];
const MAX_ATTACHMENTS = 6;
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const SAFE_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

interface Report {
  id: string; reporter_id: string; reporter_name: string | null; title: string; description: string | null;
  page: string | null; source: string; severity: string; status: string; screenshots: string[]; created_at: string;
}
interface Comment { id: string; report_id: string; author_id: string; author_name: string | null; body: string; created_at: string; }

const card: React.CSSProperties = {
  background: "var(--pp-bg-surface)", border: "1px solid var(--pp-bg-border)", borderRadius: 16,
};
const inputStyle: React.CSSProperties = {
  width: "100%", borderRadius: 10, border: "1px solid var(--pp-bg-border-2, var(--pp-bg-border))",
  background: "var(--pp-bg-elevated)", color: "var(--pp-text-primary)", padding: "8px 12px", fontSize: 14, outline: "none",
};
const accent = "linear-gradient(135deg, #1A4A8A, #2E9BDC)";

function Shot({ path }: { path: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    supabase.storage.from(BUCKET).createSignedUrl(path, 3600).then(({ data }) => { if (alive) setUrl(data?.signedUrl ?? null); });
    return () => { alive = false; };
  }, [path]);
  if (!url) return <div className="h-20 w-28 animate-pulse rounded-lg" style={{ background: "var(--pp-bg-elevated)" }} />;
  return (
    <a href={url} target="_blank" rel="noreferrer">
      <img src={url} alt="Capture" className="h-20 w-28 rounded-lg object-cover" style={{ border: "1px solid var(--pp-bg-border)" }} />
    </a>
  );
}

export default function PlanipretFeedback({ source = "portal", compact = false }: { source?: "portal" | "mobile"; compact?: boolean }) {
  const { lang } = useMplanipretLang();
  const en = lang === "en";
  const t = (fr: string, e: string) => (en ? e : fr);

  const [me, setMe] = useState<{ id: string; name: string } | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [fStatus, setFStatus] = useState<"all" | Status>("all");
  const [fMine, setFMine] = useState(false);
  const [open, setOpen] = useState(false);
  const [comments, setComments] = useState<Record<string, Comment[]>>({});
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [openThread, setOpenThread] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [page, setPage] = useState("");
  const [severity, setSeverity] = useState<Severity>("normal");
  const [files, setFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const submitLockRef = useRef(false);
  const titleRef = useRef<HTMLInputElement>(null);
  const threadRef = useRef<string | null>(null);
  threadRef.current = openThread;

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: prof } = await db.from("planipret_profiles").select("full_name,email").eq("user_id", user.id).maybeSingle();
      setMe({ id: user.id, name: prof?.full_name || prof?.email || user.email || "Courtier" });
      const { data: adm } = await db.rpc("is_planipret_admin", { _user_id: user.id });
      setIsAdmin(!!adm);
    })();
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await db.from("pp_feedback_reports").select("*").order("created_at", { ascending: false });
    if (error) toast.error(error.message);
    else setReports((data ?? []).map((r: any) => ({ ...r, screenshots: Array.isArray(r.screenshots) ? r.screenshots : [] })));
    setLoading(false);
  }, []);

  const loadCounts = useCallback(async () => {
    const { data } = await db.from("pp_feedback_comments").select("report_id");
    const c: Record<string, number> = {};
    (data ?? []).forEach((r: any) => { c[r.report_id] = (c[r.report_id] ?? 0) + 1; });
    setCounts(c);
  }, []);

  const loadComments = useCallback(async (id: string) => {
    const { data, error } = await db.from("pp_feedback_comments").select("*").eq("report_id", id).order("created_at");
    if (error) { toast.error(error.message); return; }
    setComments((c) => ({ ...c, [id]: data ?? [] }));
  }, []);

  useEffect(() => { void load(); void loadCounts(); }, [load, loadCounts]);

  useEffect(() => {
    if (!me?.id) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const debounced = (fn: () => void) => { if (timer) clearTimeout(timer); timer = setTimeout(fn, 800); };
    const ch = supabase.channel(`pp_feedback_${me.id}_${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "pp_feedback_reports" }, () => debounced(() => void load()))
      .on("postgres_changes", { event: "*", schema: "public", table: "pp_feedback_comments" }, () => debounced(() => {
        void loadCounts(); if (threadRef.current) void loadComments(threadRef.current);
      }))
      .subscribe();
    return () => { if (timer) clearTimeout(timer); void supabase.removeChannel(ch); };
  }, [me?.id, load, loadCounts, loadComments]);

  const statusCounts = useMemo(() => {
    const c: Record<string, number> = { all: reports.length };
    STATUS_ORDER.forEach((s) => { c[s] = reports.filter((r) => r.status === s).length; });
    return c;
  }, [reports]);

  const filtered = useMemo(() => reports.filter((r) => {
    if (fStatus !== "all" && r.status !== fStatus) return false;
    if (fMine && r.reporter_id !== me?.id) return false;
    if (q && !`${r.title} ${r.description ?? ""} ${r.page ?? ""} ${r.reporter_name ?? ""}`.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  }), [reports, fStatus, fMine, q, me?.id]);

  const addFiles = (list: FileList | null) => {
    if (!list) return;
    const arr = Array.from(list).filter((f) => SAFE_IMAGE_TYPES.has(f.type) && f.size <= MAX_FILE_BYTES);
    if (arr.length !== list.length) toast.error(t("Utilise des images JPG, PNG ou WebP de 5 Mo maximum", "Use JPG, PNG, or WebP images up to 5 MB"));
    setFiles((p) => [...p, ...arr].slice(0, MAX_ATTACHMENTS));
  };
  const onPaste = (e: React.ClipboardEvent) => {
    const imgs = Array.from(e.clipboardData.files).filter((f) => SAFE_IMAGE_TYPES.has(f.type) && f.size <= MAX_FILE_BYTES);
    if (imgs.length) { setFiles((p) => [...p, ...imgs].slice(0, MAX_ATTACHMENTS)); toast.success(t("Capture ajoutée", "Screenshot added")); }
  };

  const ensurePerm = async (kind: "photos" | "camera") => {
    const cur = await CapCamera.checkPermissions();
    if (cur[kind] === "granted" || cur[kind] === "limited") return true;
    const req = await CapCamera.requestPermissions({ permissions: [kind] });
    if (req[kind] === "granted" || req[kind] === "limited") return true;
    toast.error(kind === "photos"
      ? t("Accès aux photos refusé. Autorise-le dans Réglages > Planiprêt > Photos.", "Photo access denied. Allow it in Settings > Planiprêt > Photos.")
      : t("Accès à la caméra refusé. Autorise-le dans Réglages > Planiprêt.", "Camera access denied. Allow it in Settings > Planiprêt."));
    return false;
  };
  const pickPhotos = async () => {
    if (!isNative()) { fileRef.current?.click(); return; }
    try {
      if (Capacitor.getPlatform() === "ios" && !(await ensurePerm("photos"))) return;
      const res = await CapCamera.pickImages({ quality: 80, limit: Math.max(1, MAX_ATTACHMENTS - files.length) });
      const out = await Promise.all(res.photos.map((ph, i) => webPathToFile(ph.webPath, i)));
      setFiles((p) => [...p, ...out].filter((f) => SAFE_IMAGE_TYPES.has(f.type) && f.size <= MAX_FILE_BYTES).slice(0, MAX_ATTACHMENTS));
    } catch (e: any) {
      if (!/cancel/i.test(e?.message ?? "")) fileRef.current?.click();
    }
  };
  const takePhoto = async () => {
    try {
      if (!(await ensurePerm("camera"))) return;
      const ph = await CapCamera.getPhoto({ quality: 80, saveToGallery: false, resultType: CameraResultType.Uri, source: CameraSource.Camera });
      if (ph.webPath) { const f = await webPathToFile(ph.webPath, 0); if (SAFE_IMAGE_TYPES.has(f.type) && f.size <= MAX_FILE_BYTES) setFiles((p) => [...p, f].slice(0, MAX_ATTACHMENTS)); }
    } catch (e: any) { if (!/cancel/i.test(e?.message ?? "")) toast.error(e?.message ?? "Camera"); }
  };

  const submit = async () => {
    if (!me || submitting || submitLockRef.current) return;
    const normalizedTitle = title.trim();
    const normalizedDescription = desc.trim();
    const normalizedPage = page.trim();
    if (!normalizedTitle) {
      toast.error(t("Ajoute un titre", "Add a title"));
      titleRef.current?.focus();
      return;
    }
    if (normalizedTitle.length > 200 || normalizedDescription.length > 5000 || normalizedPage.length > 200) {
      toast.error(t("Le feedback dépasse la longueur permise", "Feedback exceeds the permitted length"));
      return;
    }
    submitLockRef.current = true;
    setSubmitting(true);
    try {
      const paths: string[] = [];
      for (const f of files) {
        const path = `${me.id}/${Date.now()}-${f.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
        const { error } = await supabase.storage.from(BUCKET).upload(path, f, { upsert: false });
        if (error) throw error;
        paths.push(path);
      }
      const idempotencyKey = `${me.id}:${source}:${crypto.randomUUID()}`;
      const { data: ins, error } = await db.from("pp_feedback_reports").insert({
        reporter_id: me.id, reporter_name: me.name, title: normalizedTitle, description: normalizedDescription || null,
        page: normalizedPage || null, severity, source, screenshots: paths, idempotency_key: idempotencyKey,
      }).select("id").single();
      if (error) throw error;
      let notificationStatus = "pending";
      if (ins?.id) {
        const { data: notification, error: notificationError } = await supabase.functions.invoke("pp-feedback-notify", { body: { report_id: ins.id } });
        if (notificationError) notificationStatus = "failed";
        else notificationStatus = String((notification as any)?.notification_status ?? "pending");
      }
      if (notificationStatus === "sent") toast.success(t("Signalement enregistré et équipe avisée", "Report recorded and team notified"));
      else toast.success(t("Signalement enregistré; avis à l’équipe en attente", "Report recorded; team notification pending"));
      setTitle(""); setDesc(""); setPage(""); setSeverity("normal"); setFiles([]); setOpen(false);
      void load();
    } catch (e: any) {
      toast.error(e?.message ?? t("Échec de l'envoi", "Send failed"));
    } finally { submitLockRef.current = false; setSubmitting(false); }
  };

  const setStatus = async (r: Report, status: Status) => {
    setBusy(r.id);
    const { error } = await db.from("pp_feedback_reports")
      .update({ status, resolved_at: status === "resolved" ? new Date().toISOString() : null }).eq("id", r.id);
    setBusy(null);
    if (error) { toast.error(error.message); return; }
    toast.success(`${t("Statut", "Status")} : ${STATUS_META[status][en ? "en" : "fr"]}`);
    void load();
  };

  const remove = async (r: Report) => {
    if (!confirm(t("Supprimer ce signalement ?", "Delete this report?"))) return;
    const { error } = await db.from("pp_feedback_reports").delete().eq("id", r.id);
    if (error) { toast.error(error.message); return; }
    void load();
  };

  const toggleThread = (id: string) => {
    if (openThread === id) { setOpenThread(null); return; }
    setOpenThread(id); setDraft(""); setCollapsed((c) => ({ ...c, [id]: false })); void loadComments(id);
  };

  const sendComment = async (id: string) => {
    const text = draft.trim();
    if (!text || sending || !me) return;
    setSending(true);
    const { error } = await db.from("pp_feedback_comments").insert({ report_id: id, author_id: me.id, author_name: me.name, body: text });
    setSending(false);
    if (error) { toast.error(error.message); return; }
    setDraft(""); void loadComments(id); void loadCounts();
  };

  const chip = (active: boolean, s?: Status): React.CSSProperties => s && active
    ? { background: STATUS_META[s].bg, color: STATUS_META[s].fg, border: `1px solid ${STATUS_META[s].fg}` }
    : { background: active ? "var(--pp-bg-elevated)" : "transparent", color: active ? "var(--pp-text-primary)" : "var(--pp-text-muted)", border: "1px solid var(--pp-bg-border)", fontWeight: active ? 700 : 500 };

  return (
    <div className={`flex flex-col gap-4 ${compact ? "p-3" : ""}`} style={{ color: "var(--pp-text-primary)" }}>
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <div className="grid h-10 w-10 place-items-center rounded-xl" style={{ background: "rgba(46,155,220,.14)", color: "#2E9BDC" }}>
            <Bug size={18} />
          </div>
          <div className="min-w-0">
            <h1 className="pp-heading text-lg font-bold">{t("Feedback", "Feedback")}</h1>
            <p className="text-xs" style={{ color: "var(--pp-text-muted)" }}>
              {t("Signale un problème ou une idée — suivi jusqu'à la résolution.", "Report an issue or idea — tracked until resolved.")}
            </p>
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button onClick={() => void load()} aria-label={t("Actualiser", "Refresh")}
            className="grid h-9 w-9 place-items-center rounded-lg" style={{ border: "1px solid var(--pp-bg-border)", color: "var(--pp-text-muted)" }}>
            <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
          </button>
          <button onClick={() => setOpen((o) => !o)} className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-white" style={{ background: accent }}>
            {open ? <X size={15} /> : <Plus size={15} />} {open ? t("Fermer", "Close") : t("Nouveau", "New")}
          </button>
        </div>
      </div>

      {open && (
        <form className="p-4" style={card} onPaste={onPaste} onSubmit={(e) => { e.preventDefault(); void submit(); }}>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="flex flex-col gap-1 text-xs" style={{ color: "var(--pp-text-secondary)" }}>
              {t("Titre du problème", "Issue title")}
              <input ref={titleRef} style={inputStyle} aria-invalid={!title.trim()} maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} />
            </label>
            <label className="flex flex-col gap-1 text-xs" style={{ color: "var(--pp-text-secondary)" }}>
              {t("Page / section (ex. Tâches)", "Page / section (e.g. Tasks)")}
              <input style={inputStyle} maxLength={200} value={page} onChange={(e) => setPage(e.target.value)} />
            </label>
          </div>
          <label className="mt-3 flex flex-col gap-1 text-xs" style={{ color: "var(--pp-text-secondary)" }}>
            {t("Description", "Description")}
            <textarea style={{ ...inputStyle, minHeight: 100 }} maxLength={5000}
              placeholder={t("Décris le problème : ce que tu faisais, ce qui s'est passé.", "Describe what you were doing and what happened.")}
              value={desc} onChange={(e) => setDesc(e.target.value)} />
          </label>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <select aria-label={t("Gravité", "Severity")} style={{ ...inputStyle, width: "auto" }} value={severity} onChange={(e) => setSeverity(e.target.value as Severity)}>
              {SEVERITY_ORDER.map((s) => <option key={s} value={s}>{t("Gravité", "Severity")} : {SEVERITY_META[s][en ? "en" : "fr"]}</option>)}
            </select>
            <button type="button" onClick={() => void pickPhotos()} className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm"
              style={{ border: "1px solid var(--pp-bg-border)", color: "var(--pp-text-secondary)" }}>
              <ImagePlus size={15} /> {isNative() ? t("Photos", "Photos") : t("Captures", "Screenshots")} ({files.length}/{MAX_ATTACHMENTS})
            </button>
            {isNative() && (
              <button type="button" onClick={() => void takePhoto()} className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm"
                style={{ border: "1px solid var(--pp-bg-border)", color: "var(--pp-text-secondary)" }}>
                <CameraIcon size={15} /> {t("Caméra", "Camera")}
              </button>
            )}
            <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
            <button type="submit" disabled={submitting} className="ml-auto flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-60" style={{ background: accent }}>
              {submitting ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />} {t("Envoyer", "Send")}
            </button>
          </div>
          {files.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {files.map((f, i) => (
                <div key={i} className="relative">
                  <img src={URL.createObjectURL(f)} alt="" className="h-20 w-28 rounded-lg object-cover" />
                  <button type="button" aria-label={t("Retirer la capture", "Remove screenshot")} onClick={() => setFiles((p) => p.filter((_, j) => j !== i))}
                    className="absolute -right-2 -top-2 grid h-5 w-5 place-items-center rounded-full text-white" style={{ background: "#DC2626" }}>
                    <X size={11} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </form>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2" style={{ color: "var(--pp-text-muted)" }} />
          <input aria-label={t("Rechercher les signalements", "Search reports")} value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("Rechercher", "Search")}
            style={{ ...inputStyle, width: 200, padding: "6px 8px 6px 26px", fontSize: 12 }} />
        </div>
        <button onClick={() => setFStatus("all")} className="rounded-lg px-2.5 py-1.5 text-xs" style={chip(fStatus === "all")}>
          {t("Tous", "All")} ({statusCounts.all})
        </button>
        {STATUS_ORDER.map((s) => (
          <button key={s} onClick={() => setFStatus(s)} className="rounded-lg px-2.5 py-1.5 text-xs font-medium" style={chip(fStatus === s, s)}>
            {STATUS_META[s][en ? "en" : "fr"]} ({statusCounts[s] ?? 0})
          </button>
        ))}
        {isAdmin && (
          <label className="flex items-center gap-1.5 text-xs" style={{ color: "var(--pp-text-muted)" }}>
            <input type="checkbox" checked={fMine} onChange={(e) => setFMine(e.target.checked)} /> {t("Mes signalements", "My reports")}
          </label>
        )}
      </div>

      {loading && reports.length === 0 ? (
        <div className="flex items-center gap-2 py-8 text-sm" style={{ color: "var(--pp-text-muted)" }}><Loader2 className="h-4 w-4 animate-spin" /> {t("Chargement…", "Loading…")}</div>
      ) : filtered.length === 0 ? (
        <div className="p-8 text-center text-sm" style={{ ...card, color: "var(--pp-text-muted)" }}>{t("Aucun signalement pour l'instant.", "No reports yet.")}</div>
      ) : (
        <ul className="flex flex-col gap-3 pb-8">
          {filtered.map((r) => {
            const st = (STATUS_ORDER.includes(r.status as Status) ? r.status : "new") as Status;
            const sev = (SEVERITY_ORDER.includes(r.severity as Severity) ? r.severity : "normal") as Severity;
            const canEdit = isAdmin || r.reporter_id === me?.id;
            const isCollapsed = collapsed[r.id] ?? false;
            return (
              <li key={r.id} className="p-4" style={{ ...card, borderLeft: `3px solid ${SEVERITY_META[sev].color}` }}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <button aria-label={isCollapsed ? t("Développer le signalement", "Expand report") : t("Réduire le signalement", "Collapse report")} aria-expanded={!isCollapsed} onClick={() => setCollapsed((c) => ({ ...c, [r.id]: !isCollapsed }))}
                        className="grid h-6 w-6 place-items-center rounded-md" style={{ border: "1px solid var(--pp-bg-border)", color: "var(--pp-text-muted)" }}>
                        {isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                      </button>
                      <span className="text-sm font-semibold">{r.title}</span>
                      <span className="rounded-md px-2 py-0.5 text-[10px] font-bold uppercase" style={{ background: STATUS_META[st].bg, color: STATUS_META[st].fg }}>
                        {STATUS_META[st][en ? "en" : "fr"]}
                      </span>
                      <span className="rounded-md px-2 py-0.5 text-[10px] font-bold uppercase text-white" style={{ background: SEVERITY_META[sev].color }}>
                        {SEVERITY_META[sev][en ? "en" : "fr"]}
                      </span>
                    </div>
                    <div className="mt-1 text-[11px]" style={{ color: "var(--pp-text-muted)" }}>
                      {r.reporter_name || "—"} · {new Date(r.created_at).toLocaleString(en ? "en-CA" : "fr-CA")}
                      {` · ${r.source === "mobile" ? t("App mobile", "Mobile app") : r.source === "ava_chat" ? t("AVA chat", "AVA chat") : r.source === "ava_voice" ? t("AVA vocal", "AVA voice") : t("Portail", "Portal")}`}
                      {r.page ? ` · ${r.page}` : ""}
                      {counts[r.id] ? ` · ${counts[r.id]} message(s)` : ""}
                    </div>
                    {!isCollapsed && (
                      <>
                        {r.description && <p className="mt-2 whitespace-pre-wrap text-sm" style={{ color: "var(--pp-text-secondary)" }}>{r.description}</p>}
                        {r.screenshots.length > 0 && <div className="mt-3 flex flex-wrap gap-2">{r.screenshots.map((p) => <Shot key={p} path={p} />)}</div>}
                      </>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {isAdmin && (
                      <select style={{ ...inputStyle, width: "auto", padding: "5px 8px", fontSize: 12 }} disabled={busy === r.id} value={st}
                        onChange={(e) => void setStatus(r, e.target.value as Status)}>
                        {STATUS_ORDER.map((s) => <option key={s} value={s}>{STATUS_META[s][en ? "en" : "fr"]}</option>)}
                      </select>
                    )}
                    <button onClick={() => toggleThread(r.id)} className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs"
                      style={{ border: "1px solid var(--pp-bg-border)", color: "var(--pp-text-secondary)" }}>
                      <MessageSquare size={13} /> {counts[r.id] ?? 0}
                    </button>
                    {canEdit && (
                      <button onClick={() => void remove(r)} aria-label={t("Supprimer", "Delete")} className="grid h-7 w-7 place-items-center rounded-lg"
                        style={{ border: "1px solid var(--pp-bg-border)", color: "#DC2626" }}>
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                </div>
                {openThread === r.id && (
                  <div className="mt-3 pt-3" style={{ borderTop: "1px solid var(--pp-bg-border)" }}>
                    <div className="flex flex-col gap-2">
                      {(comments[r.id] ?? []).map((c) => (
                        <div key={c.id} className="rounded-lg px-3 py-2 text-sm"
                          style={{ background: c.author_id === me?.id ? "rgba(46,155,220,.10)" : "var(--pp-bg-elevated)" }}>
                          <div className="text-[11px]" style={{ color: "var(--pp-text-muted)" }}>
                            {c.author_name || "—"} · {new Date(c.created_at).toLocaleString(en ? "en-CA" : "fr-CA")}
                          </div>
                          <div className="whitespace-pre-wrap">{c.body}</div>
                        </div>
                      ))}
                      {(comments[r.id] ?? []).length === 0 && (
                        <div className="text-xs" style={{ color: "var(--pp-text-muted)" }}>{t("Aucun message.", "No messages.")}</div>
                      )}
                    </div>
                    <div className="mt-2 flex gap-2">
                      <input aria-label={t("Ajouter un commentaire", "Add a comment")} style={inputStyle} value={draft} placeholder={t("Écrire un message…", "Write a message…")}
                        onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void sendComment(r.id); }} />
                      <button onClick={() => void sendComment(r.id)} disabled={sending} className="grid h-9 w-10 shrink-0 place-items-center rounded-lg text-white disabled:opacity-60" style={{ background: accent }}>
                        {sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                      </button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
