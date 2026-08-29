import { FormEvent, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Globe, Moon, Sun } from "lucide-react";
import { useMplanipretLang } from "@/hooks/useMplanipretLang";
import { useMplanipretTheme } from "@/hooks/useMplanipretTheme";
import { useSafeAreaInsets } from "@/hooks/useSafeAreaInsets";
import avaLogoAsset from "@/assets/ava-statistics-logo.png.asset.json";
import planipretLogoAsset from "@/assets/planipret-logo.png.asset.json";
import { startMicrosoftSignIn } from "@/lib/ms365AuthLogin";
import { clearMs365Pending } from "@/lib/ms365Pending";
import { Ms365PendingBanner } from "@/components/planipret/mobile/Ms365PendingBanner";

const AvaBadge = ({ size = 44 }: { size?: number }) => (
  <img src={avaLogoAsset.url} alt="AVA" style={{ width: size, height: size, objectFit: "contain", borderRadius: 10 }} />
);
const PlanipretBadge = ({ size = 44 }: { size?: number }) => (
  <img src={planipretLogoAsset.url} alt="Planiprêt" style={{ width: size, height: size, objectFit: "contain", borderRadius: 10 }} />
);


/** Auth screen for /mplanipret. Bilingual, App Store / Play Store-ready. */
export default function MobileAuthScreen({ onLoggedIn, msRedirect = "/mplanipret/home" }: { onLoggedIn: () => Promise<void> | void; msRedirect?: string }) {
  const { t, lang, toggle: toggleLang } = useMplanipretLang();
  const { theme, toggle: toggleTheme } = useMplanipretTheme();
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [showLegal, setShowLegal] = useState<null | "tos" | "privacy">(null);

  const friendlyError = (raw?: string | null): string => {
    const msg = String(raw || "");
    if (/invalid login credentials/i.test(msg)) {
      return lang === "fr" ? "Courriel ou mot de passe incorrect." : "Incorrect email or password.";
    }
    if (/email not confirmed/i.test(msg)) {
      return lang === "fr" ? "Ce compte n'est pas encore confirmé." : "This account is not confirmed yet.";
    }
    if (/rate|too many/i.test(msg)) {
      return lang === "fr" ? "Trop de tentatives. Réessayez dans quelques minutes." : "Too many attempts. Please try again in a few minutes.";
    }
    if (/network|fetch|timeout|load failed/i.test(msg)) {
      return lang === "fr" ? "Connexion réseau instable. Réessayez." : "Unstable network connection. Please try again.";
    }
    return msg || t("auth.failed");
  };

  /**
   * iOS WKWebView occasionally fails `fetch` with the opaque message
   * "Load failed" (seen during Apple review). XHR uses a different network
   * path and succeeds, so we use it as a last-resort transport and then hand
   * the tokens back to the Supabase client via setSession().
   */
  const passwordSignInViaXhr = (mail: string, pass: string) =>
    new Promise<{ error: string | null }>((resolve) => {
      try {
        const url = `${import.meta.env.VITE_SUPABASE_URL}/auth/v1/token?grant_type=password`;
        const xhr = new XMLHttpRequest();
        xhr.open("POST", url, true);
        xhr.setRequestHeader("Content-Type", "application/json");
        xhr.setRequestHeader("apikey", import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string);
        xhr.timeout = 20000;
        xhr.onload = async () => {
          try {
            const body = JSON.parse(xhr.responseText || "{}");
            if (xhr.status >= 200 && xhr.status < 300 && body?.access_token) {
              const { error } = await supabase.auth.setSession({
                access_token: body.access_token,
                refresh_token: body.refresh_token,
              });
              resolve({ error: error?.message ?? null });
              return;
            }
            resolve({ error: body?.msg || body?.error_description || `HTTP ${xhr.status}` });
          } catch (e: any) {
            resolve({ error: e?.message || "parse_error" });
          }
        };
        xhr.onerror = () => resolve({ error: "network" });
        xhr.ontimeout = () => resolve({ error: "timeout" });
        xhr.send(JSON.stringify({ email: mail, password: pass }));
      } catch (e: any) {
        resolve({ error: e?.message || "network" });
      }
    });

  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    setFormError(null);
    if (!email || !password) { setFormError(t("auth.missing")); toast.error(t("auth.missing")); return; }
    setLoading(true);
    const mail = email.trim().toLowerCase();
    try {
      const attempt = () => supabase.auth.signInWithPassword({ email: mail, password });
      const isTransport = (m?: string | null) => /network|fetch|timeout|load failed|failed to fetch/i.test(String(m || ""));
      let { error } = await attempt();
      // Retry once on transient network failures (common on review devices).
      if (error && isTransport(error.message)) {
        await new Promise((r) => setTimeout(r, 800));
        ({ error } = await attempt());
      }
      // Still a transport failure → fall back to XHR.
      if (error && isTransport(error.message)) {
        const fallback = await passwordSignInViaXhr(mail, password);
        error = fallback.error ? ({ message: fallback.error } as any) : null;
      }

      if (error) {
        const msg = friendlyError(error.message);
        setFormError(msg);
        toast.error(msg);
        return;
      }
      clearMs365Pending();
      toast.success(t("auth.success"));
      void import("@/lib/native/requestPermissionsAfterLogin").then(m => m.requestPermissionsAfterLogin());
      await onLoggedIn();
    } catch (err: any) {
      const msg = friendlyError(err?.message);
      setFormError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };


  const forgot = async () => {
    if (!email) { toast.error(t("auth.email")); return; }
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) toast.error(friendlyError(error.message));
    else toast.success(lang === "fr" ? "Courriel envoyé" : "Email sent");
  };

  const signInWithMicrosoft = async () => {
    setLoading(true);
    setFormError(null);
    try {
      await startMicrosoftSignIn(msRedirect, {
        loginHint: email.trim() || undefined,
        prompt: "select_account",
      });
    }
    catch (error: any) {
      clearMs365Pending();
      const msg = lang === "fr"
        ? "Connexion Microsoft indisponible. Utilisez votre courriel et mot de passe ci-dessus."
        : "Microsoft sign-in is unavailable. Please use your email and password above.";
      setFormError(msg);
      toast.error(msg);
    }
    finally { setLoading(false); }
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
        <Ms365PendingBanner onRetry={signInWithMicrosoft} />


        {/* Microsoft SSO — primary sign-in method */}
        <div className="px-6">
          <button type="button" onClick={signInWithMicrosoft} disabled={loading}
            className="w-full rounded-xl py-3.5 font-bold flex items-center justify-center gap-2.5 disabled:opacity-60"
            style={{ background: "#FFFFFF", border: "1px solid rgba(0,0,0,0.10)", color: "#1B1B1F", fontSize: 15, minHeight: 50, boxShadow: "0 8px 26px rgba(0,0,0,0.28)" }}>
            <svg width="18" height="18" viewBox="0 0 23 23" aria-hidden>
              <rect x="1" y="1" width="10" height="10" fill="#F25022"/>
              <rect x="12" y="1" width="10" height="10" fill="#7FBA00"/>
              <rect x="1" y="12" width="10" height="10" fill="#00A4EF"/>
              <rect x="12" y="12" width="10" height="10" fill="#FFB900"/>
            </svg>
            {t("auth.signInMs")}
          </button>
          <p style={{ fontSize: 11.5, color: "var(--pp-text-muted)", textAlign: "center", marginTop: 8 }}>
            {lang === "fr" ? "Méthode recommandée pour les courtiers Planiprêt" : "Recommended for Planiprêt brokers"}
          </p>

          <div className="flex items-center gap-2 mt-4 mb-1" style={{ color: "var(--pp-text-faint)", fontSize: 11 }}>
            <div className="flex-1 h-px" style={{ background: "var(--pp-bg-border)" }} />
            <span className="uppercase tracking-wider">{t("auth.or")}</span>
            <div className="flex-1 h-px" style={{ background: "var(--pp-bg-border)" }} />
          </div>
        </div>

        {/* Email/password (secondary) */}
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
          {formError && (
            <div style={{ background: "rgba(220,38,38,0.12)", border: "1px solid rgba(220,38,38,0.4)", color: "#F87171", borderRadius: 12, padding: "10px 12px", fontSize: 12.5 }}>
              {formError}
            </div>
          )}
          <button type="submit" disabled={loading} onClick={(e) => { e.preventDefault(); void submit(); }}
            className="w-full rounded-xl py-3 font-bold disabled:opacity-60"
            style={{ background: "var(--pp-bg-elevated)", border: "1px solid var(--pp-bg-border-2)", color: "var(--pp-text-primary)", fontSize: 14 }}>
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

      {/* Footer */}
      <div className="h-[28px] flex items-center justify-center gap-2 pp-mobile-footer">
        <span style={{ fontFamily: "Urbanist,sans-serif", fontSize: 9, color: "var(--pp-text-muted)", letterSpacing: "0.14em", fontWeight: 600 }}>{t("footer.poweredBy")}</span>
        <div style={{ background: "#7C3AED", borderRadius: 4, padding: "2px 5px", color: "white", fontWeight: 700, fontSize: 8 }}>AVA</div>
        <span style={{ fontFamily: "Urbanist,sans-serif", fontSize: 9, color: "var(--pp-brand-accent-2)", letterSpacing: "0.10em", fontWeight: 700 }}>AVA</span>
        <span style={{ fontSize: 8.5, color: "var(--pp-text-faint)", letterSpacing: "0.1em" }}>· {t("footer.developedBy")}</span>
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
