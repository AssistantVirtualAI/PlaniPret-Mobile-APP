import { supabase } from "@/integrations/supabase/client";
import { useMplanipretLang } from "@/hooks/useMplanipretLang";

/**
 * Shared FR/EN switch for Planipret. Persists selection to
 * planipret_profiles.language so it stays synced across devices/screens.
 */
export function PlanipretLangSwitch({ className = "" }: { className?: string }) {
  const { lang, setLang } = useMplanipretLang();
  return (
    <div
      className={`flex items-center gap-1 p-0.5 rounded-full ${className}`}
      style={{ background: "#F0F4F9", border: "1px solid var(--pp-bg-border)" }}
    >
      {(["fr", "en"] as const).map((l) => {
        const active = lang === l;
        return (
          <button
            key={l}
            onClick={async () => {
              setLang(l);
              try {
                const { data: { session } } = await supabase.auth.getSession();
                if (session?.user?.id) {
                  await supabase
                    .from("planipret_profiles")
                    .update({ language: l })
                    .eq("user_id", session.user.id);
                }
              } catch { /* non-blocking */ }
            }}
            className="px-2 py-0.5 rounded-full transition"
            style={{
              fontSize: 10.5,
              fontWeight: 700,
              color: active ? "#fff" : "var(--pp-text-muted)",
              background: active ? "linear-gradient(135deg, #1A4A8A, #2E9BDC)" : "transparent",
            }}
            aria-label={l === "fr" ? "Français" : "English"}
          >
            {l.toUpperCase()}
          </button>
        );
      })}
    </div>
  );
}

export default PlanipretLangSwitch;
