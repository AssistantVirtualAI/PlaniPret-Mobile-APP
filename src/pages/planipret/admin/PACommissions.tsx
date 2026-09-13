import { useEffect, useState } from "react";
import { TrendingUp, Lock } from "lucide-react";
import { PAPage, PAPageHeader } from "@/components/planipret/admin/PAPageShell";
import { useMplanipretLang } from "@/hooks/useMplanipretLang";
import MaestroReconnectButton from "@/components/planipret/commissions/MaestroReconnectButton";
import MaestroSyncDiagnostics from "@/components/planipret/commissions/MaestroSyncDiagnostics";
import RegisterCommissions from "@/components/planipret/commissions/RegisterCommissions";
import { supabase } from "@/integrations/supabase/client";
import paBanner from "@/assets/planipret/banner-commissions.jpg";

export default function PACommissions() {
  const { lang } = useMplanipretLang();
  const [allowed, setAllowed] = useState<boolean | null>(null);

  // Accès réservé aux administrateurs Planiprêt (le serveur applique la même règle).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { if (!cancelled) setAllowed(false); return; }
      const [{ data: profile }, { data: isSuper }] = await Promise.all([
        supabase.from("planipret_profiles").select("role").eq("user_id", user.id).maybeSingle(),
        supabase.rpc("is_super_admin", { _user_id: user.id }),
      ]);
      if (!cancelled) setAllowed(profile?.role === "admin" || isSuper === true);
    })();
    return () => { cancelled = true; };
  }, []);


  if (allowed === null) {
    return (
      <PAPage>
        <div className="py-16 text-center text-sm text-muted-foreground">…</div>
      </PAPage>
    );
  }

  if (!allowed) {
    return (
      <PAPage>
        <div className="py-20 flex flex-col items-center gap-3 text-center">
          <Lock className="w-8 h-8 text-muted-foreground" />
          <h1 className="text-lg font-semibold">
            {lang === "en" ? "Restricted page" : "Page restreinte"}
          </h1>
          <p className="text-sm text-muted-foreground max-w-md">
            {lang === "en"
              ? "Commission statistics are not available for your account."
              : "Les statistiques de commissions ne sont pas accessibles pour votre compte."}
          </p>
        </div>
      </PAPage>
    );
  }

  return (
    <PAPage>
      <PAPageHeader
        image={paBanner}
        accent="#10B981"
        icon={<TrendingUp className="w-5 h-5" />}
        title={lang === "en" ? "Commission statistics" : "Statistiques de commissions"}
        subtitle={lang === "en"
          ? "Global view across all brokers — volume, deals, lenders and commissions"
          : "Vue globale sur tous les courtiers — volume, dossiers, prêteurs et commissions"}
      />

      <div className="mb-2">
        <MaestroReconnectButton lang={lang === "en" ? "en" : "fr"} />
      </div>
      <MaestroSyncDiagnostics lang={lang === "en" ? "en" : "fr"} canSync />

      <RegisterCommissions lang={lang === "en" ? "en" : "fr"} scope="admin" />
    </PAPage>
  );
}
