// Shared header for secondary mobile pages: Back, title, optional subtitle
// and refresh, always in the same place.
import { useLocation, useNavigate } from "react-router-dom";
import { ChevronLeft, RefreshCw } from "lucide-react";
import type { ReactNode } from "react";
import { MOBILE_HOME_ROUTE, previousMobileRoute } from "@/lib/planipret/lastRoute";

const surface = { background: "var(--pp-bg-surface)", border: "1px solid var(--pp-bg-border)" } as const;

export default function MobilePageHeader({
  title, subtitle, onRefresh, refreshing, right, lang,
}: {
  title: string;
  subtitle?: string;
  onRefresh?: () => void;
  refreshing?: boolean;
  right?: ReactNode;
  lang?: "fr" | "en";
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const en = (lang ?? (localStorage.getItem("pp_lang") === "en" ? "en" : "fr")) === "en";
  const goBack = () => {
    // Never trust browser history on a cold native start/deep link: it can lead
    // outside the app or back to an OAuth callback rather than to Planiprêt.
    navigate(previousMobileRoute(location.pathname) ?? MOBILE_HOME_ROUTE, { replace: true });
  };
  return (
    <div className="flex items-center gap-2" data-testid="mobile-page-header">
      <button onClick={goBack} aria-label={en ? "Back" : "Retour"}
        className="w-11 h-11 shrink-0 rounded-xl flex items-center justify-center" style={surface}>
        <ChevronLeft className="w-4 h-4" />
      </button>
      <div className="min-w-0 flex-1">
        <h1 className="text-base font-semibold pp-heading truncate">{title}</h1>
        {subtitle && <p className="text-[11px] truncate" style={{ color: "var(--pp-text-muted)" }}>{subtitle}</p>}
      </div>
      {right}
      {onRefresh && (
        <button onClick={onRefresh} aria-label={en ? "Refresh" : "Actualiser"}
          className="w-11 h-11 shrink-0 rounded-xl flex items-center justify-center" style={surface}>
          <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
        </button>
      )}
    </div>
  );
}
