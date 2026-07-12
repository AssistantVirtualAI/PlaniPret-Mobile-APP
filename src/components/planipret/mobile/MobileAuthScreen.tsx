import { FormEvent, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Globe, Moon, Sun } from "lucide-react";
import { useMplanipretLang } from "@/hooks/useMplanipretLang";
import { useMplanipretTheme } from "@/hooks/useMplanipretTheme";

const AvaBadge = ({ size = 14 }: { size?: number }) => (
  <div style={{ background: "#7C3AED", borderRadius: 12, padding: "8px 12px", color: "white", fontWeight: 700, fontSize: size, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>AVA</div>
);
const PlanipretBadge = () => (
  <div style={{ background: "#1A4A8A", borderRadius: 12, padding: "8px 12px", color: "white", fontWeight: 700, fontSize: 14, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>P</div>
);

/** Auth screen for /mplanipret. Bilingual, App Store / Play Store-ready. */
export default function MobileAuthScreen({ onLoggedIn }: { onLoggedIn: () => Promise<void> | void }) {
  const { t, lang, toggle: toggleLang } = useMplanipretLang();
  const { theme, toggle: toggleTheme } = useMplanipretTheme();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [showLegal, setShowLegal] = useState<null | "tos" | "privacy">(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!email || !password) { toast.error(t("auth.missing")); return; }
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setLoading(false);
    if (error) { toast.error(error.message || t("auth.failed")); return; }
    toast.success(t("auth.success"));
    void import("@/lib/native/requestPermissionsAfterLogin").then(m => m.requestPermissionsAfterLogin());
    await onLoggedIn();
  };

  const forgot = async () => {
    if (!email) { toast.error(t("auth.email")); return; }
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) toast.error(error.message);
    else toast.success(lang === "fr" ? "Courriel envoyé" : "Email sent");
  };

  const signInWithMicrosoft = async () => {
    setLoading(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "azure",
      options: {
        redirectTo: `${window.location.origin}/mplanipret`,
        scopes: "email openid profile offline_access User.Read User.ReadBasic.All Mail.ReadWrite Mail.Send MailboxSettings.Read Calendars.ReadWrite Chat.Read Chat.ReadBasic Chat.ReadWrite Channel.ReadBasic.All ChannelMessage.Read.All ChannelMessage.Send Team.ReadBasic.All Organization.Read.All Application.Read.All",
      },
    });
    setLoading(false);
    if (error) {
      const msg = /unsupported|not enabled|provider/i.test(error.message)
        ? t("auth.msUnavailable")
        : error.message;
      toast.error(msg);
    }
  };

  return (
    /* Plein écran avec safe-area via CSS env() — pas de JS */
    <div style={{
      position: "fixed",
      inset: 0,
      background: "linear-gradient(160deg, #060D1A 0%, #0A1425 60%, #0D1B2A 100%)",
      display: "flex",
      flexDirection: "column",
      paddingTop: "env(safe-area-inset-top, 44px)",
      paddingBottom: "env(safe-area-inset-bottom, 34px)",
      overflowY: "auto",
      WebkitOverflowScrolling: "touch",
    }}>

      {/* Top control row: lang + theme */}
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, padding: "12px 16px 0" }}>
        <button onClick={toggleLang}
          style={{
            display: "flex", alignItems: "center", gap: 4,
            padding: "6px 10px", borderRadius: 999,
            fontSize: 11, fontWeight: 700,
            background: "rgba(255,255,255,0.08)",
            border: "1px solid rgba(255,255,255,0.12)",
            color: "rgba(255,255,255,0.6)",
            cursor: "pointer",
          }}
          aria-label={t("header.lang")}>
          <Globe style={{ width: 14, height: 14 }} />
          <span>{lang.toUpperCase()}</span>
        </button>
        <button onClick={toggleTheme}
          style={{
            display: "flex", alignItems: "center", justifyContent: "center",
            width: 30, height: 30, borderRadius: "50%",
            background: "rgba(255,255,255,0.08)",
            border: "1px solid rgba(255,255,255,0.12)",
            color: "rgba(255,255,255,0.6)",
            cursor: "pointer",
          }}
          aria-label={t("header.theme")}>
          {theme === "light" ? <Moon style={{ width: 16, height: 16 }} /> : <Sun style={{ width: 16, height: 16 }} />}
        </button>
      </div>

      {/* Zone centrale — prend tout l'espace disponible et centre son contenu */}
      <div style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        padding: "0 24px",
        minHeight: 0,
      }}>

        {/* Logos + titre */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: 28 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <AvaBadge />
            <span style={{ fontFamily: "Urbanist,sans-serif", fontWeight: 800, fontSize: 20, color: "rgba(255,255,255,0.3)" }}>×</span>
            <PlanipretBadge />
          </div>
          <h1 style={{
            fontFamily: "Urbanist,sans-serif", fontWeight: 700, fontSize: 24,
            color: "#FFFFFF", marginTop: 20, letterSpacing: "-0.01em", textAlign: "center",
          }}>
            {t("auth.welcomeTitle")}
          </h1>
          <p style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", marginTop: 6, textAlign: "center", lineHeight: 1.5 }}>
            {t("auth.welcomeSubtitle")}
          </p>
        </div>

        {/* Bouton Microsoft */}
        <button type="button" onClick={signInWithMicrosoft} disabled={loading}
          style={{
            width: "100%", borderRadius: 14, padding: "14px 0",
            fontWeight: 600, fontSize: 14,
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            background: "rgba(255,255,255,0.08)",
            border: "1px solid rgba(255,255,255,0.15)",
            color: "#FFFFFF",
            cursor: "pointer",
            opacity: loading ? 0.6 : 1,
            marginBottom: 16,
          }}>
          <svg width="16" height="16" viewBox="0 0 23 23" aria-hidden>
            <rect x="1" y="1" width="10" height="10" fill="#F25022"/>
            <rect x="12" y="1" width="10" height="10" fill="#7FBA00"/>
            <rect x="1" y="12" width="10" height="10" fill="#00A4EF"/>
            <rect x="12" y="12" width="10" height="10" fill="#FFB900"/>
          </svg>
          {t("auth.signInMs")}
        </button>

        {/* Séparateur */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16, color: "rgba(255,255,255,0.25)", fontSize: 11 }}>
          <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.1)" }} />
          <span style={{ textTransform: "uppercase", letterSpacing: "0.08em" }}>{t("auth.or")}</span>
          <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.1)" }} />
        </div>

        {/* Formulaire email/mot de passe */}
        <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div>
            <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.45)", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 6 }}>
              {t("auth.email")}
            </label>
            <input
              value={email} onChange={(e) => setEmail(e.target.value)}
              type="email" autoComplete="email"
              placeholder={t("auth.emailPh")}
              style={{
                width: "100%", borderRadius: 12, padding: "13px 16px",
                background: "rgba(255,255,255,0.07)",
                border: "1px solid rgba(255,255,255,0.14)",
                color: "#FFFFFF", fontSize: 14,
                outline: "none", boxSizing: "border-box",
              }} />
          </div>
          <div>
            <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.45)", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 6 }}>
              {t("auth.password")}
            </label>
            <input
              value={password} onChange={(e) => setPassword(e.target.value)}
              type="password" autoComplete="current-password"
              placeholder={t("auth.passwordPh")}
              style={{
                width: "100%", borderRadius: 12, padding: "13px 16px",
                background: "rgba(255,255,255,0.07)",
                border: "1px solid rgba(255,255,255,0.14)",
                color: "#FFFFFF", fontSize: 14,
                outline: "none", boxSizing: "border-box",
              }} />
          </div>
          <button type="submit" disabled={loading}
            style={{
              width: "100%", borderRadius: 14, padding: "14px 0",
              fontWeight: 700, fontSize: 14, color: "#FFFFFF",
              background: "linear-gradient(135deg, #1A4A8A 0%, #2E9BDC 100%)",
              boxShadow: "0 6px 22px rgba(46,155,220,0.35)",
              border: "none", cursor: "pointer",
              opacity: loading ? 0.6 : 1,
              marginTop: 4,
            }}>
            {loading ? t("auth.signingIn") : t("auth.signIn")}
          </button>
          <button type="button" onClick={forgot}
            style={{
              width: "100%", textAlign: "center", padding: "4px 0",
              fontSize: 12, fontWeight: 600,
              color: "#2E9BDC", background: "none", border: "none", cursor: "pointer",
            }}>
            {t("auth.forgot")}
          </button>
        </form>

        <p style={{ fontSize: 11.5, color: "rgba(255,255,255,0.3)", textAlign: "center", marginTop: 18, lineHeight: 1.5 }}>
          {t("auth.separate")}
        </p>
      </div>

      {/* Legal + footer */}
      <div style={{ padding: "8px 24px 0", textAlign: "center" }}>
        <p style={{ fontSize: 11, color: "rgba(255,255,255,0.25)", lineHeight: 1.6 }}>
          {t("legal.agree")}{" "}
          <button onClick={() => setShowLegal("tos")} style={{ color: "#2E9BDC", textDecoration: "underline", background: "none", border: "none", cursor: "pointer", fontSize: 11 }}>{t("legal.tos")}</button>{" "}
          {t("legal.and")}{" "}
          <button onClick={() => setShowLegal("privacy")} style={{ color: "#2E9BDC", textDecoration: "underline", background: "none", border: "none", cursor: "pointer", fontSize: 11 }}>{t("legal.privacy")}</button>.
        </p>
      </div>

      <div style={{ height: 28, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, marginTop: 8 }}>
        <span style={{ fontFamily: "Urbanist,sans-serif", fontSize: 9, color: "rgba(255,255,255,0.25)", letterSpacing: "0.14em", fontWeight: 600 }}>{t("footer.poweredBy")}</span>
        <div style={{ background: "#7C3AED", borderRadius: 4, padding: "2px 5px", color: "white", fontWeight: 700, fontSize: 8 }}>AVA</div>
        <span style={{ fontFamily: "Urbanist,sans-serif", fontSize: 9, color: "#2E9BDC", letterSpacing: "0.10em", fontWeight: 700 }}>AVA</span>
        <span style={{ fontSize: 8.5, color: "rgba(255,255,255,0.2)", letterSpacing: "0.1em" }}>· {t("footer.developedBy")}</span>
      </div>

      {showLegal && (
        <div
          onClick={() => setShowLegal(null)}
          style={{
            position: "fixed", inset: 0, zIndex: 40,
            display: "flex", alignItems: "flex-end",
            background: "rgba(0,0,0,0.5)",
          }}>
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%", padding: 20, maxHeight: "70%", overflowY: "auto",
              background: "#0F1C2E",
              borderTopLeftRadius: 24, borderTopRightRadius: 24,
              color: "#FFFFFF",
            }}>
            <h3 style={{ fontFamily: "Urbanist,sans-serif", fontWeight: 700, fontSize: 16, marginBottom: 10 }}>
              {showLegal === "tos" ? t("legal.tos") : t("legal.privacy")}
            </h3>
            <p style={{ fontSize: 12.5, lineHeight: 1.55, color: "rgba(255,255,255,0.6)" }}>
              {showLegal === "tos"
                ? (lang === "fr"
                    ? "L'application Planiprêt vous permet de gérer vos appels, messages et leads en toute sécurité. En utilisant l'application, vous acceptez de respecter les conditions d'utilisation d'AVA Statistic. Aucune utilisation frauduleuse n'est tolérée. Vos données restent confidentielles et sont protégées par chiffrement."
                    : "The Planiprêt app lets you securely manage your calls, messages and leads. By using the app you agree to abide by AVA Statistic's terms of use. Fraudulent use is not tolerated. Your data remains confidential and is protected by encryption.")
                : (lang === "fr"
                    ? "Nous collectons uniquement les données nécessaires au fonctionnement de l'application : profil courtier, journal d'appels, messages, transcriptions et préférences. Aucune donnée n'est vendue. Vous pouvez demander la suppression de votre compte à support@avastatistic.ca."
                    : "We collect only the data required to operate the app: broker profile, call logs, messages, transcripts and preferences. No data is ever sold. You can request account deletion at support@avastatistic.ca.")}
            </p>
            <button
              onClick={() => setShowLegal(null)}
              style={{
                marginTop: 16, padding: "10px 20px", borderRadius: 10,
                background: "#2E9BDC", color: "#FFFFFF", fontWeight: 600,
                border: "none", cursor: "pointer",
              }}>
              {t("common.close")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
