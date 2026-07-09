import { useEffect, useMemo, useState } from "react";
import { MP_DICT } from "@/lib/i18n/mplanipret";
import planipretLogo from "@/assets/planipret-logo.png.asset.json";
import avaLogo from "@/assets/ava-statistics-logo.png.asset.json";

/**
 * Self-contained App Store / Play Store preflight preview.
 *
 * IMPORTANT: This page is intentionally NOT mounted under /mplanipret and
 * does NOT touch the mobile app's routes, guards or organization context.
 * It is a stand-alone visual QA harness so reviewers can eyeball the splash
 * screen, permission prompts and store metadata before a submission.
 *
 * Mounted at /planipret/store-preflight (admin-only viewing context).
 */

type Permission = {
  id: "notifications" | "microphone" | "contacts" | "localNetwork";
  fr: string;
  en: string;
  reason_fr: string;
  reason_en: string;
  ios_plist: string;
  android_manifest: string;
};

const PERMISSIONS: Permission[] = [
  {
    id: "notifications",
    fr: "Notifications",
    en: "Notifications",
    reason_fr: "Recevoir les appels entrants, messages SMS et rappels de rendez-vous Planiprêt.",
    reason_en: "Receive incoming calls, SMS messages and Planiprêt appointment reminders.",
    ios_plist: "UIBackgroundModes → remote-notification, voip",
    android_manifest: "android.permission.POST_NOTIFICATIONS",
  },
  {
    id: "microphone",
    fr: "Microphone",
    en: "Microphone",
    reason_fr: "Passer et recevoir des appels VoIP via le softphone intégré.",
    reason_en: "Place and receive VoIP calls through the embedded softphone.",
    ios_plist: "NSMicrophoneUsageDescription",
    android_manifest: "android.permission.RECORD_AUDIO",
  },
  {
    id: "contacts",
    fr: "Contacts",
    en: "Contacts",
    reason_fr: "Associer les appels et messages aux clients déjà enregistrés sur votre appareil.",
    reason_en: "Match calls and messages with clients already stored on your device.",
    ios_plist: "NSContactsUsageDescription",
    android_manifest: "android.permission.READ_CONTACTS",
  },
  {
    id: "localNetwork",
    fr: "Réseau local (iOS)",
    en: "Local Network (iOS)",
    reason_fr: "Détecter la passerelle SIP/PBX sur votre réseau Wi-Fi pour passer des appels.",
    reason_en: "Discover the SIP/PBX gateway on your Wi-Fi network to place calls.",
    ios_plist: "NSLocalNetworkUsageDescription",
    android_manifest: "(not required)",
  },
];

const QA_CHECKLIST = [
  { id: "splash", fr: "Splash screen avec logos AVA + Planiprêt", en: "Splash screen with AVA + Planiprêt logos" },
  { id: "i18n", fr: "Auth + profil 100% bilingues FR/EN (test parité vert)", en: "Auth + profile fully bilingual FR/EN (parity test green)" },
  { id: "perm", fr: "Toutes les permissions ont une raison non vide", en: "Every permission has a non-empty usage description" },
  { id: "privacy", fr: "Politique de confidentialité accessible (/planipret/privacy)", en: "Privacy Policy reachable (/planipret/privacy)" },
  { id: "tos", fr: "Conditions d'utilisation accessibles", en: "Terms of Use reachable" },
  { id: "delete", fr: "Procédure de suppression de compte documentée", en: "Account deletion procedure documented" },
  { id: "rating", fr: "Classement âge : 4+ (iOS) / Everyone (Play)", en: "Age rating: 4+ (iOS) / Everyone (Play)" },
  { id: "icons", fr: "Icônes 1024×1024 (iOS) et 512×512 (Play) fournies", en: "1024×1024 (iOS) and 512×512 (Play) icons supplied" },
  { id: "shots", fr: "Captures 6.7\" iPhone + Pixel 6 fournies", en: "6.7\" iPhone + Pixel 6 screenshots supplied" },
  { id: "auth", fr: "Compte de test fourni à la révision Apple/Google", en: "Test account provided to Apple/Google reviewers" },
  { id: "routes", fr: "/mplanipret reste isolé du portail admin (test e2e vert)", en: "/mplanipret stays isolated from the admin portal (e2e green)" },
];

