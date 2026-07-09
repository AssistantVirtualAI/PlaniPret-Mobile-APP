import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Link2, CheckCircle2, AlertCircle, Phone, Mail } from "lucide-react";
import { useMplanipretLang } from "@/hooks/useMplanipretLang";

type Profile = {
  full_name?: string | null;
  display_name?: string | null;
  ns_display_name?: string | null;
  extension_name?: string | null;
  ms365_email?: string | null;
  ms365_display_name?: string | null;
  ms365_access_token?: string | null;
  ns_extension?: string | null;
  extension?: string | null;
  ns_domain?: string | null;
  ns_linked?: boolean | null;
};

export default function IdentityCard({ profile, onLinked }: { profile: Profile | null; onLinked: () => Promise<void> | void }) {
  const { t } = useMplanipretLang();
  const [linking, setLinking] = useState(false);
  const [manual, setManual] = useState("");
  const [showManual, setShowManual] = useState(false);

  if (!profile) return null;

  const msConnected = !!profile.ms365_access_token;
  const nsLinked = !!profile.ns_linked && !!(profile.ns_extension || profile.extension);
  const ext = profile.ns_extension || profile.extension;
  const displayName = profile.ns_display_name || profile.extension_name || profile.display_name || profile.full_name || profile.ms365_display_name || profile.ms365_email || "—";
  const avatarLetter = (displayName || profile.ms365_email || "?").slice(0, 1).toUpperCase();

  const autoLink = async () => {
    setLinking(true);
    const { data, error } = await supabase.functions.invoke("ms365-ns-identity-link", { body: {} });
    setLinking(false);
    if (error) { toast.error(error.message); return; }
    const d = data as any;
    if (d?.linked) { toast.success(`${t("home.identity.linkedToExt")} ${d.extension}`); await onLinked(); }
    else if (d?.need_manual) { setShowManual(true); toast.message(t("home.identity.enterManual")); }
    else toast.error(d?.error ?? t("home.identity.linkImpossible"));
  };

  const manualLink = async () => {
    if (!/^\d{3,6}$/.test(manual.trim())) { toast.error(t("home.identity.extInvalid")); return; }
    setLinking(true);
    const { data, error } = await supabase.functions.invoke("ms365-ns-identity-link", { body: { extension: manual.trim() } });
    setLinking(false);
    if (error) { toast.error(error.message); return; }
    const d = data as any;
    if (d?.linked) { toast.success(`${t("home.identity.linkedToExt")} ${d.extension}`); setShowManual(false); await onLinked(); }
    else toast.error(d?.error ?? t("home.identity.extNotFound"));
  };

  return (
    <div className="pp-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="pp-eyebrow">{t("home.identity.title")}</p>
        <span className="pp-pill" style={{
          background: nsLinked ? "rgba(13,122,95,0.10)" : "rgba(178,58,72,0.10)",
          color: nsLinked ? "var(--pp-success)" : "var(--pp-danger)",
          border: `1px solid ${nsLinked ? "rgba(13,122,95,0.30)" : "rgba(178,58,72,0.30)"}`,
        }}>
          {nsLinked ? <><CheckCircle2 className="w-3 h-3" /> {t("home.identity.linked")}</> : <><AlertCircle className="w-3 h-3" /> {t("home.identity.notLinked")}</>}
        </span>
      </div>

      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-full flex items-center justify-center font-bold text-white"
             style={{ background: "linear-gradient(135deg,#0078D4,#005A9E)" }}>
          {avatarLetter}
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold truncate" style={{ color: "var(--pp-text-primary)" }}>
            {displayName}
          </p>
          {msConnected && profile.ms365_email && (
            <p className="text-xs flex items-center gap-1" style={{ color: "var(--pp-text-secondary)" }}>
              <Mail className="w-3 h-3" /> {profile.ms365_email} <span style={{ opacity: 0.6 }}>· Microsoft</span>
            </p>
          )}
          {ext && (
            <p className="text-xs flex items-center gap-1" style={{ color: "var(--pp-text-secondary)" }}>
              <Phone className="w-3 h-3" /> {t("home.identity.extLabel")} {ext}{profile.ns_domain ? ` · ${profile.ns_domain}` : ""} <span style={{ opacity: 0.6 }}>· NS-API</span>
            </p>
          )}
        </div>
      </div>

      {msConnected && !nsLinked && !showManual && (
        <button onClick={autoLink} disabled={linking} className="pp-btn-primary w-full">
          <Link2 className="w-4 h-4" /> {linking ? t("home.identity.linking") : t("home.identity.linkExt")}
        </button>
      )}

      {showManual && (
        <div className="space-y-2">
          <input
            value={manual}
            onChange={(e) => setManual(e.target.value.replace(/\D/g, ""))}
            placeholder={t("home.identity.extPlaceholder")}
            inputMode="numeric"
            className="pp-input w-full"
          />
          <div className="flex gap-2">
            <button onClick={() => setShowManual(false)} className="pp-btn-secondary flex-1">{t("home.identity.cancel")}</button>
            <button onClick={manualLink} disabled={linking} className="pp-btn-primary flex-1">
              {linking ? t("home.identity.validating") : t("home.identity.confirm")}
            </button>
          </div>
        </div>
      )}

      {!msConnected && (
        <p className="text-xs" style={{ color: "var(--pp-text-secondary)" }}>
          {t("home.identity.connectMs365")}
        </p>
      )}
    </div>
  );
}
