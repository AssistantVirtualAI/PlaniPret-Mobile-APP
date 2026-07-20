import { FormEvent, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Globe, Moon, Sun } from "lucide-react";
import { useMplanipretLang } from "@/hooks/useMplanipretLang";
import { useMplanipretTheme } from "@/hooks/useMplanipretTheme";
import { useSafeAreaInsets } from "@/hooks/useSafeAreaInsets";
import avaLogoAsset from "@/assets/ava-statistics-logo.png.asset.json";
import planipretLogoAsset from "@/assets/planipret-logo.png.asset.json";

const AvaBadge = ({ size = 44 }: { size?: number }) => (
  <img src={avaLogoAsset.url} alt="AVA" style={{ width: size, height: size, objectFit: "contain", borderRadius: 10 }} />
);
const PlanipretBadge = ({ size = 44 }: { size?: number }) => (
  <img src={planipretLogoAsset.url} alt="Planiprêt" style={{ width: size, height: size, objectFit: "contain", borderRadius: 10 }} />
);


/** Auth screen for /mplanipret. Bilingual, App Store / Play Store-ready. */
export default function MobileAuthScreen({ onLoggedIn }: { onLoggedIn: () => Promise<void> | void }) {
  const { t, lang, toggle: toggleLang } = useMplanipretLang();
  const { theme, toggle: toggleTheme } = useMplanipretTheme();
  const insets = useSafeAreaInsets();
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
    try {
      // On Capacitor (iOS/Android), OAuth must open in an in-app browser
      // (SFSafariViewController / Chrome Custom Tab) and redirect back via
      // the Supabase callback URL. Using window.location.origin would give
      // "capacitor://localhost" which Azure does not accept.
      const SUPABASE_URL = "https://gejxisrqtvxavbrfcoxz.supabase.co";
      const SCOPES = "email openid profile offline_access User.Read User.ReadBasic.All Mail.ReadWrite Mail.Send MailboxSettings.Read Calendars.ReadWrite Chat.Read Chat.ReadBasic Chat.ReadWrite Channel.ReadBasic.All ChannelMessage.Read.All ChannelMessage.Send Team.ReadBasic.All Organization.Read.All Application.Read.All";

      let isNative = false;
      try {
        const { Capacitor } = await import('@capacitor/core');
        isNative = Capacitor.isNativePlatform();
      } catch { /* web */ }

      if (isNative) {
        // Build the Supabase OAuth URL manually so we can open it in the
        // in-app browser instead of navigating the WebView.
        const { data, error } = await supabase.auth.signInWithOAuth({
          provider: "azure",
          options: {
            redirectTo: `${SUPABASE_URL}/auth/v1/callback`,
            scopes: SCOPES,
            skipBrowserRedirect: true, // do NOT navigate the WebView
          },
        });
        if (error) throw error;
        if (!data?.url) throw new Error("No OAuth URL returned");

        // Open in SFSafariViewController (iOS) / Chrome Custom Tab (Android)
        const { Browser } = await import('@capacitor/browser');
        await Browser.open({ url: data.url, presentationStyle: 'popover' });

        // Listen for the deep link callback (appUrlOpen fires when Azure
        // redirects back to the Supabase callback which then redirects to
        // the app via the custom scheme or universal link).
        const { App: CapacitorApp } = await import('@capacitor/app');
        const listener = await CapacitorApp.addListener('appUrlOpen', async (event: { url: string }) => {
          await listener.remove();
          try { await Browser.close(); } catch { /* ignore */ }
          // Extract the Supabase session tokens from the URL fragment/query.
          const url = new URL(event.url);
          const params = new URLSearchParams(
            url.hash ? url.hash.slice(1) : url.search.slice(1)
          );
          const accessToken = params.get('access_token');
          const refreshToken = params.get('refresh_token');
          if (accessToken && refreshToken) {
            const { error: sessErr } = await supabase.auth.setSession({
              access_token: accessToken,
              refresh_token: refreshToken,
            });
            if (sessErr) { toast.error(sessErr.message); setLoading(false); return; }
            toast.success(t("auth.success"));
            void import("@/lib/native/requestPermissionsAfterLogin").then(m => m.requestPermissionsAfterLogin());
            await onLoggedIn();
          } else {
            toast.error(t("auth.failed"));
          }
          setLoading(false);
        });
      } else {
        // Web: standard OAuth redirect
        const { error } = await supabase.auth.signInWithOAuth({
          provider: "azure",
          options: {
            redirectTo: `${window.location.origin}/mplanipret`,
            scopes: SCOPES,
          },
        });
        if (error) throw error;
        // Loading stays true — page will redirect
      }
    } catch (err: any) {
      setLoading(false);
      const msg = /unsupported|not enabled|provider/i.test(err?.message ?? "")
        ? t("auth.msUnavailable")
        : (err?.message ?? t("auth.failed"));
      toast.error(msg);
    }
  };


  return (
    <div style={{
      background: "#0A1425",
      minHeight: "100vh",
      display: "flex",
      flexDirection: "column",
      paddingTop: insets.top,
    }}>
      {/* Top control row: lang + theme */}
      <div className="flex items-center justify-end gap-2 px-4 py-3">
        <button onClick={toggleLang}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-full text-[11px] font-bold"
          style={{ background: "var(--pp-bg-elevated)", border: "1px solid var(--pp-bg-border)", color: "var(--pp-text-secondary)" }}
          aria-label={t("header.lang")}>
          <Globe className="w-3.5 h-3.5" />
          <span>{lang.toUpperCase()}</span>
        </button>
        <button onClick={toggleTheme}
          className="flex items-center justify-center rounded-full"
          style={{ width: 30, height: 30, background: "var(--pp-bg-elevated)", border: "1px solid var(--pp-bg-border)", color: "var(--pp-text-secondary)" }}
          aria-label={t("header.theme")}>
          {theme === "light" ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
        </button>
      </div>

      {/* Centered form area fills available vertical space */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center" }}>
        {/* Logos */}
        <div className="flex flex-col items-center mt-8 mb-6 px-6">
          <div className="flex items-center gap-3">
            <AvaBadge />
            <span style={{ fontFamily: "Urbanist,sans-serif", fontWeight: 800, fontSize: 20, color: "var(--pp-text-faint)" }}>×</span>
            <PlanipretBadge />
          </div>
          <h1 style={{ fontFamily: "Urbanist,sans-serif", fontWeight: 700, fontSize: 22, color: "var(--pp-text-primary)", marginTop: 18, letterSpacing: "-0.01em" }}>
            {t("auth.welcomeTitle")}
          </h1>
          <p style={{ fontSize: 13, color: "var(--pp-text-secondary)", marginTop: 6, textAlign: "center" }}>
            {t("auth.welcomeSubtitle")}
          </p>
        </div>

        {/* Form */}
        {/* Microsoft SSO (primary) */}
        <div className="px-6 mb-3">
          <button type="button" onClick={signInWithMicrosoft} disabled={loading}
            className="w-full rounded-xl py-3 font-semibold flex items-center justify-center gap-2 disabled:opacity-60"
            style={{ background: "var(--pp-bg-elevated)", border: "1px solid var(--pp-bg-border-2)", color: "var(--pp-text-primary)", fontSize: 14 }}>
            <svg width="16" height="16" viewBox="0 0 23 23" aria-hidden>
              <rect x="1" y="1" width="10" height="10" fill="#F25022"/>
              <rect x="12" y="1" width="10" height="10" fill="#7FBA00"/>
              <rect x="1" y="12" width="10" height="10" fill="#00A4EF"/>
              <rect x="12" y="12" width="10" height="10" fill="#FFB900"/>
            </svg>
            {t("auth.signInMs")}
          </button>
          <div className="flex items-center gap-2 my-3" style={{ color: "var(--pp-text-faint)", fontSize: 11 }}>
            <div className="flex-1 h-px" style={{ background: "var(--pp-bg-border)" }} />
            <span className="uppercase tracking-wider">{t("auth.or")}</span>
            <div className="flex-1 h-px" style={{ background: "var(--pp-bg-border)" }} />
          </div>
        </div>

        {/* Email/password fallback */}
        <form onSubmit={submit} className="px-6 space-y-3">
          <div>
            <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "var(--pp-text-muted)", letterSpacing: "0.05em", textTransform: "uppercase", marginBottom: 4 }}>{t("auth.email")}</label>
            <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" autoComplete="email"
              placeholder={t("auth.emailPh")}
              className="w-full rounded-xl px-4 py-3 outline-none"
              style={{ background: "var(--pp-bg-elevated)", border: "1px solid var(--pp-bg-border-2)", color: "var(--pp-text-primary)", fontSize: 14, marginTop: 0 }} />
          </div>
          <div>
            <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "var(--pp-text-muted)", letterSpacing: "0.05em", textTransform: "uppercase", marginBottom: 4 }}>{t("auth.password")}</label>
            <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" autoComplete="current-password"
              placeholder={t("auth.passwordPh")}
              className="w-full rounded-xl px-4 py-3 outline-none"
              style={{ background: "var(--pp-bg-elevated)", border: "1px solid var(--pp-bg-border-2)", color: "var(--pp-text-primary)", fontSize: 14, marginTop: 0 }} />
          </div>
          <button type="submit" disabled={loading}
            className="w-full rounded-xl py-3 font-bold text-white disabled:opacity-60"
            style={{ background: "linear-gradient(135deg, #1A4A8A, #2E9BDC)", boxShadow: "0 6px 22px rgba(46,155,220,0.40)", fontSize: 14 }}>
            {loading ? t("auth.signingIn") : t("auth.signIn")}
          </button>
          <button type="button" onClick={forgot}
            className="w-full text-center py-1 text-[12px] font-semibold"
            style={{ color: "var(--pp-brand-accent)" }}>
            {t("auth.forgot")}
          </button>
        </form>

        <p style={{ fontSize: 11.5, color: "var(--pp-text-muted)", textAlign: "center", marginTop: 14, padding: "0 24px" }}>
          {t("auth.separate")}
        </p>
      </div>

      {/* Legal */}
      <p style={{ fontSize: 11, color: "var(--pp-text-faint)", textAlign: "center", marginTop: "auto", padding: "16px 24px 4px" }}>
        {t("legal.agree")}{" "}
        <button onClick={() => setShowLegal("tos")} style={{ color: "var(--pp-brand-accent)", textDecoration: "underline" }}>{t("legal.tos")}</button>{" "}
        {t("legal.and")}{" "}
        <button onClick={() => setShowLegal("privacy")} style={{ color: "var(--pp-brand-accent)", textDecoration: "underline" }}>{t("legal.privacy")}</button>.
      </p>

      {/* Footer AVA avec logo image */}
      <div className="flex flex-col items-center justify-center gap-0.5 py-2" style={{ borderTop: "1px solid var(--pp-bg-border)", paddingBottom: `calc(env(safe-area-inset-bottom, 0px) + 8px)` }}>
        <div className="flex items-center gap-2">
          <span style={{ fontFamily: "Urbanist,sans-serif", fontSize: 8, color: "var(--pp-text-muted)", letterSpacing: "0.14em", fontWeight: 600 }}>{t("footer.poweredBy")}</span>
          {/* Logo AVA circulaire avec image */}
          <div style={{ width: 22, height: 22, borderRadius: "50%", overflow: "hidden", border: "1.5px solid rgba(124,58,237,0.6)", background: "#0A1628", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <img src={avaLogoAsset.url} alt="AVA" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          </div>
          <span style={{ fontFamily: "Urbanist,sans-serif", fontSize: 12, letterSpacing: "0.06em", fontWeight: 800, color: "#7C3AED" }}>AVA</span>
        </div>
        <span style={{ fontSize: 7, color: "var(--pp-text-faint)", letterSpacing: "0.08em" }}>· {t("footer.developedBy")}</span>
      </div>

      {showLegal && (
        <div className="absolute inset-0 z-40 flex items-end" onClick={() => setShowLegal(null)}
          style={{ background: "rgba(0,0,0,0.45)" }}>
          <div onClick={(e) => e.stopPropagation()} className="w-full p-5 max-h-[70%] overflow-y-auto"
            style={{ background: "var(--pp-bg-surface)", borderTopLeftRadius: 24, borderTopRightRadius: 24, color: "var(--pp-text-primary)" }}>
            <h3 style={{ fontFamily: "Urbanist,sans-serif", fontWeight: 700, fontSize: 16, marginBottom: 10 }}>
              {showLegal === "tos" ? t("legal.tos") : t("legal.privacy")}
            </h3>
            <p style={{ fontSize: 12.5, lineHeight: 1.55, color: "var(--pp-text-secondary)" }}>
              {showLegal === "tos"
                ? (lang === "fr"
                    ? "L'application Planiprêt vous permet de gérer vos appels, messages et leads en toute sécurité. En utilisant l'application, vous acceptez de respecter les conditions d'utilisation d'AVA Statistic. Aucune utilisation frauduleuse n'est tolérée. Vos données restent confidentielles et sont protégées par chiffrement."
                    : "The Planiprêt app lets you securely manage your calls, messages and leads. By using the app you agree to abide by AVA Statistic's terms of use. Fraudulent use is not tolerated. Your data remains confidential and is protected by encryption.")
                : (lang === "fr"
                    ? "Nous collectons uniquement les données nécessaires au fonctionnement de l'application : profil courtier, journal d'appels, messages, transcriptions et préférences. Aucune donnée n'est vendue. Vous pouvez demander la suppression de votre compte à support@avastatistic.ca."
                    : "We collect only the data required to operate the app: broker profile, call logs, messages, transcripts and preferences. No data is ever sold. You can request account deletion at support@avastatistic.ca.")}
            </p>
            <button onClick={() => setShowLegal(null)} className="mt-4 pp-btn-primary inline-block">{t("common.close")}</button>
          </div>
        </div>
      )}
    </div>
  );
}
