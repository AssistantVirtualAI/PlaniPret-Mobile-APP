import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const PRIMARY = "var(--pp-brand-accent-2)";

const STEPS = [
  { emoji: "📊", title: "Tableau de bord", desc: "Voici votre tableau de bord avec tous vos KPI en un coup d'œil." },
  { emoji: "📞", title: "Appel rapide", desc: "Utilisez le bouton bleu en bas pour passer un appel à tout moment." },
  { emoji: "🤖", title: "AVA analyse vos appels", desc: "Chaque appel est analysé automatiquement: score lead, sentiment, résumé IA." },
  { emoji: "📧", title: "Microsoft 365", desc: "Connectez votre compte M365 dans Plus → Intégrations pour synchroniser emails et calendrier." },
];

export function OnboardingTutorial({ profile, onDone }: { profile: any; onDone: () => void }) {
  const [step, setStep] = useState(profile?.onboarding_step ?? 0);
  const [confetti, setConfetti] = useState(false);

  useEffect(() => {
    if (!profile?.first_login_at) {
      supabase.from("planipret_profiles").update({ first_login_at: new Date().toISOString() }).eq("user_id", profile.user_id).then(() => {});
    }
  }, [profile]);

  const finish = async () => {
    setConfetti(true);
    await supabase.from("planipret_profiles").update({ onboarding_completed: true, onboarding_step: STEPS.length }).eq("user_id", profile.user_id);
    setTimeout(() => {
      toast.success(`Vous êtes prêt! Bonne journée ${profile?.full_name?.split(" ")[0] ?? ""} 🎉`);
      onDone();
    }, 1200);
  };

  const skip = async () => {
    await supabase.from("planipret_profiles").update({ onboarding_completed: true }).eq("user_id", profile.user_id);
    onDone();
  };

  const next = async () => {
    const ns = step + 1;
    if (ns >= STEPS.length) return finish();
    setStep(ns);
    await supabase.from("planipret_profiles").update({ onboarding_step: ns }).eq("user_id", profile.user_id);
  };

  const s = STEPS[step];

  return (
    <div className="fixed inset-0 z-[80] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      {confetti && (
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          {[...Array(40)].map((_, i) => (
            <span key={i} className="absolute text-2xl animate-bounce" style={{
              left: `${Math.random() * 100}%`, top: `${Math.random() * 100}%`,
              animationDelay: `${Math.random() * 0.8}s`, animationDuration: `${0.6 + Math.random()}s`,
            }}>🎉</span>
          ))}
        </div>
      )}
      <div className="bg-white rounded-2xl w-full max-w-sm p-6 shadow-2xl">
        <div className="flex justify-center gap-1.5 mb-4">
          {STEPS.map((_, i) => (
            <span key={i} className={`h-1 rounded-full transition-all ${i === step ? "w-8" : "w-4"}`} style={{ background: i <= step ? PRIMARY : "#E5E7EB" }} />
          ))}
        </div>
        <div className="text-center">
          <div className="text-5xl mb-3">{s.emoji}</div>
          <h2 className="text-lg font-bold mb-2" style={{ color: "var(--pp-text-primary)" }}>{s.title}</h2>
          <p className="text-sm text-slate-600 mb-6">{s.desc}</p>
        </div>
        <div className="flex gap-2">
          <button onClick={skip} className="flex-1 py-2.5 rounded-lg text-sm text-slate-500 hover:bg-slate-50">Passer</button>
          <button onClick={next} className="flex-2 py-2.5 px-6 rounded-lg text-white text-sm font-medium" style={{ background: PRIMARY }}>
            {step === STEPS.length - 1 ? "Terminer 🎉" : "Suivant"}
          </button>
        </div>
        <p className="text-center text-[11px] text-slate-400 mt-3">Étape {step + 1} / {STEPS.length}</p>
      </div>
    </div>
  );
}