type Lang = "fr" | "en";
type Device = "ios" | "android";
type Stage = "splash" | "permissions" | "auth";

export default function StorePreflightPreview() {
  const [lang, setLang] = useState<Lang>("fr");
  const [device, setDevice] = useState<Device>("ios");
  const [stage, setStage] = useState<Stage>("splash");
  const [permIdx, setPermIdx] = useState(0);
  const [checks, setChecks] = useState<Record<string, boolean>>({});

  // Auto-advance splash → permissions after 2.4s for the "RN-like" feel.
  useEffect(() => {
    if (stage !== "splash") return;
    const t = setTimeout(() => setStage("permissions"), 2400);
    return () => clearTimeout(t);
  }, [stage]);

  const dict = MP_DICT[lang];
  const perm = PERMISSIONS[permIdx];

  const passing = useMemo(() => Object.values(checks).filter(Boolean).length, [checks]);
  const ready = passing === QA_CHECKLIST.length;

  const replay = () => { setStage("splash"); setPermIdx(0); };

  return (
    <div style={{ minHeight: "100vh", background: "#0B1220", color: "#E8EDF5", padding: 24, fontFamily: "Inter, system-ui, sans-serif" }}>
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", maxWidth: 1280, margin: "0 auto 24px" }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 700 }}>Planiprêt — Store Preflight</div>
          <div style={{ fontSize: 13, color: "#A0B3D0", marginTop: 4 }}>
            App Store + Google Play QA preview · isolated from <code>/mplanipret</code>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Pill active={device === "ios"} onClick={() => setDevice("ios")}>iOS</Pill>
          <Pill active={device === "android"} onClick={() => setDevice("android")}>Android</Pill>
          <Pill active={lang === "fr"} onClick={() => setLang("fr")}>FR</Pill>
          <Pill active={lang === "en"} onClick={() => setLang("en")}>EN</Pill>
          <Pill onClick={replay}>↻ Replay</Pill>
        </div>
      </header>

      <main style={{ display: "grid", gridTemplateColumns: "minmax(0, 400px) 1fr", gap: 32, maxWidth: 1280, margin: "0 auto", alignItems: "start" }}>
        {/* Phone frame */}
        <div style={{ justifySelf: "center", width: 360, height: 760, borderRadius: 44, border: "8px solid #1B2A41", background: "#030810", overflow: "hidden", position: "relative", boxShadow: "0 24px 60px rgba(0,0,0,0.5)" }}>
          {/* iOS-style notch */}
          {device === "ios" && (
            <div style={{ position: "absolute", top: 8, left: "50%", transform: "translateX(-50%)", width: 110, height: 26, background: "#000", borderRadius: 14, zIndex: 5 }} />
          )}

          {stage === "splash" && (
            <Splash />
          )}

          {stage === "permissions" && (
            <PermissionPrompt
              device={device}
              perm={perm}
              lang={lang}
              isLast={permIdx === PERMISSIONS.length - 1}
              onAllow={() => {
                if (permIdx === PERMISSIONS.length - 1) setStage("auth");
                else setPermIdx((i) => i + 1);
              }}
              onDeny={() => {
                if (permIdx === PERMISSIONS.length - 1) setStage("auth");
                else setPermIdx((i) => i + 1);
              }}
            />
          )}

          {stage === "auth" && (
            <AuthPreview dict={dict} />
          )}
        </div>

        {/* Right column: QA */}
        <section>
          <Card title={lang === "fr" ? "Permissions requises" : "Required permissions"}>
            <div style={{ display: "grid", gap: 10 }}>
              {PERMISSIONS.map((p) => (
                <div key={p.id} style={{ padding: 12, border: "1px solid #1B2A41", borderRadius: 10, background: "#0F1A2E" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                    <strong style={{ fontSize: 14 }}>{lang === "fr" ? p.fr : p.en}</strong>
                    <code style={{ fontSize: 11, color: "#7FB3E0" }}>
                      {device === "ios" ? p.ios_plist : p.android_manifest}
                    </code>
                  </div>
                  <div style={{ fontSize: 13, color: "#A0B3D0", marginTop: 6 }}>
                    {lang === "fr" ? p.reason_fr : p.reason_en}
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card title={lang === "fr" ? "Checklist soumission" : "Submission checklist"}>
            <div style={{ display: "grid", gap: 6 }}>
              {QA_CHECKLIST.map((item) => (
                <label key={item.id} style={{ display: "flex", gap: 10, alignItems: "center", cursor: "pointer", padding: "8px 4px" }}>
                  <input
                    type="checkbox"
                    checked={!!checks[item.id]}
                    onChange={(e) => setChecks((c) => ({ ...c, [item.id]: e.target.checked }))}
                  />
                  <span style={{ fontSize: 14 }}>{lang === "fr" ? item.fr : item.en}</span>
                </label>
              ))}
            </div>
            <div style={{ marginTop: 12, padding: "10px 14px", borderRadius: 8, background: ready ? "#0B3A2E" : "#2A1F0B", color: ready ? "#5FE3A7" : "#F3C969", fontSize: 13, fontWeight: 600 }}>
              {ready
                ? (lang === "fr" ? `✓ Préflight complet (${passing}/${QA_CHECKLIST.length})` : `✓ Preflight complete (${passing}/${QA_CHECKLIST.length})`)
                : (lang === "fr" ? `Préflight en cours (${passing}/${QA_CHECKLIST.length})` : `Preflight in progress (${passing}/${QA_CHECKLIST.length})`)}
            </div>
          </Card>
        </section>
      </main>
    </div>
  );
}

function Pill({ children, active, onClick }: { children: React.ReactNode; active?: boolean; onClick?: () => void }) {
  return (
    <button onClick={onClick} style={{
      padding: "6px 14px", borderRadius: 999, fontSize: 13, fontWeight: 600,
      border: "1px solid " + (active ? "#4A90E2" : "#1B2A41"),
      background: active ? "#1B2D4D" : "transparent",
      color: active ? "#7FB3E0" : "#A0B3D0",
      cursor: "pointer",
    }}>{children}</button>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: "#0A1425", border: "1px solid #1B2A41", borderRadius: 14, padding: 18, marginBottom: 18 }}>
      <h3 style={{ margin: "0 0 12px", fontSize: 15, color: "#E8EDF5" }}>{title}</h3>
      {children}
    </div>
  );
}

function Splash() {
  return (
    <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 18, background: "linear-gradient(180deg, #001a3d 0%, #030810 100%)" }}>
      <div style={{ display: "flex", gap: 18, alignItems: "center" }}>
        <img src={(avaLogo as any).url} alt="" width={56} height={56} style={{ borderRadius: 12 }} />
        <div style={{ width: 1, height: 36, background: "#4A7FA5", opacity: 0.4 }} />
        <img src={(planipretLogo as any).url} alt="" width={56} height={56} style={{ borderRadius: 12 }} />
      </div>
      <div style={{ color: "#7FB3E0", fontSize: 13, letterSpacing: 2 }}>PLANIPRÊT × AVA</div>
      <div style={{ marginTop: 24, width: 120, height: 3, borderRadius: 2, background: "#1B2A41", overflow: "hidden" }}>
        <div style={{ width: "40%", height: "100%", background: "#4A90E2", animation: "pp-load 1.6s infinite" }} />
      </div>
      <style>{`@keyframes pp-load { 0% { transform: translateX(-100%); } 100% { transform: translateX(300%); } }`}</style>
    </div>
  );
}

function PermissionPrompt({ device, perm, lang, onAllow, onDeny, isLast }: {
  device: Device; perm: Permission; lang: Lang; onAllow: () => void; onDeny: () => void; isLast: boolean;
}) {
  const title = lang === "fr" ? perm.fr : perm.en;
  const reason = lang === "fr" ? perm.reason_fr : perm.reason_en;
  const allow = lang === "fr" ? "Autoriser" : "Allow";
  const deny = lang === "fr" ? "Ne pas autoriser" : "Don't Allow";
  const appName = "Planiprêt";

  if (device === "ios") {
    return (
      <div style={{ position: "absolute", inset: 0, background: "rgba(3,8,16,0.7)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <div style={{ width: "100%", background: "#2B2B2D", borderRadius: 14, color: "#fff", textAlign: "center", overflow: "hidden", fontSize: 14 }}>
          <div style={{ padding: "18px 16px 14px" }}>
            <div style={{ fontWeight: 600, marginBottom: 8 }}>
              {lang === "fr" ? `« ${appName} » souhaite accéder à : ${title}` : `"${appName}" Would Like Access to ${title}`}
            </div>
            <div style={{ fontSize: 13, color: "#C7C7CC" }}>{reason}</div>
          </div>
          <div style={{ borderTop: "0.5px solid #48484A", display: "grid", gridTemplateColumns: "1fr 1fr" }}>
            <button onClick={onDeny} style={iosBtn}>{deny}</button>
            <button onClick={onAllow} style={{ ...iosBtn, borderLeft: "0.5px solid #48484A", fontWeight: 600 }}>{allow}</button>
          </div>
          <div style={{ fontSize: 10, color: "#7d7d80", padding: "6px 0" }}>{isLast ? "→ auth" : "→ next"}</div>
        </div>
      </div>
    );
  }
  // Android
  return (
    <div style={{ position: "absolute", inset: 0, background: "rgba(3,8,16,0.7)", display: "flex", alignItems: "flex-end", padding: 16 }}>
      <div style={{ width: "100%", background: "#1F1F1F", borderRadius: 16, color: "#fff", padding: 18 }}>
        <div style={{ fontWeight: 600, fontSize: 15 }}>
          {lang === "fr" ? `Autoriser ${appName} à utiliser ${title.toLowerCase()} ?` : `Allow ${appName} to use ${title.toLowerCase()}?`}
        </div>
        <div style={{ fontSize: 13, color: "#BFC4CA", marginTop: 8 }}>{reason}</div>
        <div style={{ display: "flex", gap: 12, justifyContent: "flex-end", marginTop: 14 }}>
          <button onClick={onDeny} style={androidBtn}>{lang === "fr" ? "Refuser" : "Deny"}</button>
          <button onClick={onAllow} style={{ ...androidBtn, color: "#8AB4F8" }}>{allow}</button>
        </div>
      </div>
    </div>
  );
}

const iosBtn: React.CSSProperties = { background: "transparent", border: 0, color: "#0A84FF", padding: "12px 0", fontSize: 15, cursor: "pointer" };
const androidBtn: React.CSSProperties = { background: "transparent", border: 0, color: "#BFC4CA", padding: "8px 14px", borderRadius: 6, fontSize: 14, fontWeight: 600, cursor: "pointer" };

function AuthPreview({ dict }: { dict: any }) {
  return (
    <div style={{ position: "absolute", inset: 0, background: "#030810", color: "#E8EDF5", padding: "60px 24px 24px", display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", gap: 16, justifyContent: "center", marginBottom: 18 }}>
        <img src={(avaLogo as any).url} width={48} height={48} style={{ borderRadius: 10 }} alt="" />
        <img src={(planipretLogo as any).url} width={48} height={48} style={{ borderRadius: 10 }} alt="" />
      </div>
      <h2 style={{ fontSize: 20, textAlign: "center", margin: "8px 0 4px" }}>{dict.auth.welcomeTitle}</h2>
      <p style={{ fontSize: 13, color: "#A0B3D0", textAlign: "center", margin: 0 }}>{dict.auth.welcomeSubtitle}</p>
      <div style={{ marginTop: 24, display: "grid", gap: 10 }}>
        <input placeholder={dict.auth.emailPh} style={inputStyle} />
        <input placeholder={dict.auth.passwordPh} type="password" style={inputStyle} />
        <button style={{ padding: "12px", borderRadius: 10, background: "#2E9BDC", color: "#fff", border: 0, fontWeight: 600, marginTop: 4 }}>
          {dict.auth.signIn}
        </button>
      </div>
      <div style={{ marginTop: "auto", textAlign: "center", fontSize: 11, color: "#43546D" }}>
        {dict.footer.poweredBy} AVA · {dict.footer.developedBy}
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  padding: "12px 14px", borderRadius: 10, background: "#0F1A2E", border: "1px solid #1B2A41", color: "#E8EDF5", fontSize: 14,
};
