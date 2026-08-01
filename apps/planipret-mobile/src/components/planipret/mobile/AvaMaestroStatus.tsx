/**
 * AvaMaestroStatus
 * Affiche une bannière discrète dans MAvaChat indiquant si Maestro CRM est connecté.
 * Si non connecté, propose un lien vers la page Connexions.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AlertCircle, CheckCircle2 } from "lucide-react";

interface Props {
  lang?: "fr" | "en";
}

export default function AvaMaestroStatus({ lang = "fr" }: Props) {
  const [connected, setConnected] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user || cancelled) return;
      supabase
        .from("planipret_profiles")
        .select("maestro_broker_id")
        .eq("user_id", user.id)
        .maybeSingle()
        .then(({ data }) => {
          if (!cancelled) setConnected(!!data?.maestro_broker_id);
        });
    });
    return () => { cancelled = true; };
  }, []);

  // Ne rien afficher tant qu'on ne sait pas
  if (connected === null) return null;
  // Si connecté, pas de bannière (AVA a accès au portefeuille)
  if (connected) return null;

  const msg =
    lang === "en"
      ? "Maestro not connected — portfolio tools unavailable."
      : "Maestro non connecté — outils portefeuille indisponibles.";

  return (
    <div
      className="mx-4 mb-2 flex items-center gap-2 rounded-xl px-3 py-2 text-[12px]"
      style={{
        background: "rgba(255,180,0,0.08)",
        border: "1px solid rgba(255,180,0,0.25)",
        color: "var(--pp-text-muted)",
      }}
    >
      <AlertCircle className="w-3.5 h-3.5 shrink-0 text-yellow-400" />
      <span>{msg}</span>
    </div>
  );
}
