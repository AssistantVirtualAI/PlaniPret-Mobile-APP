import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Plug, Users, BarChart3 } from "lucide-react";
import { loginWithRedirect, ROUTES } from "@/lib/routes";


export default function PlanipretDashboard() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [brokers, setBrokers] = useState<any[]>([]);
  const [integrationsMissing, setIntegrationsMissing] = useState(0);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { navigate(loginWithRedirect(ROUTES.MPLANIPRET), { replace: true }); return; }
      const { data: me } = await supabase
        .from("planipret_profiles").select("role").eq("user_id", user.id).maybeSingle();
      if (me?.role !== "admin") { navigate("/mplanipret", { replace: true }); return; }
      const { data } = await supabase
        .from("planipret_profiles").select("*").order("created_at", { ascending: false });
      setBrokers(data ?? []);
      setLoading(false);
      // Check missing integrations (nsapi is env-backed = always OK)
      const { data: secrets } = await supabase.functions.invoke("pp-integration-secrets");
      const present = new Set(((secrets as any)?.items ?? []).filter((i: any) => i.has_keys?.length).map((i: any) => i.provider));
      const required = ["elevenlabs", "anthropic", "maestro", "microsoft"];
      setIntegrationsMissing(required.filter((p) => !present.has(p)).length);
    })();
  }, [navigate]);

  if (loading) return <div className="min-h-screen flex items-center justify-center text-slate-500">Chargement…</div>;

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="px-6 py-4 text-white flex items-center justify-between" style={{ background: "#1F4E79" }}>
        <div>
          <div className="text-xs opacity-80">AVA · Planiprêt</div>
          <h1 className="text-xl font-semibold">Tableau de bord Admin</h1>
        </div>
        <nav className="flex items-center gap-1 text-sm">
          <Link to="/planipret/dashboard" className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/15 hover:bg-white/25"><Users className="w-4 h-4" />Utilisateurs</Link>
          <Link to="/dashboard/integrations" className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg hover:bg-white/15 relative">
            <Plug className="w-4 h-4" />Intégrations
            {integrationsMissing > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-amber-500 text-[10px] font-bold text-white flex items-center justify-center">{integrationsMissing}</span>
            )}
          </Link>
          <Link to="#" className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg hover:bg-white/15 opacity-60"><BarChart3 className="w-4 h-4" />Rapports</Link>
        </nav>
      </header>

      <main className="p-6">

        <div className="bg-white rounded-xl shadow p-4">
          <h2 className="font-semibold mb-3" style={{ color: "#1F4E79" }}>Courtiers ({brokers.length})</h2>
          <table className="w-full text-sm">
            <thead className="text-left text-slate-500">
              <tr><th className="py-2">Nom</th><th>Courriel</th><th>Extension</th><th>Rôle</th><th>Mobile</th></tr>
            </thead>
            <tbody>
              {brokers.map((b) => (
                <tr key={b.id} className="border-t">
                  <td className="py-2">{b.full_name ?? "—"}</td>
                  <td>{b.email ?? "—"}</td>
                  <td>{b.extension ?? "—"}</td>
                  <td>{b.role}</td>
                  <td>{b.mobile_app_enabled ? "✓" : "—"}</td>
                </tr>
              ))}
              {brokers.length === 0 && (
                <tr><td colSpan={5} className="py-6 text-center text-slate-400">Aucun courtier pour l'instant</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}
