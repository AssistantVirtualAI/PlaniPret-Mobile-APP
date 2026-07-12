import { useState } from "react";
import { Bell, Mic, Users, Check, X, Loader2 } from "lucide-react";
import { runPermissionFlow, markPrimerSkipped, type PermissionsResult } from "@/lib/native/permissions/orchestrator";
import { useMplanipretLang } from "@/hooks/useMplanipretLang";

type Props = {
  extension?: string;
  onDone: () => void;
};

const copy = {
  fr: {
    title: "Autorisez Planiprêt",
    subtitle: "Trois autorisations pour une expérience VoIP professionnelle.",
    notif: { t: "Notifications", d: "Recevez les appels et messages, même en arrière-plan." },
    mic: { t: "Microphone", d: "Requis pour passer et recevoir des appels." },
    contacts: { t: "Contacts", d: "Identifiez qui appelle et composez plus vite." },
    continue: "Continuer",
    skip: "Passer",
    working: "Configuration en cours…",
  },
  en: {
    title: "Enable Planiprêt",
    subtitle: "Three permissions for a professional VoIP experience.",
    notif: { t: "Notifications", d: "Get incoming calls and messages even in the background." },
    mic: { t: "Microphone", d: "Required to place and receive calls." },
    contacts: { t: "Contacts", d: "Show who's calling and dial faster." },
    continue: "Continue",
    skip: "Skip",
    working: "Setting up…",
  },
} as const;

export default function PermissionsPrimer({ extension, onDone }: Props) {
  const { lang } = useMplanipretLang();
  const c = copy[lang === "en" ? "en" : "fr"];
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<PermissionsResult | null>(null);

  const handleContinue = async () => {
    setBusy(true);
    try {
      const r = await runPermissionFlow(extension);
      setResult(r);
      setTimeout(onDone, 600);
    } finally {
      setBusy(false);
    }
  };

  const handleSkip = async () => {
    await markPrimerSkipped();
    onDone();
  };

  const Row = ({ icon: Icon, title, desc, status }: { icon: any; title: string; desc: string; status?: string }) => (
    <div
      className="flex items-start gap-3 p-3 rounded-2xl"
      style={{ background: "var(--pp-bg-elevated)", border: "1px solid var(--pp-bg-border-2)" }}
    >
      <div
        className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
        style={{ background: "rgba(46,155,220,0.12)", color: "var(--pp-brand-accent, #2E9BDC)" }}
      >
        <Icon className="w-5 h-5" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold" style={{ color: "var(--pp-text-primary)" }}>{title}</div>
        <div className="text-xs mt-0.5" style={{ color: "var(--pp-text-secondary)" }}>{desc}</div>
      </div>
      {status === "granted" && <Check className="w-5 h-5" style={{ color: "var(--pp-success, #22c55e)" }} />}
      {status === "denied" && <X className="w-5 h-5" style={{ color: "var(--pp-danger, #E84C4C)" }} />}
    </div>
  );

  return (
    /* Overlay semi-transparent — ne bloque pas tout l'écran visuellement */
    <div
      className="fixed inset-0 z-[1000] flex items-end justify-center"
      style={{ background: "rgba(3,8,16,0.75)", backdropFilter: "blur(4px)" }}
      role="dialog"
      aria-modal="true"
    >
      {/* Modale en bas de l'écran (style sheet iOS) */}
      <div
        className="w-full rounded-t-3xl px-6 pt-5 pb-8"
        style={{
          background: "var(--pp-bg-surface, #0A1628)",
          border: "1px solid var(--pp-bg-border-2)",
          borderBottom: "none",
          maxWidth: 480,
          boxShadow: "0 -8px 40px rgba(0,0,0,0.6)",
        }}
      >
        {/* Drag handle */}
        <div className="w-10 h-1 rounded-full mx-auto mb-4" style={{ background: "var(--pp-bg-border-2)" }} />

        <h2 className="text-xl font-bold mb-1" style={{ color: "var(--pp-text-primary)", fontFamily: "Urbanist,sans-serif" }}>
          {c.title}
        </h2>
        <p className="text-sm mb-5" style={{ color: "var(--pp-text-secondary)" }}>{c.subtitle}</p>

        <div className="flex flex-col gap-2.5 mb-5">
          <Row icon={Bell} title={c.notif.t} desc={c.notif.d} status={result?.notifications} />
          <Row icon={Mic} title={c.mic.t} desc={c.mic.d} status={result?.microphone} />
          <Row icon={Users} title={c.contacts.t} desc={c.contacts.d} status={result?.contacts} />
        </div>

        <button
          onClick={handleContinue}
          disabled={busy}
          className="w-full h-12 rounded-full font-semibold flex items-center justify-center gap-2 mb-2"
          style={{
            background: "linear-gradient(135deg, #1A4A8A, #2E9BDC)",
            color: "#fff",
            opacity: busy ? 0.7 : 1,
            fontFamily: "Urbanist,sans-serif",
            fontSize: 15,
          }}
        >
          {busy ? <><Loader2 className="w-4 h-4 animate-spin" /> {c.working}</> : c.continue}
        </button>
        <button
          onClick={handleSkip}
          disabled={busy}
          className="w-full h-10 rounded-full text-sm"
          style={{ color: "var(--pp-text-muted)" }}
        >
          {c.skip}
        </button>
      </div>
    </div>
  );
}
