import { useState, useMemo, useEffect, useCallback } from "react";
import { useOutletContext } from "react-router-dom";
import { Search, Phone, MessageSquare, Mail, Users, UserCog, BookUser, X, Calendar, ListChecks, Loader2, ExternalLink, Sparkles, Plus } from "lucide-react";
import AvaSummarizeSheet from "@/components/planipret/ava/AvaSummarizeSheet";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { PlanipretMobileContext } from "../PlanipretMobile";
import { useMplanipretLang } from "@/hooks/useMplanipretLang";

type Tab = "personal" | "shared" | "directory";

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
    phone: c.phone ?? c.cell_phone ?? c.work_phone ?? c.home_phone ?? "",
    email: c.email ?? "",
    company: c.company ?? c.organization ?? "",
    raw: c,
  };
}

export default function MContacts() {
  const { t } = useMplanipretLang();
  const { openDialer } = useOutletContext<PlanipretMobileContext>();
  const [tab, setTab] = useState<Tab>("personal");
  const [q, setQ] = useState("");
  const [personal, setPersonal] = useState<any[]>([]);
  const [shared, setShared] = useState<any[]>([]);
  const [directory, setDirectory] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selected, setSelected] = useState<any | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const load = useCallback(async (which: Tab) => {
    setLoading(true);
    setLoadError(null);
    try {
      const action = which === "personal" ? "list" : which === "shared" ? "shared" : "directory";
      const { data, error } = await supabase.functions.invoke("pp-ns-contacts", { body: { action } });
      const payload: any = data ?? {};
      if (error) {
        const detail = payload?.error || payload?.body || error.message;
        throw new Error(typeof detail === "string" ? detail : JSON.stringify(detail));
      }
      if (payload?.error) {
        const extra = payload?.status ? ` (HTTP ${payload.status})` : "";
        throw new Error(`${payload.error}${extra}`);
      }
      if (which === "directory") {
        setDirectory(payload?.directory ?? []);
      } else {
        const list = (payload?.contacts ?? []).map(normalizeContact);
        if (which === "personal") setPersonal(list);
        else setShared(list);
      }
    } catch (e: any) {
      const msg = e?.message || "Erreur inconnue";
      console.error("[pp-ns-contacts]", which, e);
      setLoadError(msg);
      toast.error(t("contacts.loadFailed") || "Échec chargement contacts", { description: msg });
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => { load(tab); }, [tab, load]);

  const list = useMemo(() => {
    const src = tab === "personal" ? personal : tab === "shared" ? shared : directory;
    const ql = q.trim().toLowerCase();
    if (!ql) return src;
    return src.filter((c: any) => {
      const hay = tab === "directory"
        ? `${c.name ?? ""} ${c.extension ?? ""} ${c.email ?? ""} ${c.department ?? ""}`
        : `${c.first_name ?? ""} ${c.last_name ?? ""} ${c.phone ?? ""} ${c.email ?? ""} ${c.company ?? ""}`;
      return hay.toLowerCase().includes(ql);
    });
  }, [tab, personal, shared, directory, q]);

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

      {/* Search */}
      <div className="flex items-center gap-2 px-3 mb-4"
        style={{ background: "var(--pp-bg-surface)", border: "1px solid var(--pp-bg-border-2)", borderRadius: 14, height: 44 }}>
        <Search className="w-4 h-4" style={{ color: "var(--pp-text-faint)" }} />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t("contacts.search")}
          className="flex-1 bg-transparent outline-none text-sm"
          style={{ color: "var(--pp-text-primary)", fontFamily: "DM Sans, sans-serif" }}
        />
      </div>

      {/* Pill tabs */}
      <div className="flex gap-1 p-1 mb-4" style={{ background: "var(--pp-bg-surface)", border: "1px solid var(--pp-bg-border-2)", borderRadius: 12 }}>
        {([
          { id: "personal", label: t("contacts.personal") || "Personnels", Icon: Users },
          { id: "shared", label: t("contacts.shared") || "Partagés", Icon: UserCog },
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
          <button onClick={() => load(tab)} className="mt-2 text-xs px-3 py-1.5 rounded-full font-semibold"
            style={{ background: "rgba(239,68,68,0.15)", color: "#dc2626" }}>
            Réessayer
          </button>
        </div>
      )}

      {loading && <div className="text-center py-8 text-sm" style={{ color: "var(--pp-text-muted)" }}>{t("common.loading")}</div>}

      {!loading && list.length === 0 && (
        <div className="text-center py-8 pp-card" style={{ padding: 32 }}>
          <Users className="w-10 h-10 mx-auto mb-3" style={{ color: "var(--pp-text-faint)" }} />
          <div style={{ color: "var(--pp-text-secondary)", fontSize: 13 }}>
            {tab === "directory" ? (t("contacts.noDirectory") || "Aucune extension") : (t("contacts.noContacts") || "Aucun contact")}
          </div>
        </div>
      )}

      {!loading && list.length > 0 && (
        <div className="space-y-2">
          {list.map((c: any) => {
            const isDir = tab === "directory";
            const name = isDir ? (c.name || c.extension) : (`${c.first_name ?? ""} ${c.last_name ?? ""}`.trim() || c.phone || c.email);
            const sub = isDir ? `Ext. ${c.extension}${c.department ? " • " + c.department : ""}` : (c.phone || c.email || c.company);
            const phone = isDir ? c.extension : c.phone;
            return (
              <div
                key={c.id ?? c.extension}
                onClick={() => !isDir && setSelected(c)}
                className="pp-card flex items-center gap-3 cursor-pointer"
                style={{ padding: 12 }}
              >
                <Avatar name={name || "?"} />
                <div className="flex-1 min-w-0">
                  <div style={{ fontFamily: "Inter,sans-serif", fontWeight: 600, fontSize: 14, color: "var(--pp-text-primary)" }}
                    className="truncate">{name || t("contacts.noName")}</div>
                  <div style={{ fontFamily: "DM Sans,sans-serif", fontSize: 11, color: "var(--pp-text-muted)" }}
                    className="truncate">{sub}</div>
                </div>
                <button onClick={(e) => { e.stopPropagation(); phone && openDialer(phone); }}
                  className="flex items-center justify-center active:scale-95 transition"
                  style={{ width: 32, height: 32, borderRadius: "50%", background: "rgba(46,155,220,0.12)", border: "1px solid rgba(46,155,220,0.3)", color: "var(--pp-brand-accent)" }}
                  aria-label={t("common.call")}>
                  <Phone className="w-3.5 h-3.5" />
                </button>
                {!isDir && (
                  <>
                    <button onClick={(e) => e.stopPropagation()} className="flex items-center justify-center" style={{ width: 32, height: 32, borderRadius: "50%", background: "var(--pp-bg-elevated)", border: "1px solid var(--pp-bg-border-2)", color: "var(--pp-text-secondary)" }}>
                      <MessageSquare className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={(e) => e.stopPropagation()} className="flex items-center justify-center" style={{ width: 32, height: 32, borderRadius: "50%", background: "var(--pp-bg-elevated)", border: "1px solid var(--pp-bg-border-2)", color: "var(--pp-text-secondary)" }}>
                      <Mail className="w-3.5 h-3.5" />
                    </button>
                  </>
                )}
              </div>
            );
          })}
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
          onCreated={() => { setCreateOpen(false); load("personal"); }}
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
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [creatingTask, setCreatingTask] = useState(false);
  const [summarizeOpen, setSummarizeOpen] = useState(false);

  const name = `${contact.first_name ?? ""} ${contact.last_name ?? ""}`.trim() || contact.phone || "Contact";
  const phone: string | undefined = contact.phone;
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
          <QuickAction icon={<MessageSquare className="w-4 h-4" />} label="SMS" onClick={() => phone && onCall(phone)} disabled={!phone} />
          <QuickAction icon={<Mail className="w-4 h-4" />} label="Email" onClick={() => contact.email && window.open(`mailto:${contact.email}`)} disabled={!contact.email} />
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
