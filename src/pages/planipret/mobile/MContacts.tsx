import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { useOutletContext, useNavigate } from "react-router-dom";
import { Search, Phone, MessageSquare, Mail, Users, UserCog, BookUser, X, Calendar, ListChecks, Loader2, ExternalLink, Sparkles, Plus, Star } from "lucide-react";
import AvaSummarizeSheet from "@/components/planipret/ava/AvaSummarizeSheet";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { PlanipretMobileContext } from "../PlanipretMobile";
import { useMplanipretLang } from "@/hooks/useMplanipretLang";
import { ensureContacts, getContactsPermissionStatus, listDeviceContacts } from "@/lib/native/permissions/contacts";
import { openAppSettings, type PermStatus } from "@/lib/native/permissions/platform";
import { tokenize, matchAllTokens } from "@/lib/textNormalize";
import { peekPpContacts } from "@/lib/ppContactsCache";


type Tab = "personal" | "favorites" | "directory";

// ---- Favorites (local, per-device) ----
const FAV_KEY = "planipret.contacts.favorites.v1";
type FavEntry = {
  key: string;                 // unique id (source:id/ext/phone)
  source: "personal" | "shared" | "directory" | "maestro" | "native";
  name: string;
  phone?: string;
  extension?: string;
  email?: string;
  company?: string;
  department?: string;
};
function loadFavs(): FavEntry[] {
  try { return JSON.parse(localStorage.getItem(FAV_KEY) || "[]"); } catch { return []; }
}
function saveFavs(list: FavEntry[]) {
  try { localStorage.setItem(FAV_KEY, JSON.stringify(list)); } catch {}
  try { window.dispatchEvent(new Event("planipret:favorites-changed")); } catch {}
}
function favKeyFor(source: FavEntry["source"], c: any): string {
  const id = c.id ?? c.contact_id ?? c.extension ?? c.phone ?? c.email ?? "";
  return `${source}:${id}`;
}

function Avatar({ name }: { name: string }) {
  const initials = name.split(" ").map((s) => s[0]).slice(0, 2).join("").toUpperCase() || "?";
  const hue = (name.charCodeAt(0) * 17) % 360;
  return (
    <div
      className="flex items-center justify-center font-bold text-white"
      style={{
        width: 40, height: 40, borderRadius: "50%",
        background: `linear-gradient(135deg, hsl(${hue},60%,30%), hsl(${(hue + 40) % 360},70%,45%))`,
        fontSize: 13, fontFamily: "Inter, sans-serif",
      }}
    >{initials}</div>
  );
}

function normalizeContact(c: any) {
  return {
    id: c.id ?? c.contact_id ?? c.uid ?? crypto.randomUUID(),
    first_name: c.first_name ?? c.firstname ?? "",
    last_name: c.last_name ?? c.lastname ?? "",
    display_name: c.display_name ?? c.name ?? "",
    phone: c.phone ?? c.cell_phone ?? c.work_phone ?? c.home_phone ?? "",
    email: c.email ?? "",
    company: c.company ?? c.organization ?? "",
    raw: c,
  };
}

function presenceMeta(raw: string | undefined | null, t: (k: string) => string): { color: string; label: string } {
  const v = String(raw ?? "").toLowerCase();
  if (["available", "online", "active", "ready", "registered"].includes(v)) return { color: "#22c55e", label: t("contacts.presence.available") || "Available" };
  if (["busy", "dnd", "do-not-disturb", "oncall", "on-call", "in-call"].includes(v)) return { color: "#ef4444", label: t("contacts.presence.busy") || "Busy" };
  if (["away", "idle"].includes(v)) return { color: "#f59e0b", label: t("contacts.presence.away") || "Away" };
  if (["offline", "unavailable"].includes(v)) return { color: "#64748b", label: t("contacts.presence.offline") || "Unavailable" };
  return { color: "#64748b", label: t("contacts.presence.unknown") || "Unavailable" };
}

