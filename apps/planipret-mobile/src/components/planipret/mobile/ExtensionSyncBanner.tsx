import { AlertTriangle } from "lucide-react";
import { useMplanipretLang } from "@/hooks/useMplanipretLang";

export default function ExtensionSyncBanner({ profile }: { profile: any; reloadProfile: () => Promise<void> }) {
  const { t } = useMplanipretLang();
  const extension = profile?.ns_extension || profile?.extension;
  const linked = !!extension && !!profile?.ns_linked;

  if (!extension) {
    return (
      <div className="pp-card flex items-center gap-2" style={{ padding: 10, borderColor: "rgba(232,76,76,0.35)" }}>
        <AlertTriangle className="w-4 h-4" style={{ color: "var(--pp-color-danger)" }} />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold">{t("extSync.noExtension")}</div>
          <div className="text-xs" style={{ color: "var(--pp-text-muted)" }}>{t("extSync.contactAdmin")}</div>
        </div>
      </div>
    );
  }

  const dot = linked ? "var(--pp-color-success)" : "var(--pp-color-danger)";
  const label = linked ? "Appels REST prêts" : t("extSync.needsResync");
  return (
    <div className="pp-card flex items-center gap-2" style={{ padding: 10 }}>
      <span aria-hidden style={{ width: 8, height: 8, borderRadius: 999, background: dot, boxShadow: `0 0 0 3px ${dot}22` }} />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold truncate">
          {t("extSync.extLabel")} {extension}
        </div>
        <div className="text-xs truncate" style={{ color: "var(--pp-text-muted)" }}>
          {label}
        </div>
      </div>
    </div>
  );
}