// MCommissions — surface mobile des commissions, volontairement composée des
// mêmes rapports que le portail. Il ne doit jamais exister un troisième rapport
// mobile qui redemande les mêmes chiffres avec une portée différente.
import { ArrowLeft } from "lucide-react";
import { useState } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";
import CommissionSections from "@/components/planipret/commissions/CommissionSections";
import type { PlanipretMobileContext } from "../PlanipretMobile";
import { useMplanipretLang } from "@/hooks/useMplanipretLang";
import { tr } from "@/lib/i18n/tr";

type View = "global" | "personal";

export default function MCommissions() {
  const { lang } = useMplanipretLang();
  const fr = lang !== "en";
  const navigate = useNavigate();
  const { profile } = useOutletContext<PlanipretMobileContext>();
  const role = String(profile?.role ?? "");
  const isAdmin = role === "admin";
  const allowed = isAdmin || role === "broker";
  const ownMaestroId = String(profile?.maestro_broker_id ?? "").trim();
  const userId = String(profile?.user_id ?? profile?.id ?? "anonymous").trim() || "anonymous";
  const [view, setView] = useState<View>(isAdmin ? "global" : "personal");

  if (!allowed) {
    return (
      <Shell title={fr ? "Commissions" : "Commissions"} onBack={() => navigate(-1)}>
        <div className="rounded-2xl p-5 text-center text-[13px]" style={{ background: "var(--pp-bg-surface, #0A1628)", border: "1px solid var(--pp-bg-border, rgba(155,127,232,.28))", color: "var(--pp-text-secondary, #B4C6D8)" }}>
          {fr ? "Les rapports de commissions sont réservés aux courtiers et administrateurs." : "Commission reports are restricted to brokers and administrators."}
        </div>
      </Shell>
    );
  }

  // `broker` force pp-commission-stats à résoudre l’identité de la session et
  // `personalUsersId` permet aux rapports Maestro d’identifier explicitement la
  // vue personnelle d’un administrateur. Aucun identifiant d’un autre courtier
  // n’est envoyé depuis cette bascule.
  const scope = isAdmin && view === "global" ? "admin" : "broker";
  const personalUsersId = view === "personal" && /^\d+$/.test(ownMaestroId) ? ownMaestroId : undefined;

  return (
    <Shell title={fr ? "Commissions" : "Commissions"} onBack={() => navigate(-1)}>
      {isAdmin && (
        <div className="grid grid-cols-2 gap-2 mb-3" role="group" aria-label={fr ? "Portée des commissions" : "Commission scope"}>
          <ScopeButton selected={view === "global"} onClick={() => setView("global")}>
            {fr ? "Tous les courtiers" : "All brokers"}
          </ScopeButton>
          <ScopeButton selected={view === "personal"} onClick={() => setView("personal")}>
            {fr ? "Mes commissions" : "My commissions"}
          </ScopeButton>
        </div>
      )}

      <CommissionSections
        key={`${scope}:${personalUsersId ?? "all"}`}
        lang={fr ? "fr" : "en"}
        scope={scope}
        presentation="mobile"
        personalUsersId={personalUsersId}
        cacheScope={`mobile:${userId}:${view}`}
        defaultSection="paid"
      />
    </Shell>
  );
}

function ScopeButton({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className="rounded-xl px-3 py-2.5 text-[13px] font-semibold"
      style={{
        minHeight: 44,
        background: selected ? "var(--pp-brand-accent, #46CAE4)" : "var(--pp-bg-surface, #0A1628)",
        color: selected ? "#07111f" : "var(--pp-text-secondary, #B4C6D8)",
        border: "1px solid var(--pp-bg-border, rgba(155,127,232,.28))",
      }}
    >
      {children}
    </button>
  );
}

function Shell({ title, onBack, children }: { title: string; onBack: () => void; children: React.ReactNode }) {
  return (
    <div className="min-h-full px-4 pt-3 pb-28">
      <div className="flex items-center justify-between mb-4">
        <button type="button" onClick={onBack} aria-label={tr("Retour", "Back")} className="p-2 -ml-2 rounded-lg" style={{ color: "var(--pp-text-secondary, #B4C6D8)" }}>
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-[16px] font-bold" style={{ color: "var(--pp-text-primary, #E8EDF5)" }}>{title}</h1>
        <div className="w-10" aria-hidden />
      </div>
      {children}
    </div>
  );
}