export default function MContacts() {
  const { t } = useMplanipretLang();
  const { openDialer } = useOutletContext<PlanipretMobileContext>();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>("personal");
  const [q, setQ] = useState("");
  const [personal, setPersonal] = useState<any[]>([]);
  const [directory, setDirectory] = useState<any[]>([]);
  const [favorites, setFavorites] = useState<FavEntry[]>(() => loadFavs());
  const [loadingTab, setLoadingTab] = useState<Tab | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selected, setSelected] = useState<any | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [contactsPerm, setContactsPerm] = useState<PermStatus>("unavailable");
  const [contactsPermBusy, setContactsPermBusy] = useState(false);
  const [visibleCount, setVisibleCount] = useState(40);
  const loadedTabsRef = useRef<Set<Tab>>(new Set(["favorites"]));

  useEffect(() => {
    const onChange = () => setFavorites(loadFavs());
    window.addEventListener("planipret:favorites-changed", onChange);
    window.addEventListener("storage", onChange);
    return () => {
      window.removeEventListener("planipret:favorites-changed", onChange);
      window.removeEventListener("storage", onChange);
    };
  }, []);

  const favKeys = useMemo(() => new Set(favorites.map((f) => f.key)), [favorites]);

  const toggleFav = useCallback((entry: FavEntry) => {
    const cur = loadFavs();
    const exists = cur.some((f) => f.key === entry.key);
    const next = exists ? cur.filter((f) => f.key !== entry.key) : [...cur, entry];
    saveFavs(next);
    setFavorites(next);
    toast.success(exists ? (t("contacts.removeFavorite") || "Retiré des favoris") : (t("contacts.addFavorite") || "Ajouté aux favoris"));
  }, [t]);

  const load = useCallback(async (which: Tab, opts: { force?: boolean; limit?: number; background?: boolean } = {}) => {
    if (which === "favorites") return; // local only
    if (!opts.force && loadedTabsRef.current.has(which)) return;
    // If the shared cache already has data for this action, skip the spinner
    // and refresh in the background so the page renders instantly.
    const cachedHint = which === "directory" ? peekPpContacts("directory") : peekPpContacts("list");
    const runBackground = opts.background || (!opts.force && !!cachedHint);
    if (!runBackground) setLoadingTab(which);
    setLoadError(null);
    try {
      const { getPpContacts } = await import("@/lib/ppContactsCache");
      if (which === "directory") {
        const rows = await getPpContacts("directory", { limit: opts.limit ?? 500, force: opts.force });
        setDirectory(rows as any[]);
      } else {
        const [backend, device] = await Promise.allSettled([
          getPpContacts("list", { limit: opts.limit ?? 500, force: opts.force }),
          listDeviceContacts(),
        ]);
        const nativeContacts = device.status === "fulfilled" ? device.value : [];
        let backendError: string | null = null;
        let nsContacts: any[] = [];
        if (backend.status === "fulfilled") {
          nsContacts = (backend.value ?? []).map(normalizeContact);
        } else {
          backendError = backend.reason?.message || "Erreur inconnue";
        }
        setPersonal([...nativeContacts, ...nsContacts]);
        if (backendError && nativeContacts.length === 0) throw new Error(backendError);
      }
      loadedTabsRef.current.add(which);
    } catch (e: any) {
      const msg = e?.message || "Erreur inconnue";
      console.error("[pp-ns-contacts]", which, e);
      if (!runBackground) setLoadError(msg);
      if (!runBackground) toast.error(t("contacts.loadFailed") || "Échec chargement contacts", { description: msg });
    } finally {
      if (!runBackground) setLoadingTab((cur) => (cur === which ? null : cur));
    }
  }, [t]);

  useEffect(() => {
    if (tab === "favorites") return;
    void load(tab, { limit: 120 });
    const id = window.setTimeout(() => { void load(tab, { force: true, limit: 500, background: true }); }, 700);
    return () => window.clearTimeout(id);
  }, [tab, load]);

  // Prefetch the directory after the first paint so the annuaire opens faster.
  useEffect(() => {
    const quick = window.setTimeout(() => { void load("directory", { limit: 120, background: true }); }, 350);
    const full = window.setTimeout(() => { void load("directory", { force: true, limit: 500, background: true }); }, 1200);
    return () => { window.clearTimeout(quick); window.clearTimeout(full); };
  }, [load]);

  // Contacts permission: show the request on the Contacts page, then trigger the
  // native prompt from an explicit tap. If denied, keep a clear recovery path.
  useEffect(() => {
    let cancelled = false;
    const refresh = () => void getContactsPermissionStatus().then((status) => {
      if (cancelled) return;
      setContactsPerm(status);
      if (status === "granted") {
        loadedTabsRef.current.delete("personal");
        void load("personal", { force: true });
      }
    });
    refresh();
    const onVisible = () => { if (document.visibilityState === "visible") refresh(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { cancelled = true; document.removeEventListener("visibilitychange", onVisible); };
  }, [load]);

  const requestContactsAccess = useCallback(async () => {
    setContactsPermBusy(true);
    try {
      const status = await ensureContacts();
      setContactsPerm(status);
      if (status === "granted") {
        loadedTabsRef.current.delete("personal");
        await load("personal", { force: true });
        toast.success("Contacts autorisés");
      } else if (status === "denied") {
        toast.error("Accès aux contacts refusé", { description: "Activez Contacts dans les réglages pour afficher les contacts de votre cellulaire." });
      }
    } finally {
      setContactsPermBusy(false);
    }
  }, [load]);


  const list = useMemo(() => {
    const src: any[] = tab === "personal" ? personal : tab === "favorites" ? favorites : directory;
    const tokens = tokenize(q);
    if (!tokens.length) return src;
    return src.filter((c: any) => {
      const hay = tab === "directory"
        ? `${c.first_name ?? ""} ${c.last_name ?? ""} ${c.name ?? ""} ${c.display_name ?? ""} ${c.extension ?? ""} ${c.email ?? ""} ${c.department ?? ""} ${c.position ?? ""} ${c.job_title ?? ""}`
        : tab === "favorites"
        ? `${c.name ?? ""} ${c.phone ?? ""} ${c.extension ?? ""} ${c.email ?? ""} ${c.company ?? ""}`
        : `${c.first_name ?? ""} ${c.last_name ?? ""} ${c.display_name ?? ""} ${c.phone ?? ""} ${c.email ?? ""} ${c.company ?? ""}`;
      return matchAllTokens(hay, tokens);
    });
  }, [tab, personal, favorites, directory, q]);


  useEffect(() => {
    setVisibleCount(40);
  }, [tab, q, list.length]);

  useEffect(() => {
    if (visibleCount >= list.length) return;
    const id = window.setTimeout(() => setVisibleCount((n) => Math.min(n + 60, list.length)), 40);
    return () => window.clearTimeout(id);
  }, [visibleCount, list.length]);

  const visibleList = useMemo(() => list.slice(0, visibleCount), [list, visibleCount]);
  const loading = loadingTab === tab;

  return (
    <div className="p-4 pb-2">
      <div className="flex items-center justify-between mb-3">
        <h1 style={{ fontFamily: "Inter,sans-serif", fontWeight: 700, fontSize: 22, color: "var(--pp-text-primary)" }}>
          {t("contacts.title")}
        </h1>
        {tab === "personal" && (
          <button onClick={() => setCreateOpen(true)}
            className="flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold active:scale-95 transition"
            style={{ background: "var(--pp-brand-accent-2)", border: "1px solid var(--pp-brand-accent)", color: "#fff" }}>
            <Plus className="w-3.5 h-3.5" /> {t("common.new") || "Nouveau"}
          </button>
        )}
      </div>

      {tab === "personal" && contactsPerm !== "unavailable" && (
        <div className="rounded-2xl p-3 mb-3 flex gap-3 items-start" style={{ background: "var(--pp-bg-surface)", border: "1px solid var(--pp-bg-border-2)" }}>
          <div className="flex items-center justify-center shrink-0" style={{ width: 34, height: 34, borderRadius: "50%", background: "rgba(46,155,220,0.12)", color: "var(--pp-brand-accent)" }}>
            <BookUser className="w-4 h-4" />
          </div>
          <div className="flex-1 min-w-0">
            <div style={{ fontSize: 13, fontWeight: 700, color: "var(--pp-text-primary)" }}>
              Contacts du cellulaire · {contactsPerm === "granted" ? "autorisés" : contactsPerm === "denied" ? "refusés" : "à autoriser"}
            </div>
            <div style={{ fontSize: 11, color: "var(--pp-text-secondary)", marginTop: 2 }}>
              {contactsPerm === "granted"
                ? "Vos contacts du téléphone sont inclus dans cette liste."
                : contactsPerm === "denied"
                ? "Activez Contacts dans les réglages pour afficher les contacts de votre cellulaire."
                : "Touchez Activer pour afficher les contacts de votre cellulaire."}
            </div>
            <div className="flex gap-2 mt-2">
              {contactsPerm === "denied" ? (
                <button onClick={openAppSettings} className="px-3 py-1.5 rounded-full text-xs font-semibold" style={{ background: "var(--pp-brand-accent)", color: "#fff" }}>Activer dans réglages</button>
              ) : contactsPerm === "granted" ? (
                <button onClick={() => void load("personal", { force: true })} disabled={contactsPermBusy || loading} className="px-3 py-1.5 rounded-full text-xs font-semibold flex items-center gap-1" style={{ background: "var(--pp-bg-elevated)", color: "var(--pp-text-secondary)", border: "1px solid var(--pp-bg-border-2)", opacity: contactsPermBusy || loading ? 0.7 : 1 }}>
                  {loading && <Loader2 className="w-3 h-3 animate-spin" />} Actualiser
                </button>
              ) : (
                <button onClick={requestContactsAccess} disabled={contactsPermBusy} className="px-3 py-1.5 rounded-full text-xs font-semibold flex items-center gap-1" style={{ background: "var(--pp-brand-accent)", color: "#fff", opacity: contactsPermBusy ? 0.7 : 1 }}>
                  {contactsPermBusy && <Loader2 className="w-3 h-3 animate-spin" />} Activer
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Search */}
      <div className="flex items-center gap-2 px-3 mb-2"
        style={{ background: "var(--pp-bg-surface)", border: "1px solid var(--pp-bg-border-2)", borderRadius: 14, height: 44 }}>
        <Search className="w-4 h-4" style={{ color: "var(--pp-text-faint)" }} />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && q.trim()) {
              const scope = tab === "directory" ? "directory" : "all";
              navigate(`/mplanipret/search?q=${encodeURIComponent(q.trim())}&scope=${scope}`);
            }
          }}
          placeholder={t("contacts.search")}
          className="flex-1 bg-transparent outline-none text-sm"
          style={{ color: "var(--pp-text-primary)", fontFamily: "DM Sans, sans-serif" }}
        />
        {q.trim() && (
          <button
            onClick={() => {
              const scope = tab === "directory" ? "directory" : "all";
              navigate(`/mplanipret/search?q=${encodeURIComponent(q.trim())}&scope=${scope}`);
            }}
            className="text-[11px] font-semibold px-2 py-1 rounded-full"
            style={{ background: "var(--pp-brand-accent-2)", color: "#fff", border: "1px solid var(--pp-brand-accent)" }}
            aria-label="Rechercher partout">
            Tout
          </button>
        )}
      </div>
      <div className="mb-3" />

      {/* Pill tabs */}
      <div className="flex gap-1 p-1 mb-4" style={{ background: "var(--pp-bg-surface)", border: "1px solid var(--pp-bg-border-2)", borderRadius: 12 }}>
        {([
          { id: "personal", label: t("contacts.personal") || "Personnels", Icon: Users },
          { id: "favorites", label: t("contacts.favorites") || "Favoris", Icon: Star },
          { id: "directory", label: t("contacts.directory") || "Annuaire", Icon: BookUser },
        ] as const).map((p) => {
          const active = tab === p.id;
          return (
            <button key={p.id} onClick={() => setTab(p.id)}
              className="flex-1 flex items-center justify-center gap-1.5 transition"
              style={{
                padding: "8px 10px",
                borderRadius: 9,
                background: active ? "var(--pp-brand-accent-2)" : "transparent",
                border: active ? "1px solid var(--pp-brand-accent)" : "1px solid transparent",
                color: active ? "#fff" : "var(--pp-text-muted)",
                fontFamily: "DM Sans, sans-serif", fontWeight: 600, fontSize: 11,
              }}>
              <p.Icon className="w-3.5 h-3.5" />{p.label}
            </button>
          );
        })}
      </div>

      {loadError && !loading && (
        <div className="rounded-2xl p-4 mb-3 text-sm" style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.3)", color: "#dc2626" }}>
          <div className="font-semibold mb-1">Impossible de charger les contacts</div>
          <div className="text-xs opacity-80 break-all">{loadError}</div>
          <button onClick={() => load(tab, { force: true })} className="mt-2 text-xs px-3 py-1.5 rounded-full font-semibold"
            style={{ background: "rgba(239,68,68,0.15)", color: "#dc2626" }}>
            Réessayer
          </button>
        </div>
      )}

      {loading && <div className="text-center py-8 text-sm" style={{ color: "var(--pp-text-muted)" }}>{t("common.loading")}</div>}

      {!loading && list.length === 0 && (
        <div className="text-center py-8 pp-card" style={{ padding: 32 }}>
          {tab === "favorites"
            ? <Star className="w-10 h-10 mx-auto mb-3" style={{ color: "var(--pp-text-faint)" }} />
            : <Users className="w-10 h-10 mx-auto mb-3" style={{ color: "var(--pp-text-faint)" }} />}
          <div style={{ color: "var(--pp-text-secondary)", fontSize: 13 }}>
            {tab === "favorites"
              ? (t("contacts.noFavorites") || "Aucun favori")
              : tab === "directory"
              ? (t("contacts.noDirectory") || "Aucune extension")
              : (t("contacts.noContacts") || "Aucun contact")}
          </div>
        </div>
      )}

      {!loading && list.length > 0 && (
        <div className="space-y-2">
          {visibleList.map((c: any) => {
            const isDir = tab === "directory";
            const isFav = tab === "favorites";
            const brokerName = isDir
              ? ([c.first_name, c.last_name].filter(Boolean).join(" ").trim() || c.name || c.display_name || c.email || "Nom non disponible")
              : "";
            const brokerPosition = isDir
              ? (c.position || c.job_title || c.jobTitle || c.title || c.role_title || c.department || "Poste non disponible")
              : "";
            const displayName = isDir
              ? ([c.first_name, c.last_name].filter(Boolean).join(" ").trim()
                  || c.name || c.display_name
                  || (c.extension ? `${t("contacts.extension") || "Ext."} ${c.extension}` : "Nom non disponible"))
              : isFav
              ? c.name
              : (`${c.first_name ?? ""} ${c.last_name ?? ""}`.trim() || c.display_name || c.phone || c.email);
            const sub = isDir
              ? (c.extension ? `${t("contacts.extension") || "Ext."} ${c.extension}` : (c.email || "—"))
              : isFav
              ? (c.extension ? `${t("contacts.extension") || "Ext."} ${c.extension}` : (c.phone || c.email || c.company))
              : (c.phone || c.email || c.company);
            const phone = isDir ? c.extension : (c.phone || c.extension);
            const pres = isDir ? presenceMeta(c.presence, t) : null;


            const source: FavEntry["source"] = isDir ? "directory" : isFav ? c.source : "personal";
            const favEntry: FavEntry = isFav ? c : {
              key: favKeyFor(source, c),
              source,
              name: displayName || "?",
              phone: c.phone,
              extension: c.extension,
              email: c.email,
              company: c.company,
              department: c.department,
            };
            const starred = favKeys.has(favEntry.key);

            return (
              <div
                key={favEntry.key}
                onClick={() => !isDir && !isFav && setSelected(c)}
                className="pp-card flex items-center gap-3 cursor-pointer"
                style={{ padding: 12 }}
              >
                <div className="relative">
                  <Avatar name={displayName || "?"} />
                  {pres && (
                    <span
                      aria-label={pres.label}
                      style={{
                        position: "absolute", right: -1, bottom: -1,
                        width: 12, height: 12, borderRadius: "50%",
                        background: pres.color, border: "2px solid var(--pp-bg-base)",
                      }}
                    />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div style={{ fontFamily: "Inter,sans-serif", fontWeight: 600, fontSize: 14, color: "var(--pp-text-primary)" }}
                    className="truncate">{displayName || t("contacts.noName")}</div>
                  <div style={{ fontFamily: "DM Sans,sans-serif", fontSize: 11, color: "var(--pp-text-muted)" }}
                    className="truncate">{sub}</div>
                  {isDir && (
                    <div style={{ fontFamily: "DM Sans,sans-serif", fontSize: 10.5, color: "var(--pp-text-faint)", marginTop: 1 }} className="truncate">
                      {brokerPosition}
                    </div>
                  )}
                  {pres && (
                    <div style={{ fontFamily: "DM Sans,sans-serif", fontSize: 10, color: pres.color, marginTop: 2, fontWeight: 600 }}>
                      • {pres.label}
                    </div>
                  )}
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); toggleFav(favEntry); }}
                  className="flex items-center justify-center active:scale-95 transition"
                  style={{
                    width: 32, height: 32, borderRadius: "50%",
                    background: starred ? "rgba(245,158,11,0.15)" : "var(--pp-bg-elevated)",
                    border: `1px solid ${starred ? "rgba(245,158,11,0.4)" : "var(--pp-bg-border-2)"}`,
                    color: starred ? "#f59e0b" : "var(--pp-text-secondary)",
                  }}
                  aria-label={starred ? (t("contacts.removeFavorite") || "Retirer") : (t("contacts.addFavorite") || "Ajouter")}>
                  <Star className="w-3.5 h-3.5" fill={starred ? "#f59e0b" : "none"} />
                </button>
                <button onClick={(e) => { e.stopPropagation(); phone && openDialer(phone); }}
                  className="flex items-center justify-center active:scale-95 transition"
                  style={{ width: 32, height: 32, borderRadius: "50%", background: "rgba(46,155,220,0.12)", border: "1px solid rgba(46,155,220,0.3)", color: "var(--pp-brand-accent)" }}
                  aria-label={t("common.call")}>
                  <Phone className="w-3.5 h-3.5" />
                </button>
              </div>
            );
          })}
          {visibleCount < list.length && (
            <div className="py-3 text-center text-xs" style={{ color: "var(--pp-text-muted)" }}>
              <Loader2 className="w-3.5 h-3.5 animate-spin inline-block mr-1" /> Chargement progressif…
            </div>
          )}
        </div>
      )}


      {selected && (
        <ContactDetailSheet
          contact={selected}
          onClose={() => setSelected(null)}
          onCall={(p) => { setSelected(null); openDialer(p); }}
        />
      )}

      {createOpen && (
        <CreateContactSheet
          onClose={() => setCreateOpen(false)}
          onCreated={() => { setCreateOpen(false); load("personal", { force: true }); }}
        />
      )}
    </div>
  );
}

