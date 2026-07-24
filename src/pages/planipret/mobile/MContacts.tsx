import React from "react";
import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { useOutletContext, useNavigate } from "react-router-dom";
import { Search, Phone, MessageSquare, Mail, Users, UserCog, BookUser, X, Calendar, ListChecks, Loader2, ExternalLink, Sparkles, Plus, Star, Copy, Send, Filter, Check, AlertTriangle, History } from "lucide-react";
import { saveAppointment, loadAppointments, subscribeAppointments, type ApptHistoryEntry } from "@/lib/appointmentHistory";
import AvaSummarizeSheet from "@/components/planipret/ava/AvaSummarizeSheet";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { PlanipretMobileContext } from "../PlanipretMobile";
import { useMplanipretLang } from "@/hooks/useMplanipretLang";
import { ensureContacts, getContactsPermissionStatus, listDeviceContacts } from "@/lib/native/permissions/contacts";
import { openAppSettings, type PermStatus } from "@/lib/native/permissions/platform";
import { tokenize, matchAllTokens } from "@/lib/textNormalize";
import { peekPpContacts, prefetchPpContacts } from "@/lib/ppContactsCache";
import { callEdge, toE164 } from "@/lib/callEdge";

// One-shot cache of the broker's assigned SMS numbers.
let __ppSmsNumbersCache: { ts: number; numbers: any[] } | null = null;
async function fetchSmsNumbers(force = false): Promise<any[]> {
  const now = Date.now();
  if (!force && __ppSmsNumbersCache && now - __ppSmsNumbersCache.ts < 5 * 60_000) {
    return __ppSmsNumbersCache.numbers;
  }
  const data = await callEdge<{ numbers: any[] }>("pp-ns-sms", { action: "sms-numbers" });
  const nums = Array.isArray(data?.numbers) ? data.numbers : [];
  __ppSmsNumbersCache = { ts: now, numbers: nums };
  return nums;
}

