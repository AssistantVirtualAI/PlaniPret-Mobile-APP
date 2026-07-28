import { useState } from "react";
import { AlertTriangle, Clock, Mail, Loader2, RefreshCw } from "lucide-react";
import { connectMs365 } from "@/lib/ms365Connect";
import { useMplanipretLang } from "@/hooks/useMplanipretLang";
import { setMs365Error, type Ms365State } from "@/hooks/useMs365Status";

/**
 * Clear, actionable notice shown whenever Microsoft 365 is not usable:
 * never connected, token expired, or last call failed. Always offers a
 * one-tap (re)connect action.
 */
export function Ms365ConnectionNotice({
  state,
  errorMessage,
  compact,
  onDismiss,
}: {
  state: Ms365State;
  errorMessage?: string;
  compact?: boolean;
  onDismiss?: () => void;
}) {
  const { t } = useMplanipretLang();
  const [busy, setBusy] = useState(false);

  if (state === "connected") return null;

  const copy =
    state === "expired"
      ? { title: t("ms365.expiredTitle"), body: t("ms365.expiredBody"), Icon: Clock, tone: "#F59E0B" }
      : state === "error"
      ? { title: t("ms365.errorTitle"), body: errorMessage || t("ms365.errorBody"), Icon: AlertTriangle, tone: "#EF4444" }
      : { title: t("ms365.missingTitle"), body: t("ms365.missingBody"), Icon: Mail, tone: "var(--pp-brand-accent)" };

  const label = state === "missing" ? t("ms365.connect") : t("ms365.reconnect");

  const start = async () => {
    setBusy(true);
    setMs365Error(null);
    try {
      await connectMs365();
    } finally {
      setBusy(false);
    }
  };

  const { Icon } = copy;

  return (
    <section
      role="alert"
      aria-live="polite"
      aria-label={copy.title}
      className={compact ? "rounded-xl p-3 flex items-start gap-3" : "rounded-2xl p-6 text-center mt-4"}
      style={{ background: "var(--pp-bg-surface)", border: "1px solid var(--pp-bg-border-2)" }}
    >
      <Icon
        aria-hidden="true"
        className={compact ? "w-5 h-5 shrink-0 mt-0.5" : "w-10 h-10 mx-auto mb-3"}
        style={{ color: copy.tone }}
      />
      <div className={compact ? "flex-1 text-left" : ""}>
        <p className="font-semibold text-sm" style={{ color: "var(--pp-text-primary)" }}>{copy.title}</p>
        <p className="text-xs mt-1 mb-3" style={{ color: "var(--pp-text-muted)" }}>{copy.body}</p>
        <div className={compact ? "flex items-center gap-2" : "flex items-center justify-center gap-2"}>
          <button
            type="button"
            onClick={start}
            disabled={busy}
            className="inline-flex items-center gap-1.5 text-xs px-4 rounded-full text-white font-semibold min-h-11 disabled:opacity-60"
            style={{ background: "linear-gradient(135deg, var(--pp-brand-accent), var(--pp-brand-accent-2))" }}
          >
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" /> : <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />}
            {busy ? t("ms365.checking") : label}
          </button>
          {onDismiss && (
            <button
              type="button"
              onClick={onDismiss}
              className="text-xs px-3 rounded-full min-h-11"
              style={{ border: "1px solid var(--pp-bg-border-2)", color: "var(--pp-text-secondary)" }}
            >
              {t("ms365.later")}
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