function CreateContactSheet({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const { t } = useMplanipretLang();
  const [form, setForm] = useState({ first_name: "", last_name: "", phone: "", email: "", company: "" });
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!form.first_name && !form.last_name && !form.phone) {
      toast.error(t("contacts.requiredFields") || "Prénom, nom ou téléphone requis");
      return;
    }
    setSaving(true);
    try {
      const { data, error } = await supabase.functions.invoke("pp-ns-contacts", {
        body: { action: "create", ...form },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      toast.success(t("contacts.created") || "Contact créé");
      onCreated();
    } catch (e: any) {
      toast.error(t("contacts.createFailed") || "Échec création", { description: e?.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="absolute inset-0 z-40 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl p-4"
        style={{ background: "var(--pp-bg-base)", border: "1px solid var(--pp-bg-border-2)" }}
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <div className="text-lg font-bold" style={{ color: "var(--pp-text-primary)" }}>
            {t("contacts.newContact") || "Nouveau contact"}
          </div>
          <button onClick={onClose} style={{ color: "var(--pp-text-muted)" }}><X className="w-5 h-5" /></button>
        </div>
        <div className="space-y-2">
          {([
            ["first_name", t("contacts.firstName") || "Prénom"],
            ["last_name", t("contacts.lastName") || "Nom"],
            ["phone", t("contacts.phoneLabel") || "Téléphone"],
            ["email", "Email"],
            ["company", t("contacts.company") || "Société"],
          ] as const).map(([k, label]) => (
            <input key={k}
              value={(form as any)[k]}
              onChange={(e) => setForm((f) => ({ ...f, [k]: e.target.value }))}
              placeholder={label}
              className="w-full px-3 py-2 rounded-lg text-sm outline-none"
              style={{ background: "var(--pp-bg-surface)", border: "1px solid var(--pp-bg-border-2)", color: "var(--pp-text-primary)" }} />
          ))}
        </div>
        <button onClick={save} disabled={saving}
          className="w-full mt-4 py-2.5 rounded-lg text-white font-semibold text-sm disabled:opacity-50"
          style={{ background: "var(--pp-brand-accent)" }}>
          {saving ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : (t("common.save") || "Enregistrer")}
        </button>
      </div>
    </div>
  );
}


function ContactDetailSheet({
  contact, onClose, onCall,
}: { contact: any; onClose: () => void; onCall: (phone: string) => void }) {
  const { t, lang } = useMplanipretLang();
  const navigate = useNavigate();
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [creatingTask, setCreatingTask] = useState(false);
  const [summarizeOpen, setSummarizeOpen] = useState(false);

  const name = `${contact.first_name ?? ""} ${contact.last_name ?? ""}`.trim() || contact.phone || "Contact";
  const phone: string | undefined = contact.phone;
  const maestroId: string | undefined = contact.maestro_client_id || contact.external_id || contact.id;

  const openSms = (n: string) => {
    onClose();
    navigate(`/mplanipret/messages?tab=sms&to=${encodeURIComponent(n)}`);
  };
  const openEmail = (email: string) => {
    onClose();
    navigate(`/mplanipret/messages?tab=emails&to=${encodeURIComponent(email)}&name=${encodeURIComponent(name)}`);
  };

  useEffect(() => {
    let cancel = false;
    (async () => {
      setLoading(true);
      try {
        const { data } = await supabase.functions.invoke("maestro-client-history", {
          body: { client_id: maestroId, phone },
        });
        if (!cancel) setHistory(((data as any)?.history ?? (data as any)?.items ?? []).slice(0, 30));
      } catch {
        if (!cancel) setHistory([]);
      } finally {
        if (!cancel) setLoading(false);
      }
    })();
    return () => { cancel = true; };
  }, [maestroId, phone]);

  const createTask = async () => {
    setCreatingTask(true);
    try {
      const { error } = await supabase.functions.invoke("maestro-task", {
        body: { client_id: maestroId, title: `${t("contacts.followUp")} ${name}`, priority: "medium" },
      });
      if (error) throw error;
      toast.success(t("contacts.taskCreated"));
    } catch (e: any) {
      toast.error(t("contacts.taskCreateFailed"), { description: e?.message });
    } finally {
      setCreatingTask(false);
    }
  };

  const iconFor = (kind: string) => {
    const k = (kind || "").toLowerCase();
    if (k.includes("call") || k.includes("appel")) return "📞";
    if (k.includes("sms") || k.includes("message")) return "💬";
    if (k.includes("email") || k.includes("mail")) return "📧";
    if (k.includes("appoint") || k.includes("rdv")) return "📅";
    if (k.includes("task") || k.includes("tâche")) return "📋";
    return "•";
  };

  return (
    <div className="absolute inset-0 z-40 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full sm:max-w-md max-h-[88vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl p-4"
        style={{ background: "var(--pp-bg-base)", border: "1px solid var(--pp-bg-border-2)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-3">
          <div className="min-w-0">
            <div className="text-lg font-bold truncate" style={{ color: "var(--pp-text-primary)" }}>{name}</div>
            {phone && <div className="text-xs" style={{ color: "var(--pp-text-muted)" }}>{phone}</div>}
            {contact.email && <div className="text-xs" style={{ color: "var(--pp-text-muted)" }}>{contact.email}</div>}
          </div>
          <button onClick={onClose} className="p-1" style={{ color: "var(--pp-text-muted)" }} aria-label={t("common.close")}><X className="w-5 h-5" /></button>
        </div>

        {/* Quick actions */}
        <div className="grid grid-cols-5 gap-2 mb-4">
          <QuickAction icon={<Phone className="w-4 h-4" />} label={t("common.call")} onClick={() => phone && onCall(phone)} disabled={!phone} />
          <QuickAction icon={<MessageSquare className="w-4 h-4" />} label="SMS" onClick={() => phone && openSms(phone)} disabled={!phone} />
          <QuickAction icon={<Mail className="w-4 h-4" />} label="Email" onClick={() => contact.email && openEmail(contact.email)} disabled={!contact.email} />
          <QuickAction icon={creatingTask ? <Loader2 className="w-4 h-4 animate-spin" /> : <ListChecks className="w-4 h-4" />} label="Tâche" onClick={createTask} disabled={creatingTask} />
          <QuickAction icon={<Calendar className="w-4 h-4" />} label="RDV" onClick={() => toast.info("Bientôt disponible")} />
        </div>

        {history.length > 0 && (
          <button onClick={() => setSummarizeOpen(true)}
            className="w-full mb-3 py-2 rounded-lg flex items-center justify-center gap-1.5 text-white text-xs font-semibold"
            style={{ background: "linear-gradient(135deg,#2D1A5A,#9B7FE8)" }}>
            <Sparkles className="w-3.5 h-3.5" /> Résumer l'historique avec AVA
          </button>
        )}


        {/* Timeline */}
        <div className="text-[10px] font-semibold uppercase tracking-wide mb-2" style={{ color: "var(--pp-text-muted)" }}>
          Historique Maestro
        </div>
        {loading ? (
          <div className="py-8 text-center text-xs" style={{ color: "var(--pp-text-muted)" }}>
            <Loader2 className="w-4 h-4 animate-spin mx-auto mb-2" /> {t("common.loading")}
          </div>
        ) : history.length === 0 ? (
          <div className="py-6 text-center text-xs" style={{ color: "var(--pp-text-muted)" }}>
            Aucune interaction enregistrée.
          </div>
        ) : (
          <ul className="space-y-1.5">
            {history.map((h: any, i: number) => (
              <li key={i} className="flex gap-2 p-2 rounded-lg"
                  style={{ background: "var(--pp-bg-surface)", border: "1px solid var(--pp-bg-border-2)" }}>
                <span className="text-base shrink-0">{iconFor(h.type || h.kind || h.event)}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium truncate" style={{ color: "var(--pp-text-primary)" }}>
                    {h.title || h.summary || h.subject || h.type || "Interaction"}
                  </div>
                  {h.description && (
                    <div className="text-[11px] line-clamp-2" style={{ color: "var(--pp-text-secondary)" }}>
                      {h.description}
                    </div>
                  )}
                  <div className="text-[10px] mt-0.5" style={{ color: "var(--pp-text-muted)" }}>
                    {h.created_at || h.date ? new Date(h.created_at || h.date).toLocaleString(lang === "en" ? "en-CA" : "fr-CA") : ""}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}

        {maestroId && (
          <button
            onClick={() => toast.info("Lien Maestro à configurer")}
            className="w-full mt-3 py-2 rounded-lg text-[11px] font-medium flex items-center justify-center gap-1.5"
            style={{ background: "var(--pp-bg-elevated)", border: "1px solid var(--pp-bg-border-2)", color: "var(--pp-text-secondary)" }}
          >
            <ExternalLink className="w-3 h-3" /> Voir dans Maestro
          </button>
        )}
      </div>

      <AvaSummarizeSheet
        open={summarizeOpen}
        source="team"
        title={`Historique — ${name}`}
        content={history.slice(0, 30).map((h: any) => `[${h.created_at || h.date || ""}] ${h.type || h.kind || ""}: ${h.title || h.summary || h.subject || ""}${h.description ? " — " + h.description : ""}`).join("\n")}
        contextMeta={{ contact_name: name, phone, email: contact.email }}
        onClose={() => setSummarizeOpen(false)}
      />
    </div>
  );
}

function QuickAction({ icon, label, onClick, disabled }: { icon: React.ReactNode; label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex flex-col items-center gap-1 py-2 rounded-xl transition disabled:opacity-40"
      style={{ background: "var(--pp-bg-surface)", border: "1px solid var(--pp-bg-border-2)", color: "var(--pp-text-primary)" }}
    >
      {icon}
      <span className="text-[10px]" style={{ color: "var(--pp-text-secondary)" }}>{label}</span>
    </button>
  );
}
