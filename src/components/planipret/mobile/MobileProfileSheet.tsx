import { FormEvent, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { X, LogOut, Globe, Moon, Sun, KeyRound, CheckCircle2 } from "lucide-react";
import { useMplanipretLang } from "@/hooks/useMplanipretLang";
import { useMplanipretTheme } from "@/hooks/useMplanipretTheme";

/**
 * Runtime assertion: the sheet must render INSIDE the mobile phone frame
 * (so it looks like a native tab/modal), positioned absolutely, covering
 * just the frame — not the whole browser window.
 */
function assertOverlayInFrame(el: HTMLElement | null) {
  if (!el || typeof window === "undefined") return;
  try {
    const issues: string[] = [];
    const frame = document.getElementById("pp-mobile-frame");
    if (!frame) issues.push("mobile frame (#pp-mobile-frame) not found");
    else if (!frame.contains(el)) issues.push("sheet rendered outside #pp-mobile-frame");
    const cs = window.getComputedStyle(el);
    if (cs.position !== "absolute") issues.push(`position is ${cs.position} (expected absolute)`);
    if (issues.length) {
      // eslint-disable-next-line no-console
      console.error("[MobileProfileSheet] frame assertion failed:", issues.join("; "));
    }
  } catch { /* ignore */ }
}

type StatusKey =
  | "available" | "busy" | "break" | "offline"
  | "meeting" | "lunch" | "away" | "dnd" | "training" | "remote";

const STATUSES: Array<{ key: StatusKey; color: string }> = [
  { key: "available", color: "#10B981" },
  { key: "busy",      color: "#EF4444" },
  { key: "meeting",   color: "#8B5CF6" },
  { key: "dnd",       color: "#DC2626" },
  { key: "break",     color: "#F59E0B" },
  { key: "lunch",     color: "#F97316" },
  { key: "away",      color: "#64748B" },
  { key: "training",  color: "#0EA5E9" },
  { key: "remote",    color: "#14B8A6" },
  { key: "offline",   color: "#94A3B8" },
];

export default function MobileProfileSheet({
  profile,
  reloadProfile,
  onClose,
}: {
  profile: any;
  reloadProfile: () => Promise<void> | void;
  onClose: () => void;
}) {
  const { t, lang, setLang } = useMplanipretLang();
  const { theme, setTheme } = useMplanipretTheme();
  const [savingStatus, setSavingStatus] = useState<string | null>(null);
  const [pwd1, setPwd1] = useState("");
  const [pwd2, setPwd2] = useState("");
  const [pwdLoading, setPwdLoading] = useState(false);
  const [host, setHost] = useState<HTMLElement | null>(null);

  // Find the mobile frame to portal inside. Retry briefly in case the sheet
  // is opened before the frame mounts.
  useEffect(() => {
    let cancelled = false;
    const tryFind = (attempt = 0) => {
      const el = document.getElementById("pp-mobile-frame");
      if (el) { if (!cancelled) setHost(el); return; }
      if (attempt < 10) window.setTimeout(() => tryFind(attempt + 1), 30);
      else if (!cancelled) setHost(document.body); // fallback
    };
    tryFind();
    return () => { cancelled = true; };
  }, []);

  const setStatus = async (s: string) => {
    if (!profile?.user_id) return;
    setSavingStatus(s);
    const { error } = await supabase.from("planipret_profiles").update({ status: s }).eq("user_id", profile.user_id);
    setSavingStatus(null);
    if (error) { toast.error(error.message); return; }
    toast.success(t("profile.statusUpdated"));
    await reloadProfile();
  };

  const changePassword = async (e: FormEvent) => {
    e.preventDefault();
    if (pwd1.length < 8) { toast.error(t("profile.passwordTooShort")); return; }
    if (pwd1 !== pwd2) { toast.error(t("profile.passwordMismatch")); return; }
    setPwdLoading(true);
    const { error } = await supabase.auth.updateUser({ password: pwd1 });
    setPwdLoading(false);
    if (error) { toast.error(error.message || t("profile.passwordFailed")); return; }
    setPwd1(""); setPwd2("");
    toast.success(t("profile.passwordUpdated"));
  };

  const logout = async () => {
    await supabase.auth.signOut();
    onClose();
    window.location.href = "/mplanipret";
  };

  const overlayRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!host) return;
    const id = window.setTimeout(() => assertOverlayInFrame(overlayRef.current), 50);
    return () => window.clearTimeout(id);
  }, [host]);

  const current = profile?.status ?? "available";
  const initials = (profile?.full_name || profile?.email || "?")
    .split(/\s+/).map((s: string) => s[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();

  if (!host) return null;

  return createPortal(
    <AnimatePresence>
      <motion.div ref={overlayRef} data-testid="mobile-profile-sheet-overlay"
        className="absolute inset-0 flex items-end"
        style={{ background: "rgba(0,0,0,0.45)", zIndex: 9000 }}
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
        <motion.div onClick={(e) => e.stopPropagation()}
          className="w-full max-h-[92%] overflow-y-auto"
          style={{
            background: "var(--pp-bg-surface)",
            borderTopLeftRadius: 28, borderTopRightRadius: 28,
            color: "var(--pp-text-primary)",
            paddingBottom: 28,
            boxShadow: "0 -8px 32px rgba(0,0,0,0.25)",
          }}
          initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
          transition={{ type: "spring", damping: 28, stiffness: 280 }}>
          <div className="pt-3 pb-2 flex items-center justify-center relative">
            <div style={{ width: 36, height: 4, background: "var(--pp-bg-border-2)", borderRadius: 2 }} />
            <button onClick={onClose} className="absolute right-3 top-2 p-2 rounded-full"
              style={{ color: "var(--pp-text-secondary)" }} aria-label={t("common.close")}>
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Identity */}
          <div className="px-5 pt-2 pb-4 flex items-center gap-3">
            <div className="flex items-center justify-center rounded-full font-bold text-white"
              style={{ width: 52, height: 52, background: "linear-gradient(135deg, #1A4A8A, #2E9BDC)", fontSize: 18 }}>
              {initials}
            </div>
            <div className="flex-1 min-w-0">
              <div style={{ fontFamily: "Urbanist,sans-serif", fontWeight: 700, fontSize: 16, color: "var(--pp-text-primary)" }}>
                {profile?.full_name || profile?.email || "—"}
              </div>
              <div style={{ fontSize: 12, color: "var(--pp-text-muted)", display: "flex", gap: 8, flexWrap: "wrap" }}>
                {profile?.email && <span>{profile.email}</span>}
                {profile?.extension && <span>· {t("profile.extension")} {profile.extension}</span>}
              </div>
            </div>
          </div>

          {/* Status */}
          <div className="px-5">
            <div className="pp-eyebrow mb-2">{t("profile.status")}</div>
            <div className="grid grid-cols-2 gap-2">
              {STATUSES.map((s) => {
                const active = current === s.key;
                return (
                  <button key={s.key} onClick={() => setStatus(s.key)} disabled={savingStatus === s.key}
                    className="flex items-center gap-2 rounded-xl px-3 py-2.5 text-left"
                    style={{
                      background: active ? "rgba(46,155,220,0.10)" : "var(--pp-bg-elevated)",
                      border: `1px solid ${active ? "var(--pp-brand-accent)" : "var(--pp-bg-border-2)"}`,
                      color: "var(--pp-text-primary)",
                    }}>
                    <span className="rounded-full" style={{ width: 10, height: 10, background: s.color, flexShrink: 0 }} />
                    <span style={{ fontSize: 12.5, fontWeight: 600 }}>{t(`status.${s.key}`)}</span>
                    {active && <CheckCircle2 className="w-4 h-4 ml-auto" style={{ color: "var(--pp-brand-accent)" }} />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Preferences */}
          <div className="px-5 mt-5">
            <div className="pp-eyebrow mb-2">{t("profile.preferences")}</div>
            <div className="flex items-center justify-between rounded-xl px-3 py-2.5"
              style={{ background: "var(--pp-bg-elevated)", border: "1px solid var(--pp-bg-border-2)" }}>
              <div className="flex items-center gap-2" style={{ fontSize: 13, fontWeight: 600 }}>
                <Globe className="w-4 h-4" style={{ color: "var(--pp-text-muted)" }} />
                {t("header.lang")}
              </div>
              <div className="flex gap-1">
                {(["fr", "en"] as const).map((l) => (
                  <button key={l} onClick={() => setLang(l)}
                    className="px-3 py-1 rounded-full text-[11px] font-bold"
                    style={{
                      background: lang === l ? "var(--pp-brand-accent)" : "transparent",
                      color: lang === l ? "#fff" : "var(--pp-text-muted)",
                      border: "1px solid var(--pp-bg-border-2)",
                    }}>
                    {l.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>
            <div className="mt-2 flex items-center justify-between rounded-xl px-3 py-2.5"
              style={{ background: "var(--pp-bg-elevated)", border: "1px solid var(--pp-bg-border-2)" }}>
              <div className="flex items-center gap-2" style={{ fontSize: 13, fontWeight: 600 }}>
                {theme === "light" ? <Sun className="w-4 h-4" style={{ color: "var(--pp-text-muted)" }} /> : <Moon className="w-4 h-4" style={{ color: "var(--pp-text-muted)" }} />}
                {t("header.theme")}
              </div>
              <div className="flex gap-1">
                {(["light", "dark"] as const).map((th) => (
                  <button key={th} onClick={() => setTheme(th)}
                    className="px-3 py-1 rounded-full text-[11px] font-bold"
                    style={{
                      background: theme === th ? "var(--pp-brand-accent)" : "transparent",
                      color: theme === th ? "#fff" : "var(--pp-text-muted)",
                      border: "1px solid var(--pp-bg-border-2)",
                    }}>
                    {t(`theme.${th}`)}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Password */}
          <form onSubmit={changePassword} className="px-5 mt-5">
            <div className="pp-eyebrow mb-2 flex items-center gap-1.5">
              <KeyRound className="w-3 h-3" /> {t("profile.changePassword")}
            </div>
            <input type="password" value={pwd1} onChange={(e) => setPwd1(e.target.value)}
              placeholder={t("profile.newPassword")}
              className="w-full rounded-xl px-3 py-2.5 outline-none text-[13px]"
              style={{ background: "var(--pp-bg-elevated)", border: "1px solid var(--pp-bg-border-2)", color: "var(--pp-text-primary)" }} />
            <input type="password" value={pwd2} onChange={(e) => setPwd2(e.target.value)}
              placeholder={t("profile.confirmPassword")}
              className="w-full rounded-xl px-3 py-2.5 outline-none text-[13px] mt-2"
              style={{ background: "var(--pp-bg-elevated)", border: "1px solid var(--pp-bg-border-2)", color: "var(--pp-text-primary)" }} />
            <button type="submit" disabled={pwdLoading} className="w-full mt-2 pp-btn-primary disabled:opacity-60">
              {pwdLoading ? t("common.saving") : t("common.save")}
            </button>
          </form>

          {/* Logout */}
          <div className="px-5 mt-5">
            <button onClick={logout}
              className="w-full flex items-center justify-center gap-2 rounded-xl py-3 font-semibold"
              style={{ background: "rgba(178,58,72,0.10)", color: "var(--pp-danger)", border: "1px solid rgba(178,58,72,0.25)", fontSize: 13 }}>
              <LogOut className="w-4 h-4" /> {t("common.logout")}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    host
  );
}
