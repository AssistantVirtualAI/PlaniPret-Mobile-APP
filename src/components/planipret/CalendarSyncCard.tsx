import { useEffect, useState } from "react";
import { Calendar, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export function CalendarSyncCard({ profile }: { profile: any }) {
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [count, setCount] = useState(0);

  const load = async () => {
    const { data, count: c } = await supabase.from("planipret_calendar_sync")
      .select("last_sync_at", { count: "exact" })
      .eq("user_id", profile.id).order("last_sync_at", { ascending: false }).limit(1);
    setLastSync(data?.[0]?.last_sync_at ?? null);
    setCount(c ?? 0);
  };

  useEffect(() => { if (profile?.id) load(); }, [profile?.id]);

  const syncNow = async () => {
    if (!profile?.ms365_access_token) { toast.error("Connectez Microsoft 365 d'abord"); return; }
    setSyncing(true);
    const { data, error } = await supabase.functions.invoke("pp-calendar-sync", { body: { user_id: profile.user_id } });
    setSyncing(false);
    if (error || (data as any)?.success === false) { toast.error("Échec de la synchronisation"); return; }
    toast.success(`✅ ${(data as any).synced ?? 0} événements synchronisés`);
    await load();
  };

  const ago = (iso: string | null) => {
    if (!iso) return "Jamais";
    const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
    if (mins < 1) return "À l'instant";
    if (mins < 60) return `Il y a ${mins} min`;
    const h = Math.round(mins / 60);
    if (h < 24) return `Il y a ${h}h`;
    return `Il y a ${Math.round(h / 24)}j`;
  };

  return (
    <div className="px-4 py-3 border-t border-slate-100">
      <div className="flex items-center gap-2 mb-2">
        <Calendar className="w-4 h-4 text-blue-600" />
        <span className="text-sm font-medium" style={{ color: "var(--pp-text-primary)" }}>Synchronisation calendrier</span>
      </div>
      <div className="text-[11px] text-slate-500 mb-2">
        <div>Dernière sync: <span className="font-medium text-slate-700">{ago(lastSync)}</span></div>
        <div>Événements synchronisés: <span className="font-medium text-slate-700">{count}</span></div>
      </div>
      <button onClick={syncNow} disabled={syncing} className="w-full py-2 rounded-lg border border-slate-200 text-xs font-medium flex items-center justify-center gap-1.5 hover:bg-slate-50 disabled:opacity-50">
        <RefreshCw className={`w-3.5 h-3.5 ${syncing ? "animate-spin" : ""}`} />
        {syncing ? "Synchronisation…" : "Synchroniser maintenant"}
      </button>
    </div>
  );
}
