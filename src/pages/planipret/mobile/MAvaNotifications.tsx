import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, Bell, Mail, PhoneCall, Sparkles, Calendar, Voicemail, RefreshCw, CheckCheck, Trash2, Check, Circle } from "lucide-react";
import { toast } from "sonner";

type Notif = {
  id: string;
  category: string | null;
  title: string;
  body: string | null;
  data: any;
  deep_link: string | null;
  delivered: boolean | null;
  read_at: string | null;
  created_at: string;
};

const iconFor = (cat?: string | null) => {
  const c = (cat || "").toLowerCase();
  if (c.includes("email") || c.includes("mail")) return Mail;
  if (c.includes("call") || c.includes("missed")) return PhoneCall;
  if (c.includes("voicemail")) return Voicemail;
  if (c.includes("brief") || c.includes("ai")) return Sparkles;
  if (c.includes("appointment") || c.includes("rdv") || c.includes("calendar")) return Calendar;
  return Bell;
};

const fmtWhen = (iso: string) => {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "à l'instant";
  if (min < 60) return `il y a ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `il y a ${h} h`;
  return d.toLocaleDateString("fr-CA", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
};

export default function MAvaNotifications() {
  const navigate = useNavigate();
  const [items, setItems] = useState<Notif[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "unread">("all");

  const load = useCallback(async () => {
    setLoading(true);
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) { setLoading(false); return; }
    const sb: any = supabase;
    const { data, error } = await sb
      .from("planipret_ava_notifications")
      .select("*")
      .eq("user_id", u.user.id)
      .order("created_at", { ascending: false })
      .limit(200);
    setLoading(false);
    if (error) { toast.error(error.message); return; }
    setItems((data ?? []) as Notif[]);
  }, []);

  useEffect(() => { load(); }, [load]);

  // Realtime
  useEffect(() => {
    let userId: string | null = null;
    let channel: any = null;
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      userId = u.user?.id ?? null;
      if (!userId) return;
      channel = supabase
        .channel(`ava-notif-${userId}`)
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "planipret_ava_notifications", filter: `user_id=eq.${userId}` }, (payload: any) => {
          setItems((prev) => [payload.new as Notif, ...prev].slice(0, 200));
        })
        .on("postgres_changes", { event: "UPDATE", schema: "public", table: "planipret_ava_notifications", filter: `user_id=eq.${userId}` }, (payload: any) => {
          setItems((prev) => prev.map((n) => n.id === (payload.new as Notif).id ? (payload.new as Notif) : n));
        })
        .on("postgres_changes", { event: "DELETE", schema: "public", table: "planipret_ava_notifications", filter: `user_id=eq.${userId}` }, (payload: any) => {
          setItems((prev) => prev.filter((n) => n.id !== (payload.old as any).id));
        })
        .subscribe();
    })();
    return () => { if (channel) supabase.removeChannel(channel); };
  }, []);

  const markRead = async (id: string) => {
    setItems((prev) => prev.map((n) => n.id === id ? { ...n, read_at: n.read_at ?? new Date().toISOString() } : n));
    const sb: any = supabase;
    await sb.from("planipret_ava_notifications").update({ read_at: new Date().toISOString() }).eq("id", id).is("read_at", null);
  };

  const toggleRead = async (n: Notif) => {
    const nextRead = n.read_at ? null : new Date().toISOString();
    setItems((prev) => prev.map((x) => x.id === n.id ? { ...x, read_at: nextRead } : x));
    const sb: any = supabase;
    const { error } = await sb.from("planipret_ava_notifications").update({ read_at: nextRead }).eq("id", n.id);
    if (error) { toast.error(error.message); setItems((prev) => prev.map((x) => x.id === n.id ? { ...x, read_at: n.read_at } : x)); }
  };

  const markAllRead = async () => {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    const now = new Date().toISOString();
    setItems((prev) => prev.map((n) => ({ ...n, read_at: n.read_at ?? now })));
    const sb: any = supabase;
    await sb.from("planipret_ava_notifications").update({ read_at: now }).eq("user_id", u.user.id).is("read_at", null);
    toast.success("Tout marqué comme lu");
  };

  const clearAll = async () => {
    if (!confirm("Effacer toutes les notifications ?")) return;
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    const sb: any = supabase;
    const { error } = await sb.from("planipret_ava_notifications").delete().eq("user_id", u.user.id);
    if (error) { toast.error(error.message); return; }
    setItems([]);
  };

  const open = async (n: Notif) => {
    if (!n.read_at) markRead(n.id);
    const link = n.deep_link || (n.data && typeof n.data === "object" ? (n.data as any).deep_link : null);
    if (link && typeof link === "string") {
      if (/^https?:\/\//.test(link)) window.location.href = link;
      else navigate(link);
    }
  };

  const visible = filter === "unread" ? items.filter((n) => !n.read_at) : items;
  const unread = items.filter((n) => !n.read_at).length;

  return (
    <div className="h-full flex flex-col" style={{ background: "var(--pp-bg-base)" }}>
      <div className="px-4 py-3 flex items-center gap-2" style={{ borderBottom: "1px solid var(--pp-bg-border)" }}>
        <button onClick={() => navigate(-1)} className="p-1"><ArrowLeft className="w-5 h-5" style={{ color: "var(--pp-text-primary)" }} /></button>
        <div className="flex-1">
          <div className="text-sm font-semibold" style={{ color: "var(--pp-text-primary)" }}>Notifications AVA</div>
          <div className="text-[11px]" style={{ color: "var(--pp-text-muted)" }}>{unread > 0 ? `${unread} non lue${unread > 1 ? "s" : ""}` : "Tout est à jour"}</div>
        </div>
        <button onClick={load} className="p-2 rounded-full" style={{ background: "var(--pp-bg-elevated)" }} title="Recharger">
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} style={{ color: "var(--pp-text-muted)" }} />
        </button>
      </div>

      <div className="px-4 py-2 flex items-center gap-2" style={{ borderBottom: "1px solid var(--pp-bg-border)" }}>
        <button onClick={() => setFilter("all")} className="text-xs px-3 py-1 rounded-full" style={{ background: filter === "all" ? "var(--pp-brand-accent)" : "var(--pp-bg-elevated)", color: filter === "all" ? "white" : "var(--pp-text-muted)" }}>Toutes</button>
        <button onClick={() => setFilter("unread")} className="text-xs px-3 py-1 rounded-full" style={{ background: filter === "unread" ? "var(--pp-brand-accent)" : "var(--pp-bg-elevated)", color: filter === "unread" ? "white" : "var(--pp-text-muted)" }}>Non lues</button>
        <div className="flex-1" />
        {unread > 0 && (
          <button onClick={markAllRead} className="text-xs px-2 py-1 rounded-full flex items-center gap-1" style={{ background: "var(--pp-bg-elevated)", color: "var(--pp-text-muted)" }}>
            <CheckCheck className="w-3 h-3" /> Tout lire
          </button>
        )}
        {items.length > 0 && (
          <button onClick={clearAll} className="text-xs px-2 py-1 rounded-full flex items-center gap-1" style={{ background: "var(--pp-bg-elevated)", color: "var(--pp-text-muted)" }}>
            <Trash2 className="w-3 h-3" /> Vider
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading && visible.length === 0 ? (
          <div className="text-center text-xs py-10" style={{ color: "var(--pp-text-muted)" }}>Chargement…</div>
        ) : visible.length === 0 ? (
          <div className="text-center py-16 px-6">
            <Bell className="w-10 h-10 mx-auto mb-2 opacity-30" style={{ color: "var(--pp-text-muted)" }} />
            <div className="text-sm font-medium" style={{ color: "var(--pp-text-primary)" }}>Aucune notification</div>
            <div className="text-xs mt-1" style={{ color: "var(--pp-text-muted)" }}>AVA vous alertera dès qu'un lead, courriel ou événement important arrivera.</div>
          </div>
        ) : (
          <div className="divide-y" style={{ borderColor: "var(--pp-bg-border)" }}>
            {visible.map((n) => {
              const Icon = iconFor(n.category);
              const unreadItem = !n.read_at;
              return (
                <div
                  key={n.id}
                  className="w-full px-4 py-3 flex items-start gap-3 transition"
                  style={{ background: unreadItem ? "var(--pp-bg-elevated)" : "transparent" }}
                >
                  <button onClick={() => open(n)} className="flex items-start gap-3 flex-1 min-w-0 text-left hover:opacity-90">
                    <div className="mt-0.5 w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                      style={{ background: unreadItem ? "linear-gradient(135deg, var(--pp-brand-accent), var(--pp-brand-accent-2))" : "var(--pp-bg-deep)" }}>
                      <Icon className="w-4 h-4" style={{ color: unreadItem ? "white" : "var(--pp-text-muted)" }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <div className={`text-sm truncate ${unreadItem ? "font-semibold" : "font-medium"}`} style={{ color: "var(--pp-text-primary)" }}>{n.title}</div>
                        {unreadItem && <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: "var(--pp-brand-accent)" }} />}
                      </div>
                      {n.body && <div className="text-xs mt-0.5 line-clamp-2" style={{ color: "var(--pp-text-muted)" }}>{n.body}</div>}
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-[10px] uppercase tracking-wide" style={{ color: "var(--pp-text-muted)" }}>{n.category || "info"}</span>
                        <span className="text-[10px]" style={{ color: "var(--pp-text-muted)" }}>· {fmtWhen(n.created_at)}</span>
                      </div>
                    </div>
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); toggleRead(n); }}
                    title={unreadItem ? "Marquer comme lu" : "Marquer comme non lu"}
                    aria-label={unreadItem ? "Marquer comme lu" : "Marquer comme non lu"}
                    className="p-2 rounded-full flex-shrink-0"
                    style={{ background: "var(--pp-bg-deep)" }}
                  >
                    {unreadItem ? <Check className="w-3.5 h-3.5" style={{ color: "var(--pp-text-muted)" }} /> : <Circle className="w-3.5 h-3.5" style={{ color: "var(--pp-text-muted)" }} />}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
