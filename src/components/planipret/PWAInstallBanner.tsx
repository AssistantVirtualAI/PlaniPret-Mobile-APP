import { useEffect, useState } from "react";
import { Smartphone, X } from "lucide-react";

const DISMISS_KEY = "pp_pwa_install_dismissed_until";

export default function PWAInstallBanner() {
  const [evt, setEvt] = useState<any>(null);
  const [hidden, setHidden] = useState(true);

  useEffect(() => {
    // Hide if already installed or recently dismissed
    const standalone = window.matchMedia?.("(display-mode: standalone)").matches || (navigator as any).standalone;
    if (standalone) return;
    const until = Number(localStorage.getItem(DISMISS_KEY) || 0);
    if (Date.now() < until) return;

    const handler = (e: any) => { e.preventDefault(); setEvt(e); setHidden(false); };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  if (hidden || !evt) return null;

  const install = async () => {
    try { await evt.prompt(); } finally { setHidden(true); setEvt(null); }
  };
  const later = () => {
    localStorage.setItem(DISMISS_KEY, String(Date.now() + 7 * 24 * 60 * 60 * 1000));
    setHidden(true);
  };

  return (
    <div
      className="mx-3 mt-2 rounded-xl px-3 py-2 flex items-center gap-3"
      style={{
        background: "linear-gradient(135deg, #0D2A4A, #1A4A8A)",
        border: "1px solid rgba(46,155,220,0.25)",
        color: "#E8EDF5",
      }}
    >
      <Smartphone className="w-5 h-5" style={{ color: "#2E9BDC" }} />
      <p className="text-xs flex-1" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500 }}>
        Installer l'app sur votre téléphone
      </p>
      <button
        onClick={install}
        className="text-xs font-semibold px-3 py-1 rounded-full text-white"
        style={{ background: "linear-gradient(135deg, #1A4A8A, #2E9BDC)", boxShadow: "0 4px 16px rgba(46,155,220,0.35)" }}
      >
        Installer
      </button>
      <button onClick={later} aria-label="Plus tard" className="p-1" style={{ color: "#4A7FA5" }}>
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
