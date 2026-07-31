/**
 * MChangePassword — in-app password change for the mobile shell.
 * Replaces the old navigate("/reset-password") which did not exist in the
 * mobile router and silently bounced the user back to Home.
 */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Lock, Eye, EyeOff, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useMplanipretLang } from "@/hooks/useMplanipretLang";

const MIN_LEN = 8;

export default function MChangePassword() {
  const nav = useNavigate();
  const { lang } = useMplanipretLang();
  const en = lang === "en";
  const [pwd, setPwd] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const T = {
    title: en ? "Change password" : "Changer le mot de passe",
    sub: en
      ? "Choose a new password for your Planiprêt account."
      : "Choisissez un nouveau mot de passe pour votre compte Planiprêt.",
    newPwd: en ? "New password" : "Nouveau mot de passe",
    confirmPwd: en ? "Confirm password" : "Confirmer le mot de passe",
    save: en ? "Update password" : "Mettre à jour",
    tooShort: en
      ? `Password must be at least ${MIN_LEN} characters.`
      : `Le mot de passe doit contenir au moins ${MIN_LEN} caractères.`,
    mismatch: en ? "Passwords do not match." : "Les mots de passe ne correspondent pas.",
    ok: en ? "Password updated." : "Mot de passe mis à jour.",
    hint: en
      ? "Use at least 8 characters with a mix of letters and numbers."
      : "Utilisez au moins 8 caractères avec des lettres et des chiffres.",
  };

  async function submit(e?: React.FormEvent) {
    e?.preventDefault();
    setErr(null);
    if (pwd.trim().length < MIN_LEN) { setErr(T.tooShort); return; }
    if (pwd !== confirm) { setErr(T.mismatch); return; }
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: pwd });
    setBusy(false);
    if (error) { setErr(error.message); return; }
    toast.success(T.ok);
    setPwd(""); setConfirm("");
    nav("/mplanipret/more", { replace: true });
  }

  return (
    <div className="p-4 space-y-4" style={{ background: "var(--pp-bg-base)", minHeight: "100%" }}>
      <header className="flex items-center gap-3">
        <button
          onClick={() => nav(-1)}
          aria-label={en ? "Back" : "Retour"}
          className="w-9 h-9 rounded-full flex items-center justify-center"
          style={{ background: "var(--pp-surface-1, rgba(255,255,255,0.06))" }}
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="min-w-0">
          <h1 className="text-[20px] font-bold leading-tight">{T.title}</h1>
          <p className="text-[12px]" style={{ color: "var(--pp-text-muted)" }}>{T.sub}</p>
        </div>
      </header>

      <form
        onSubmit={submit}
        className="rounded-2xl p-4 space-y-3"
        style={{ background: "var(--pp-surface-1, rgba(255,255,255,0.04))" }}
      >
        <label className="block text-[12px]" style={{ color: "var(--pp-text-muted)" }}>{T.newPwd}</label>
        <div className="relative">
          <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 opacity-60" />
          <input
            type={show ? "text" : "password"}
            value={pwd}
            autoComplete="new-password"
            maxLength={128}
            onChange={(e) => setPwd(e.target.value)}
            className="w-full h-11 rounded-xl pl-9 pr-10 text-[15px] outline-none"
            style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", color: "inherit" }}
          />
          <button
            type="button"
            onClick={() => setShow((s) => !s)}
            aria-label={show ? (en ? "Hide password" : "Masquer") : (en ? "Show password" : "Afficher")}
            className="absolute right-3 top-1/2 -translate-y-1/2 opacity-70"
          >
            {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>

        <label className="block text-[12px]" style={{ color: "var(--pp-text-muted)" }}>{T.confirmPwd}</label>
        <div className="relative">
          <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 opacity-60" />
          <input
            type={show ? "text" : "password"}
            value={confirm}
            autoComplete="new-password"
            maxLength={128}
            onChange={(e) => setConfirm(e.target.value)}
            className="w-full h-11 rounded-xl pl-9 pr-3 text-[15px] outline-none"
            style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", color: "inherit" }}
          />
        </div>

        <p className="text-[11px]" style={{ color: "var(--pp-text-muted)" }}>{T.hint}</p>
        {err && <p className="text-[12px]" style={{ color: "#E84C4C" }}>{err}</p>}

        <button
          type="submit"
          disabled={busy}
          className="w-full h-11 rounded-xl font-semibold flex items-center justify-center gap-2"
          style={{ background: "var(--pp-brand-accent, #2E9BDC)", color: "#fff", opacity: busy ? 0.6 : 1 }}
        >
          {busy && <Loader2 className="w-4 h-4 animate-spin" />}
          {T.save}
        </button>
      </form>
    </div>
  );
}
