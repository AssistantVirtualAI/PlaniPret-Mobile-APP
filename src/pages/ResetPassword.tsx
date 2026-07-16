import { useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Mail, Lock, ArrowLeft, CheckCircle2, Loader2 } from "lucide-react";
import { loginWithRedirect, ROUTES } from "@/lib/routes";

export default function ResetPassword() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error: err } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}${loginWithRedirect(ROUTES.MPLANIPRET)}`,
    });
    setLoading(false);
    if (err) { setError(err.message); return; }
    setSent(true);
  };

  return (
    <div
      className="min-h-screen w-full relative overflow-hidden flex items-center justify-center p-4"
      style={{
        background:
          "radial-gradient(1100px 700px at 85% -10%, rgba(0,212,170,0.15), transparent 60%), radial-gradient(900px 600px at -10% 110%, rgba(46,155,220,0.16), transparent 60%), linear-gradient(180deg, #030810 0%, #061226 100%)",
      }}
    >
      <div
        aria-hidden
        className="absolute inset-0 opacity-[0.06] pointer-events-none"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.6) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.6) 1px, transparent 1px)",
          backgroundSize: "44px 44px",
          maskImage: "radial-gradient(ellipse at center, black 40%, transparent 75%)",
        }}
      />

      <div
        className="relative w-full max-w-md rounded-3xl p-8 md:p-10 border"
        style={{
          background: "linear-gradient(180deg, rgba(10,22,40,0.95), rgba(6,18,38,0.92))",
          borderColor: "rgba(46,155,220,0.18)",
          boxShadow: "0 40px 80px -20px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.04)",
        }}
      >
        <div className="absolute inset-x-0 top-0 h-[2px] rounded-t-3xl"
             style={{ background: "linear-gradient(90deg, transparent, #2E9BDC, #00D4AA, transparent)" }} />

        <div className="w-14 h-14 mx-auto rounded-2xl flex items-center justify-center mb-5"
             style={{ background: "linear-gradient(135deg, rgba(46,155,220,0.18), rgba(0,212,170,0.12))", color: "#2E9BDC" }}>
          {sent ? <CheckCircle2 className="w-7 h-7" /> : <Lock className="w-7 h-7" />}
        </div>

        <h1 className="text-2xl font-bold text-center text-white" style={{ fontFamily: "Inter,sans-serif" }}>
          {sent ? "Lien envoyé" : "Mot de passe oublié"}
        </h1>
        <p className="text-sm text-center mt-2" style={{ color: "#4A7FA5" }}>
          {sent
            ? "Consultez votre boîte de réception pour réinitialiser votre mot de passe."
            : "Saisissez votre courriel pour recevoir un lien de réinitialisation."}
        </p>

        {sent ? (
          <div className="mt-7 space-y-4">
            <div className="rounded-xl px-4 py-3 text-sm text-center"
                 style={{ background: "rgba(0,212,170,0.08)", border: "1px solid rgba(0,212,170,0.25)", color: "#7FE7CB" }}>
              Lien envoyé à <b>{email}</b>
            </div>
            <Link to={loginWithRedirect(ROUTES.MPLANIPRET)}
                  className="w-full inline-flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-sm"
                  style={{ background: "linear-gradient(90deg,#2E9BDC,#00D4AA)", color: "#03101A" }}>
              <ArrowLeft className="w-4 h-4" /> Retour à la connexion
            </Link>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="mt-7 space-y-4">
            <div>
              <label className="text-xs font-medium tracking-wide mb-1.5 block" style={{ color: "#94B4D4" }}>Courriel</label>
              <div className="relative">
                <Mail className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "#4A7FA5" }} />
                <input
                  type="email" required value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="vous@planipret.ca"
                  className="w-full rounded-xl pl-10 pr-3 py-3 text-sm text-white outline-none focus:ring-2"
                  style={{ background: "rgba(3,8,16,0.7)", border: "1px solid rgba(46,155,220,0.18)" }}
                />
              </div>
            </div>

            {error && (
              <div className="text-sm rounded-xl px-3 py-2.5"
                   style={{ background: "rgba(232,76,76,0.08)", border: "1px solid rgba(232,76,76,0.25)", color: "#FFB4B4" }}>
                {error}
              </div>
            )}

            <button type="submit" disabled={loading}
                    className="w-full py-3 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-60"
                    style={{ background: "linear-gradient(90deg,#2E9BDC,#00D4AA)", color: "#03101A",
                             boxShadow: "0 10px 28px -10px rgba(46,155,220,0.6)" }}>
              {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Envoi...</> : "Envoyer le lien"}
            </button>

            <Link to={loginWithRedirect(ROUTES.MPLANIPRET)}
                  className="block text-center text-xs hover:underline pt-2"
                  style={{ color: "#4A7FA5" }}>
              ← Retour à la connexion
            </Link>
          </form>
        )}
      </div>
    </div>
  );
}