async function copyToClipboard(value: string, label: string) {
  try {
    if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(value);
    else {
      const ta = document.createElement("textarea");
      ta.value = value; ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta); ta.select(); document.execCommand("copy"); ta.remove();
    }
    toast.success(`${label} copié`);
  } catch { toast.error("Copie impossible"); }
}


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
  const [personal, setPersonal] = useState<any[]>(() => {
    const cached = peekPpContacts("list");
    return cached ? (cached as any[]).map(normalizeContact) : [];
  });
  const [directory, setDirectory] = useState<any[]>(() => peekPpContacts("directory") ?? []);
  const [favorites, setFavorites] = useState<FavEntry[]>(() => loadFavs());
  const [loadingTab, setLoadingTab] = useState<Tab | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selected, setSelected] = useState<any | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [contactsPerm, setContactsPerm] = useState<PermStatus>("unavailable");
  const [contactsPermBusy, setContactsPermBusy] = useState(false);
  const [visibleCount, setVisibleCount] = useState(40);
  const [filterDept, setFilterDept] = useState<string>("");
  const [filterTeam, setFilterTeam] = useState<string>("");
  const [sortBy, setSortBy] = useState<"relevance" | "name" | "team" | "department">("relevance");
  const loadedTabsRef = useRef<Set<Tab>>(new Set<Tab>([
    "favorites",
    ...(peekPpContacts("directory") ? (["directory"] as Tab[]) : []),
    ...(peekPpContacts("list") ? (["personal"] as Tab[]) : []),
  ]));

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

  // Prefetch personal + directory in parallel after first paint so subsequent
  // tab switches render from memory. Dedup + TTL handled by ppContactsCache.
  useEffect(() => {
    prefetchPpContacts(["list", "directory"], 500);
    const quick = window.setTimeout(() => { void load("directory", { limit: 120, background: true }); }, 250);
    const full = window.setTimeout(() => { void load("directory", { force: true, limit: 500, background: true }); }, 1000);
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
    let out = src;
    if (tab === "directory") {
      if (filterDept) out = out.filter((c: any) => (c.department ?? "") === filterDept);
      if (filterTeam) out = out.filter((c: any) => (c.team ?? c.group ?? c.site ?? "") === filterTeam);
    }
    if (tokens.length) {
      out = out.filter((c: any) => {
        const hay = tab === "directory"
          ? `${c.first_name ?? ""} ${c.last_name ?? ""} ${c.name ?? ""} ${c.display_name ?? ""} ${c.extension ?? ""} ${c.email ?? ""} ${c.department ?? ""} ${c.position ?? ""} ${c.job_title ?? ""} ${c.team ?? ""}`
          : tab === "favorites"
          ? `${c.name ?? ""} ${c.phone ?? ""} ${c.extension ?? ""} ${c.email ?? ""} ${c.company ?? ""}`
          : `${c.first_name ?? ""} ${c.last_name ?? ""} ${c.display_name ?? ""} ${c.phone ?? ""} ${c.email ?? ""} ${c.company ?? ""}`;
        return matchAllTokens(hay, tokens);
      });
    }
    // Sort — Directory tab only; other tabs keep their source order.
    if (tab === "directory") {
      const nameOf = (c: any) => (`${c.first_name ?? ""} ${c.last_name ?? ""}`.trim() || c.name || c.display_name || "").toLowerCase();
      const teamOf = (c: any) => String(c.team ?? c.group ?? c.site ?? "").toLowerCase();
      const deptOf = (c: any) => String(c.department ?? "").toLowerCase();
      if (sortBy === "name") {
        out = [...out].sort((a, b) => nameOf(a).localeCompare(nameOf(b)));
      } else if (sortBy === "team") {
        out = [...out].sort((a, b) => teamOf(a).localeCompare(teamOf(b)) || nameOf(a).localeCompare(nameOf(b)));
      } else if (sortBy === "department") {
        out = [...out].sort((a, b) => deptOf(a).localeCompare(deptOf(b)) || nameOf(a).localeCompare(nameOf(b)));
      } else {
        // relevance: when a query is typed, rank by best token match; otherwise alpha.
        if (tokens.length) {
          const score = (c: any) => {
            const n = nameOf(c);
            let s = 0;
            for (const tk of tokens) {
              if (!tk) continue;
              const idx = n.indexOf(tk);
              if (idx === 0) s += 100;
              else if (idx > 0) s += 40;
              if (String(c.extension ?? "").includes(tk)) s += 60;
              if (String(c.email ?? "").toLowerCase().includes(tk)) s += 20;
            }
            return -s;
          };
          out = [...out].sort((a, b) => score(a) - score(b) || nameOf(a).localeCompare(nameOf(b)));
        } else {
          out = [...out].sort((a, b) => nameOf(a).localeCompare(nameOf(b)));
        }
      }
    }
    return out;
  }, [tab, personal, favorites, directory, q, filterDept, filterTeam, sortBy]);

  const deptOptions = useMemo(() => {
    const s = new Set<string>();
    for (const c of directory) { const v = (c as any).department; if (v) s.add(String(v)); }
    return Array.from(s).sort();
  }, [directory]);
  const teamOptions = useMemo(() => {
    const s = new Set<string>();
    for (const c of directory) { const v = (c as any).team ?? (c as any).group ?? (c as any).site; if (v) s.add(String(v)); }
    return Array.from(s).sort();
  }, [directory]);


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

      {tab === "directory" && (
        <div className="flex items-center gap-2 mb-3 overflow-x-auto no-scrollbar">
          <Filter className="w-3.5 h-3.5 shrink-0" style={{ color: "var(--pp-text-muted)" }} />
          {deptOptions.length > 0 && (
            <select value={filterDept} onChange={(e) => setFilterDept(e.target.value)}
              className="text-xs px-2 py-1.5 rounded-full outline-none"
              style={{ background: filterDept ? "var(--pp-brand-accent-2)" : "var(--pp-bg-surface)", color: filterDept ? "#fff" : "var(--pp-text-secondary)", border: `1px solid ${filterDept ? "var(--pp-brand-accent)" : "var(--pp-bg-border-2)"}` }}>
              <option value="">Département</option>
              {deptOptions.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          )}
          {teamOptions.length > 0 && (
            <select value={filterTeam} onChange={(e) => setFilterTeam(e.target.value)}
              className="text-xs px-2 py-1.5 rounded-full outline-none"
              style={{ background: filterTeam ? "var(--pp-brand-accent-2)" : "var(--pp-bg-surface)", color: filterTeam ? "#fff" : "var(--pp-text-secondary)", border: `1px solid ${filterTeam ? "var(--pp-brand-accent)" : "var(--pp-bg-border-2)"}` }}>
              <option value="">Équipe</option>
              {teamOptions.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          )}
          {(filterDept || filterTeam) && (
            <button onClick={() => { setFilterDept(""); setFilterTeam(""); }}
              className="text-[11px] px-2 py-1 rounded-full font-semibold"
              style={{ background: "var(--pp-bg-elevated)", color: "var(--pp-text-secondary)", border: "1px solid var(--pp-bg-border-2)" }}>
              Effacer
            </button>
          )}
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value as any)}
            className="ml-auto text-xs px-2 py-1.5 rounded-full outline-none shrink-0"
            style={{ background: "var(--pp-bg-surface)", color: "var(--pp-text-secondary)", border: "1px solid var(--pp-bg-border-2)" }}
            aria-label="Trier">
            <option value="relevance">Trier : Pertinence</option>
            <option value="name">Trier : Nom</option>
            <option value="team">Trier : Équipe</option>
            <option value="department">Trier : Département</option>
          </select>
        </div>
      )}


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
                onClick={() => setSelected(c)}
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
                {/* SMS → navigue vers Messages onglet SMS */}
                {phone && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      const qs = new URLSearchParams({ tab: "sms", to: phone, name: displayName || "" });
                      navigate(`/mplanipret/messages?${qs.toString()}`);
                    }}
                    className="flex items-center justify-center active:scale-95 transition"
                    style={{ width: 32, height: 32, borderRadius: "50%", background: "rgba(34,197,94,0.12)", border: "1px solid rgba(34,197,94,0.3)", color: "#22c55e" }}
                    aria-label="SMS">
                    <MessageSquare className="w-3.5 h-3.5" />
                  </button>
                )}
                {/* Email → navigue vers Messages onglet Courriel */}
                {c.email && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      const qs = new URLSearchParams({ tab: "emails", to: c.email, name: displayName || "" });
                      navigate(`/mplanipret/messages?${qs.toString()}`);
                    }}
                    className="flex items-center justify-center active:scale-95 transition"
                    style={{ width: 32, height: 32, borderRadius: "50%", background: "rgba(139,92,246,0.12)", border: "1px solid rgba(139,92,246,0.3)", color: "#8b5cf6" }}
                    aria-label="Courriel">
                    <Mail className="w-3.5 h-3.5" />
                  </button>
                )}
                {/* Appel */}
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
  const [smsOpen, setSmsOpen] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);
  const [apptOpen, setApptOpen] = useState(false);

  const name = `${contact.first_name ?? ""} ${contact.last_name ?? ""}`.trim()
    || contact.name || contact.display_name || contact.phone || contact.email || "Contact";
  const rawPhone: string | undefined =
    contact.phone || contact.mobile || contact.cell_phone || contact.cellphone ||
    contact.cell || contact.mobile_phone || contact.mobilePhone || contact.phoneNumber ||
    contact.phone_number || contact.work_phone || contact.workPhone || contact.telephone ||
    contact.home_phone || contact.homePhone || undefined;
  const extension: string | undefined = contact.extension || contact.ext;
  // Best number for SMS: real phone preferred; extension fallback (for internal chat).
  const smsTarget: string | undefined = rawPhone || extension;
  const phone: string | undefined = rawPhone || extension;
  const email: string | undefined = contact.email || contact.mail || contact.email_address;
  const maestroId: string | undefined = contact.maestro_client_id || contact.external_id || contact.id;

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
    if (!maestroId) { toast.error("Client Maestro requis pour créer une tâche"); return; }
    setCreatingTask(true);
    try {
      const { data, error } = await supabase.functions.invoke("maestro-task", {
        body: {
          maestro_client_id: maestroId,
          title: `${t("contacts.followUp") || "Suivi"} — ${name}`,
          priority: "medium",
          source: "mobile_contact",
        },
      });
      if (error) throw error;
      if ((data as any)?.success === false) throw new Error((data as any)?.error || "task_failed");
      toast.success(t("contacts.taskCreated") || "Tâche créée");
    } catch (e: any) {
      toast.error(t("contacts.taskCreateFailed") || "Échec création tâche", { description: e?.message });
    } finally {
      setCreatingTask(false);
    }
  };

  const openSms = () => {
    if (!smsTarget) { toast.error("Aucun numéro disponible"); return; }
    const qs = new URLSearchParams({ tab: "sms", to: smsTarget, name });
    onClose();
    navigate(`/mplanipret/messages?${qs.toString()}`);
  };
  const openEmail = () => {
    if (!email) { toast.error("Aucun email disponible"); return; }
    const qs = new URLSearchParams({ tab: "emails", to: email, name });
    onClose();
    navigate(`/mplanipret/messages?${qs.toString()}`);
  };
  const openAppt = () => {
    if (!maestroId) { toast.error("Client Maestro requis pour un RDV"); return; }
    setApptOpen(true);
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
          <div className="min-w-0 flex-1">
            <div className="text-lg font-bold truncate" style={{ color: "var(--pp-text-primary)" }}>{name}</div>
            {rawPhone && (
              <ContactField label="Tél" value={rawPhone} onCall={() => onCall(rawPhone)} />
            )}
            {extension && (
              <ContactField label="Ext" value={extension} onCall={() => onCall(extension)} />
            )}
            {email && (
              <ContactField label="Email" value={email} />
            )}
          </div>
          <button onClick={onClose} className="p-1" style={{ color: "var(--pp-text-muted)" }} aria-label={t("common.close")}><X className="w-5 h-5" /></button>
        </div>

        {/* Quick actions — endpoints:
              call → openDialer (softphone) · SMS → pp-ns-sms(send) ·
              Email → ms365-actions(send_email) · Tâche → maestro-task ·
              RDV → maestro-appointment */}
        <div className="grid grid-cols-5 gap-2 mb-4">
          <QuickAction icon={<Phone className="w-4 h-4" />} label={t("common.call")} onClick={() => phone && onCall(phone)} disabled={!phone} />
          <QuickAction icon={<MessageSquare className="w-4 h-4" />} label="SMS" onClick={openSms} disabled={!smsTarget} />
          <QuickAction icon={<Mail className="w-4 h-4" />} label="Email" onClick={openEmail} disabled={!email} />
          <QuickAction icon={creatingTask ? <Loader2 className="w-4 h-4 animate-spin" /> : <ListChecks className="w-4 h-4" />} label="Tâche" onClick={createTask} disabled={creatingTask || !maestroId} />
          <QuickAction icon={<Calendar className="w-4 h-4" />} label="RDV" onClick={openAppt} disabled={!maestroId} />
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

      {smsOpen && smsTarget && (
        <SmsComposerSheet to={smsTarget} contactName={name} onClose={() => setSmsOpen(false)} />
      )}

      {emailOpen && email && (
        <EmailComposerSheet to={email} contactName={name} onClose={() => setEmailOpen(false)} />
      )}

      {apptOpen && maestroId && (
        <AppointmentSheet
          maestroClientId={maestroId}
          contactName={name}
          onClose={() => setApptOpen(false)}
        />
      )}
    </div>
  );
}

