import { FormEvent, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useMplanipretLang } from "@/hooks/useMplanipretLang";
import { useMplanipretTheme } from "@/hooks/useMplanipretTheme";

/** Auth screen — pixel-perfect identique à avastatistic.ca/mplanipret */
export default function MobileAuthScreen({ onLoggedIn }: { onLoggedIn: () => Promise<void> | void }) {
  const { t, lang } = useMplanipretLang();
  const { theme } = useMplanipretTheme();
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

  // Style des inputs — identique à la web app
  const inputStyle: React.CSSProperties = {
    padding: "12px 14px",
    borderRadius: 10,
    background: "#0F1A2E",
    border: "1px solid #1B2A41",
    color: "#E8EDF5",
    fontSize: 14,
    width: "100%",
    boxSizing: "border-box",
    outline: "none",
  };

  return (
    <div style={{
      position: "absolute",
      inset: 0,
      background: "#030810",
      color: "#E8EDF5",
      // Safe area via CSS — fonctionne sur tous les iPhones avec notch/Dynamic Island
      paddingTop: "max(60px, env(safe-area-inset-top, 44px))",
      paddingBottom: "max(24px, env(safe-area-inset-bottom, 34px))",
      paddingLeft: 24,
      paddingRight: 24,
      display: "flex",
      flexDirection: "column",
      overflowY: "auto",
      WebkitOverflowScrolling: "touch",
    }}>

      {/* Logos */}
      <div style={{ display: "flex", gap: 16, justifyContent: "center", marginBottom: 18 }}>
        <div style={{
          width: 48, height: 48, borderRadius: 10,
          background: "#7C3AED",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontWeight: 800, fontSize: 15, color: "#fff",
        }}>AVA</div>
        <div style={{
          width: 48, height: 48, borderRadius: 10,
          background: "#1A4A8A",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontWeight: 800, fontSize: 15, color: "#fff",
        }}>P</div>
      </div>

      {/* Titre */}
      <h2 style={{ fontSize: 20, textAlign: "center", margin: "8px 0 4px", fontWeight: 700 }}>
        {t("auth.welcomeTitle")}
      </h2>
      <p style={{ fontSize: 13, color: "#A0B3D0", textAlign: "center", margin: 0 }}>
        {t("auth.welcomeSubtitle")}
      </p>

      {/* Formulaire */}
      <form onSubmit={submit} style={{ marginTop: 24, display: "grid", gap: 10 }}>
        {/* Bouton Microsoft */}
        <button type="button" onClick={signInWithMicrosoft} disabled={loading}
          style={{
            padding: "12px 14px", borderRadius: 10,
            background: "#0F1A2E", border: "1px solid #1B2A41",
            color: "#E8EDF5", fontSize: 14, fontWeight: 600,
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            cursor: "pointer", opacity: loading ? 0.6 : 1,
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
        <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#43546D", fontSize: 11 }}>
          <div style={{ flex: 1, height: 1, background: "#1B2A41" }} />
          <span style={{ textTransform: "uppercase", letterSpacing: "0.06em" }}>{t("auth.or")}</span>
          <div style={{ flex: 1, height: 1, background: "#1B2A41" }} />
        </div>

        {/* Email */}
        <input
          value={email} onChange={(e) => setEmail(e.target.value)}
          placeholder={t("auth.emailPh")}
          type="email" autoComplete="email"
          style={inputStyle} />

        {/* Mot de passe */}
        <input
          value={password} onChange={(e) => setPassword(e.target.value)}
          placeholder={t("auth.passwordPh")}
          type="password" autoComplete="current-password"
          style={inputStyle} />

        {/* Bouton connexion */}
        <button type="submit" disabled={loading}
          style={{
            padding: "12px", borderRadius: 10,
            background: "#2E9BDC", color: "#fff",
            border: 0, fontWeight: 600, fontSize: 14,
            marginTop: 4, cursor: "pointer",
            opacity: loading ? 0.6 : 1,
          }}>
          {loading ? t("auth.signingIn") : t("auth.signIn")}
        </button>

        {/* Mot de passe oublié */}
        <button type="button" onClick={forgot}
          style={{
            background: "none", border: "none",
            color: "#2E9BDC", fontSize: 12, fontWeight: 600,
            cursor: "pointer", padding: "4px 0", textAlign: "center",
          }}>
          {t("auth.forgot")}
        </button>
      </form>

      {/* Footer */}
      <div style={{ marginTop: "auto", textAlign: "center", fontSize: 11, color: "#43546D", paddingTop: 24 }}>
        {t("footer.poweredBy")} AVA · {t("footer.developedBy")}
      </div>

      {/* Legal */}
      <p style={{ fontSize: 10, color: "#2A3A50", textAlign: "center", marginTop: 8, lineHeight: 1.5 }}>
        {t("legal.agree")}{" "}
        <button onClick={() => setShowLegal("tos")} style={{ color: "#2E9BDC", textDecoration: "underline", background: "none", border: "none", cursor: "pointer", fontSize: 10 }}>{t("legal.tos")}</button>{" "}
        {t("legal.and")}{" "}
        <button onClick={() => setShowLegal("privacy")} style={{ color: "#2E9BDC", textDecoration: "underline", background: "none", border: "none", cursor: "pointer", fontSize: 10 }}>{t("legal.privacy")}</button>.
      </p>

      {/* Modal légal */}
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
              color: "#E8EDF5",
            }}>
            <h3 style={{ fontWeight: 700, fontSize: 16, marginBottom: 10 }}>
              {showLegal === "tos" ? t("legal.tos") : t("legal.privacy")}
            </h3>
            <p style={{ fontSize: 12.5, lineHeight: 1.55, color: "#A0B3D0" }}>
              {showLegal === "tos"
                ? (lang === "fr"
                    ? "L'application Planiprêt vous permet de gérer vos appels, messages et leads en toute sécurité. En utilisant l'application, vous acceptez de respecter les conditions d'utilisation d'AVA Statistic."
                    : "The Planiprêt app lets you securely manage your calls, messages and leads. By using the app you agree to abide by AVA Statistic's terms of use.")
                : (lang === "fr"
                    ? "Nous collectons uniquement les données nécessaires au fonctionnement de l'application. Aucune donnée n'est vendue. Vous pouvez demander la suppression de votre compte à support@avastatistic.ca."
                    : "We collect only the data required to operate the app. No data is ever sold. You can request account deletion at support@avastatistic.ca.")}
            </p>
            <button
              onClick={() => setShowLegal(null)}
              style={{
                marginTop: 16, padding: "10px 20px", borderRadius: 10,
                background: "#2E9BDC", color: "#fff", fontWeight: 600,
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