function ContactField({ label, value, onCall }: { label: string; value: string; onCall?: () => void }) {
  return (
    <div className="flex items-center gap-1.5 mt-0.5">
      <span className="text-[10px] font-semibold uppercase" style={{ color: "var(--pp-text-faint)" }}>{label}</span>
      <span className="text-xs truncate" style={{ color: "var(--pp-text-muted)" }}>{value}</span>
      <button
        onClick={(e) => { e.stopPropagation(); void copyToClipboard(value, label); }}
        className="ml-0.5 p-1 rounded active:scale-95"
        style={{ color: "var(--pp-text-faint)" }}
        aria-label={`Copier ${label}`}
      >
        <Copy className="w-3 h-3" />
      </button>
      {onCall && (
        <button
          onClick={(e) => { e.stopPropagation(); onCall(); }}
          className="p-1 rounded-full active:scale-95"
          style={{ background: "rgba(46,155,220,0.12)", border: "1px solid rgba(46,155,220,0.3)", color: "var(--pp-brand-accent)" }}
          aria-label={`Appeler ${label}`}
        >
          <Phone className="w-3 h-3" />
        </button>
      )}
    </div>
  );
}

function AiContactImproveButton({ text, onResult, mode, disabled }: { text: string; onResult: (r: string) => void; mode: "sms" | "email"; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    if (open) document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  const run = async (action: "fix" | "improve" | "formal" | "shorter") => {
    if (!text.trim()) return;
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("ai-text-improve", {
        body: { text, mode, action },
      });
      if (error) throw error;
      if ((data as any)?.success === false) throw new Error((data as any)?.error || "IA indisponible");
      const result = (data as any)?.result;
      if (typeof result === "string") onResult(result.trim());
      else throw new Error("Réponse IA invalide");
    } catch (e: any) {
      toast.error("Erreur IA", { description: e?.message });
    } finally {
      setBusy(false);
      setOpen(false);
    }
  };

  const items = [
    { icon: "✓", label: "Corriger les fautes", action: "fix" as const },
    { icon: "✨", label: "Améliorer le texte", action: "improve" as const },
    { icon: "👔", label: "Rendre plus formel", action: "formal" as const },
    { icon: "✂️", label: "Raccourcir", action: "shorter" as const },
  ];

  return (
    <div ref={containerRef} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        disabled={disabled || busy || !text.trim()}
        className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold text-white disabled:opacity-40 active:scale-95 transition"
        style={{ background: "linear-gradient(135deg,#7C3AED,#A855F7)" }}
      >
        {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
        <span>IA</span>
      </button>
      {open && (
        <div className="absolute top-8 right-0 z-[300] w-48 rounded-xl p-1.5 shadow-xl"
          style={{ background: "var(--pp-bg-elevated)", border: "1px solid var(--pp-bg-border-2)" }}>
          {items.map((it) => (
            <button
              key={it.action}
              onClick={() => run(it.action)}
              className="w-full text-left px-2.5 py-2 rounded-lg text-xs flex items-center gap-2 transition"
              style={{ color: "var(--pp-text-primary)" }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "var(--pp-bg-surface)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
            >
              <span className="shrink-0">{it.icon}</span>
              <span>{it.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function SmsComposerSheet({ to, contactName, onClose }: { to: string; contactName: string; onClose: () => void }) {
  const [recipient, setRecipient] = useState(to);
  const [body, setBody] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [preflight, setPreflight] = useState<"loading" | "ok" | "no-number" | "error">("loading");
  const [preflightErr, setPreflightErr] = useState<string | null>(null);
  const [smsFrom, setSmsFrom] = useState<string | null>(null);
  const taRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    const id = window.setTimeout(() => taRef.current?.focus(), 80);
    return () => window.clearTimeout(id);
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const nums = await fetchSmsNumbers();
        if (!alive) return;
        if (!nums.length) {
          setPreflight("no-number");
        } else {
          const first = nums[0];
          const num =
            (typeof first === "string" && first) ||
            first?.number || first?.phonenumber || first?.smsnumber || first?.did || null;
          setSmsFrom(num);
          setPreflight("ok");
        }
      } catch (e: any) {
        if (!alive) return;
        setPreflight("error");
        setPreflightErr(e?.message || "Impossible de vérifier les numéros SMS");
      }
    })();
    return () => { alive = false; };
  }, []);

  const doSend = async (retry = false): Promise<void> => {
    const number = toE164(recipient);
    const msg = body.trim();
    if (!number || !msg) { toast.error("Numéro et message requis"); return; }
    setStatus("sending");
    setErrorMsg(null);
    try {
      const res = await callEdge<any>("pp-ns-sms", { action: "send", to: number, message: msg, from: smsFrom || undefined });
      if (res?.ok === false || res?.error) throw { name: "EdgeError", message: res?.body || res?.error || "SMS failed", status: res?.status ?? 200, body: res, fn: "pp-ns-sms" };
      setStatus("sent");
      toast.success("SMS envoyé", { description: `À ${contactName} · ${number}` });
      window.setTimeout(() => onClose(), 1200);
    } catch (e: any) {
      const status = e?.status ?? 0;
      // Retry once on transient NS 502
      if (!retry && status === 502) {
        setTimeout(() => { void doSend(true); }, 400);
        return;
      }
      const detail =
        (e?.body && typeof e.body === "object" && (e.body.body || e.body.error)) ||
        e?.message || "Erreur inconnue";
      const m = typeof detail === "string" ? detail : JSON.stringify(detail);
      setStatus("error");
      setErrorMsg(m);
      toast.error("Échec envoi SMS", { description: m });
    }
  };
  const send = () => { void doSend(false); };

  const sending = status === "sending";
  const sent = status === "sent";
  const errored = status === "error";
  const noNumber = preflight === "no-number";
  const disabled = sending || sent || preflight === "loading" || noNumber || !recipient.trim() || !body.trim();

  return (
    <div className="fixed inset-0 z-[200] flex items-end justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl p-4"
        style={{ background: "var(--pp-bg-base)", border: "1px solid var(--pp-bg-border-2)", paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="text-base font-bold" style={{ color: "var(--pp-text-primary)" }}>Nouveau SMS</div>
            <div className="text-xs" style={{ color: "var(--pp-text-muted)" }}>
              À {contactName}{smsFrom ? ` · De ${smsFrom}` : ""}
            </div>
          </div>
          <button onClick={onClose} style={{ color: "var(--pp-text-muted)" }}><X className="w-5 h-5" /></button>
        </div>

        {preflight === "loading" && (
          <div className="mb-3 p-2 rounded-lg text-xs flex items-center gap-2"
            style={{ background: "var(--pp-bg-elevated)", border: "1px solid var(--pp-bg-border-2)", color: "var(--pp-text-muted)" }}>
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Vérification des numéros SMS…
          </div>
        )}
        {noNumber && (
          <div className="mb-3 p-3 rounded-lg flex items-start gap-2"
            style={{ background: "rgba(251,191,36,0.10)", border: "1px solid rgba(251,191,36,0.35)" }}>
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" style={{ color: "#f59e0b" }} />
            <div className="text-xs" style={{ color: "var(--pp-text-primary)" }}>
              <div className="font-semibold">Aucun numéro SMS assigné</div>
              <div style={{ color: "var(--pp-text-muted)" }}>Contactez l'administrateur pour activer l'envoi SMS.</div>
            </div>
          </div>
        )}
        {preflight === "error" && (
          <div className="mb-3 p-3 rounded-lg flex items-start gap-2"
            style={{ background: "rgba(239,68,68,0.10)", border: "1px solid rgba(239,68,68,0.35)" }}>
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" style={{ color: "#ef4444" }} />
            <div className="text-xs flex-1" style={{ color: "var(--pp-text-primary)" }}>
              <div className="font-semibold">Vérification impossible</div>
              <div style={{ color: "var(--pp-text-muted)" }}>{preflightErr}</div>
            </div>
          </div>
        )}
        {sent && (
          <div className="mb-3 p-3 rounded-lg flex items-start gap-2"
            style={{ background: "rgba(34,197,94,0.12)", border: "1px solid rgba(34,197,94,0.35)" }}>
            <Check className="w-4 h-4 mt-0.5 shrink-0" style={{ color: "#22c55e" }} />
            <div className="text-xs" style={{ color: "var(--pp-text-primary)" }}>
              <div className="font-semibold">SMS envoyé</div>
              <div style={{ color: "var(--pp-text-muted)" }}>Livraison au {toE164(recipient)}</div>
            </div>
          </div>
        )}
        {errored && (
          <div className="mb-3 p-3 rounded-lg flex items-start gap-2"
            style={{ background: "rgba(239,68,68,0.10)", border: "1px solid rgba(239,68,68,0.35)" }}>
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" style={{ color: "#ef4444" }} />
            <div className="text-xs flex-1" style={{ color: "var(--pp-text-primary)" }}>
              <div className="font-semibold">Échec envoi SMS</div>
              <div style={{ color: "var(--pp-text-muted)", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                {errorMsg || "Erreur inconnue"}
              </div>
            </div>
          </div>
        )}

        <label className="text-[10px] font-semibold uppercase" style={{ color: "var(--pp-text-muted)" }}>Destinataire</label>
        <input
          value={recipient}
          onChange={(e) => setRecipient(e.target.value)}
          inputMode="tel"
          disabled={sending || sent}
          className="w-full mt-1 mb-3 px-3 py-2 rounded-lg text-sm outline-none disabled:opacity-60"
          style={{ fontSize: 16, background: "var(--pp-bg-surface)", border: "1px solid var(--pp-bg-border-2)", color: "var(--pp-text-primary)" }}
        />

        <div className="flex items-center justify-between mt-1 mb-1">
          <label className="text-[10px] font-semibold uppercase" style={{ color: "var(--pp-text-muted)" }}>Message</label>
          <AiContactImproveButton text={body} mode="sms" onResult={(r) => setBody(r)} disabled={sending || sent} />
        </div>
        <textarea
          ref={taRef}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={4}
          placeholder="Écrire un message…"
          disabled={sending || sent}
          className="w-full mt-1 mb-3 px-3 py-2 rounded-lg outline-none resize-none disabled:opacity-60"
          style={{ fontSize: 16, background: "var(--pp-bg-surface)", border: "1px solid var(--pp-bg-border-2)", color: "var(--pp-text-primary)" }}
        />

        <button
          onClick={send}
          disabled={disabled}
          className="w-full py-2.5 rounded-lg text-white font-semibold text-sm disabled:opacity-50 flex items-center justify-center gap-2"
          style={{ background: sent ? "#22c55e" : "var(--pp-brand-accent)" }}
        >
          {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : sent ? <Check className="w-4 h-4" /> : <Send className="w-4 h-4" />}
          {sending ? "Envoi…" : sent ? "Envoyé" : errored ? "Réessayer" : "Envoyer"}
        </button>
      </div>
    </div>
  );
}


function EmailComposerSheet({ to, contactName, onClose }: { to: string; contactName: string; onClose: () => void }) {
  const [recipient, setRecipient] = useState(to);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const taRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    const id = window.setTimeout(() => taRef.current?.focus(), 80);
    return () => window.clearTimeout(id);
  }, []);

  const send = async () => {
    const rcpt = recipient.trim();
    const subj = subject.trim();
    const msg = body.trim();
    if (!rcpt || !msg) { toast.error("Destinataire et message requis"); return; }
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke("ms365-actions", {
        body: { action: "send_email", payload: { to: [rcpt], subject: subj || "(sans objet)", body: msg } },
      });
      if (error) throw error;
      if ((data as any)?.success === false) {
        const errCode = (data as any)?.code;
        const errMsg = (data as any)?.error || "Envoi impossible";
        if (errCode === "ms365_not_connected" || /not.?connected|no.?token|unauthor/i.test(String(errMsg))) {
          setConnecting(true);
          try {
            const { connectMs365 } = await import("@/lib/ms365Connect");
            await connectMs365();
          } finally { setConnecting(false); }
          return;
        }
        throw new Error(errMsg);
      }
      toast.success("Email envoyé");
      onClose();
    } catch (e: any) {
      toast.error("Échec envoi email", { description: e?.message });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-end justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl p-4"
        style={{ background: "var(--pp-bg-base)", border: "1px solid var(--pp-bg-border-2)", paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="text-base font-bold" style={{ color: "var(--pp-text-primary)" }}>Nouvel email</div>
            <div className="text-xs" style={{ color: "var(--pp-text-muted)" }}>À {contactName} · via Microsoft 365</div>
          </div>
          <button onClick={onClose} style={{ color: "var(--pp-text-muted)" }}><X className="w-5 h-5" /></button>
        </div>

        <label className="text-[10px] font-semibold uppercase" style={{ color: "var(--pp-text-muted)" }}>Destinataire</label>
        <input
          value={recipient}
          onChange={(e) => setRecipient(e.target.value)}
          inputMode="email"
          className="w-full mt-1 mb-3 px-3 py-2 rounded-lg text-sm outline-none"
          style={{ fontSize: 16, background: "var(--pp-bg-surface)", border: "1px solid var(--pp-bg-border-2)", color: "var(--pp-text-primary)" }}
        />

        <label className="text-[10px] font-semibold uppercase" style={{ color: "var(--pp-text-muted)" }}>Sujet</label>
        <input
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          className="w-full mt-1 mb-3 px-3 py-2 rounded-lg text-sm outline-none"
          style={{ fontSize: 16, background: "var(--pp-bg-surface)", border: "1px solid var(--pp-bg-border-2)", color: "var(--pp-text-primary)" }}
        />

        <div className="flex items-center justify-between mt-1 mb-1">
          <label className="text-[10px] font-semibold uppercase" style={{ color: "var(--pp-text-muted)" }}>Message</label>
          <AiContactImproveButton text={body} mode="email" onResult={(r) => setBody(r)} disabled={sending || connecting} />
        </div>
        <textarea
          ref={taRef}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={6}
          placeholder="Écrire votre message…"
          disabled={sending || connecting}
          className="w-full mt-1 mb-3 px-3 py-2 rounded-lg outline-none resize-none disabled:opacity-60"
          style={{ fontSize: 16, background: "var(--pp-bg-surface)", border: "1px solid var(--pp-bg-border-2)", color: "var(--pp-text-primary)" }}
        />

        <button
          onClick={send}
          disabled={sending || connecting || !recipient.trim() || !body.trim()}
          className="w-full py-2.5 rounded-lg text-white font-semibold text-sm disabled:opacity-50 flex items-center justify-center gap-2"
          style={{ background: "var(--pp-brand-accent)" }}
        >
          {(sending || connecting) ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          {connecting ? "Connexion Microsoft…" : sending ? "Envoi…" : "Envoyer"}
        </button>
      </div>
    </div>
  );
}


function AppointmentSheet({ maestroClientId, contactName, onClose }: { maestroClientId: string; contactName: string; onClose: () => void }) {
  const now = new Date();
  const in1h = new Date(now.getTime() + 60 * 60 * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  const toLocal = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const [title, setTitle] = useState(`RDV — ${contactName}`);
  const [startAt, setStartAt] = useState(toLocal(in1h));
  const [duration, setDuration] = useState(30);
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);

  const save = async () => {
    if (!title.trim() || !startAt) { toast.error("Titre et date requis"); return; }
    setStatus("saving");
    setErrorMsg(null);
    const start = new Date(startAt);
    const end = new Date(start.getTime() + duration * 60 * 1000);
    try {
      const { data, error } = await supabase.functions.invoke("maestro-appointment", {
        body: {
          maestro_client_id: maestroClientId,
          title: title.trim(),
          start_at: start.toISOString(),
          end_at: end.toISOString(),
          notes: notes.trim() || null,
          type: "phone",
        },
      });
      if (error) throw error;
      if ((data as any)?.success === false) throw new Error((data as any)?.error || "appointment_failed");
      const remoteId = (data as any)?.id ?? (data as any)?.appointment?.id;
      saveAppointment({
        status: "created",
        title: title.trim(),
        start_at: start.toISOString(),
        end_at: end.toISOString(),
        duration_min: duration,
        contact_name: contactName,
        maestro_client_id: maestroClientId,
        notes: notes.trim() || undefined,
        type: "phone",
        remote_id: remoteId,
      });
      setStatus("saved");
      toast.success("RDV créé", { description: `${contactName} · ${start.toLocaleString("fr-CA")}` });
    } catch (e: any) {
      const m = e?.message || "Erreur inconnue";
      saveAppointment({
        status: "error",
        title: title.trim(),
        start_at: start.toISOString(),
        end_at: end.toISOString(),
        duration_min: duration,
        contact_name: contactName,
        maestro_client_id: maestroClientId,
        notes: notes.trim() || undefined,
        type: "phone",
        error: m,
      });
      setStatus("error");
      setErrorMsg(m);
      toast.error("Échec création RDV", { description: m });
    }
  };

  const saving = status === "saving";
  const saved = status === "saved";
  const errored = status === "error";

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl p-4"
        style={{ background: "var(--pp-bg-base)", border: "1px solid var(--pp-bg-border-2)", paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="text-base font-bold" style={{ color: "var(--pp-text-primary)" }}>Nouveau RDV</div>
            <div className="text-xs" style={{ color: "var(--pp-text-muted)" }}>Avec {contactName} · via Maestro</div>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={() => setHistoryOpen(true)} title="Historique des RDV"
              className="p-1.5 rounded-lg" style={{ color: "var(--pp-text-muted)", border: "1px solid var(--pp-bg-border-2)" }}>
              <History className="w-4 h-4" />
            </button>
            <button onClick={onClose} style={{ color: "var(--pp-text-muted)" }} className="p-1"><X className="w-5 h-5" /></button>
          </div>
        </div>

        {saved && (
          <div className="mb-3 p-3 rounded-lg flex items-start gap-2"
            style={{ background: "rgba(34,197,94,0.12)", border: "1px solid rgba(34,197,94,0.35)" }}>
            <Check className="w-4 h-4 mt-0.5 shrink-0" style={{ color: "#22c55e" }} />
            <div className="text-xs flex-1" style={{ color: "var(--pp-text-primary)" }}>
              <div className="font-semibold">RDV créé</div>
              <div style={{ color: "var(--pp-text-muted)" }}>{new Date(startAt).toLocaleString("fr-CA")} · {duration} min</div>
              <div className="flex gap-2 mt-2">
                <button onClick={() => setHistoryOpen(true)}
                  className="px-2.5 py-1 rounded-full text-[11px] font-semibold flex items-center gap-1"
                  style={{ background: "var(--pp-bg-elevated)", color: "var(--pp-text-primary)", border: "1px solid var(--pp-bg-border-2)" }}>
                  <History className="w-3 h-3" /> Voir l'historique
                </button>
                <button onClick={onClose}
                  className="px-2.5 py-1 rounded-full text-[11px] font-semibold"
                  style={{ background: "var(--pp-brand-accent)", color: "#fff" }}>
                  Fermer
                </button>
              </div>
            </div>
          </div>
        )}
        {errored && (
          <div className="mb-3 p-3 rounded-lg flex items-start gap-2"
            style={{ background: "rgba(239,68,68,0.10)", border: "1px solid rgba(239,68,68,0.35)" }}>
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" style={{ color: "#ef4444" }} />
            <div className="text-xs flex-1" style={{ color: "var(--pp-text-primary)" }}>
              <div className="font-semibold">Échec création RDV</div>
              <div style={{ color: "var(--pp-text-muted)" }}>{errorMsg}</div>
            </div>
          </div>
        )}

        <label className="text-[10px] font-semibold uppercase" style={{ color: "var(--pp-text-muted)" }}>Titre</label>
        <input value={title} onChange={(e) => setTitle(e.target.value)} disabled={saving || saved}
          className="w-full mt-1 mb-3 px-3 py-2 rounded-lg text-sm outline-none disabled:opacity-60"
          style={{ fontSize: 16, background: "var(--pp-bg-surface)", border: "1px solid var(--pp-bg-border-2)", color: "var(--pp-text-primary)" }} />

        <label className="text-[10px] font-semibold uppercase" style={{ color: "var(--pp-text-muted)" }}>Début</label>
        <input type="datetime-local" value={startAt} onChange={(e) => setStartAt(e.target.value)} disabled={saving || saved}
          className="w-full mt-1 mb-3 px-3 py-2 rounded-lg text-sm outline-none disabled:opacity-60"
          style={{ fontSize: 16, background: "var(--pp-bg-surface)", border: "1px solid var(--pp-bg-border-2)", color: "var(--pp-text-primary)" }} />

        <label className="text-[10px] font-semibold uppercase" style={{ color: "var(--pp-text-muted)" }}>Durée (min)</label>
        <select value={duration} onChange={(e) => setDuration(Number(e.target.value))} disabled={saving || saved}
          className="w-full mt-1 mb-3 px-3 py-2 rounded-lg text-sm outline-none disabled:opacity-60"
          style={{ fontSize: 16, background: "var(--pp-bg-surface)", border: "1px solid var(--pp-bg-border-2)", color: "var(--pp-text-primary)" }}>
          {[15, 30, 45, 60, 90].map((n) => <option key={n} value={n}>{n} min</option>)}
        </select>

        <label className="text-[10px] font-semibold uppercase" style={{ color: "var(--pp-text-muted)" }}>Notes</label>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} disabled={saving || saved}
          className="w-full mt-1 mb-3 px-3 py-2 rounded-lg outline-none resize-none disabled:opacity-60"
          style={{ fontSize: 16, background: "var(--pp-bg-surface)", border: "1px solid var(--pp-bg-border-2)", color: "var(--pp-text-primary)" }} />

        <button onClick={save} disabled={saving || saved}
          className="w-full py-2.5 rounded-lg text-white font-semibold text-sm disabled:opacity-50 flex items-center justify-center gap-2"
          style={{ background: saved ? "#22c55e" : "var(--pp-brand-accent)" }}>
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <Check className="w-4 h-4" /> : <Calendar className="w-4 h-4" />}
          {saving ? "Création…" : saved ? "Créé" : errored ? "Réessayer" : "Créer le RDV"}
        </button>

        {historyOpen && <AppointmentHistorySheet onClose={() => setHistoryOpen(false)} />}
      </div>
    </div>
  );
}

function AppointmentHistorySheet({ onClose }: { onClose: () => void }) {
  const [items, setItems] = useState<ApptHistoryEntry[]>(() => loadAppointments());
  useEffect(() => subscribeAppointments(() => setItems(loadAppointments())), []);
  const fmt = (iso: string) => { try { return new Date(iso).toLocaleString("fr-CA"); } catch { return iso; } };

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl p-4"
        style={{ background: "var(--pp-bg-base)", border: "1px solid var(--pp-bg-border-2)", paddingBottom: "max(1rem, env(safe-area-inset-bottom))", maxHeight: "80vh", display: "flex", flexDirection: "column" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3 shrink-0">
          <div>
            <div className="text-base font-bold" style={{ color: "var(--pp-text-primary)" }}>Historique des RDV</div>
            <div className="text-xs" style={{ color: "var(--pp-text-muted)" }}>{items.length} enregistrement{items.length > 1 ? "s" : ""}</div>
          </div>
          <button onClick={onClose} style={{ color: "var(--pp-text-muted)" }}><X className="w-5 h-5" /></button>
        </div>

        {items.length === 0 ? (
          <div className="py-10 text-center text-xs" style={{ color: "var(--pp-text-muted)" }}>
            Aucun RDV créé pour l'instant.
          </div>
        ) : (
          <ul className="space-y-2 overflow-y-auto pr-1" style={{ WebkitOverflowScrolling: "touch" }}>
            {items.map((it) => {
              const ok = it.status === "created";
              const badge = ok
                ? { bg: "rgba(34,197,94,0.15)", border: "rgba(34,197,94,0.4)", color: "#22c55e", label: "Créé" }
                : it.status === "canceled"
                ? { bg: "rgba(148,163,184,0.15)", border: "rgba(148,163,184,0.4)", color: "#94a3b8", label: "Annulé" }
                : { bg: "rgba(239,68,68,0.12)", border: "rgba(239,68,68,0.4)", color: "#ef4444", label: "Erreur" };
              return (
                <li key={it.id} className="p-3 rounded-xl"
                  style={{ background: "var(--pp-bg-surface)", border: "1px solid var(--pp-bg-border-2)" }}>
                  <div className="flex items-start gap-2">
                    <Calendar className="w-4 h-4 mt-0.5 shrink-0" style={{ color: "var(--pp-brand-accent)" }} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <div className="text-sm font-semibold truncate" style={{ color: "var(--pp-text-primary)" }}>{it.title}</div>
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold shrink-0"
                          style={{ background: badge.bg, border: `1px solid ${badge.border}`, color: badge.color }}>{badge.label}</span>
                      </div>
                      <div className="text-[11px] mt-0.5" style={{ color: "var(--pp-text-secondary)" }}>{it.contact_name}</div>
                      <div className="text-[11px]" style={{ color: "var(--pp-text-muted)" }}>
                        {fmt(it.start_at)} · {it.duration_min} min
                      </div>
                      {it.notes && (
                        <div className="text-[11px] mt-1 line-clamp-2" style={{ color: "var(--pp-text-secondary)" }}>{it.notes}</div>
                      )}
                      {it.error && (
                        <div className="text-[11px] mt-1" style={{ color: "#ef4444" }}>{it.error}</div>
                      )}
                      <div className="text-[10px] mt-1" style={{ color: "var(--pp-text-faint)" }}>Créé le {fmt(it.created_at)}</div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
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
