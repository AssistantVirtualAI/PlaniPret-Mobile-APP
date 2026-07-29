import { Mic, Smartphone } from "lucide-react";

const SHORTCUTS = [
  { phrase: "Appelle mon dernier client via Planiprêt", desc: "Ouvre le numéroteur avec le dernier appel sortant." },
  { phrase: "Montre mes leads chauds Planiprêt", desc: "Affiche les appels avec score lead ≥ 8." },
  { phrase: "Qu'est-ce que j'ai aujourd'hui sur Planiprêt?", desc: "Lance le briefing audio AVA." },
];

export function SiriShortcutsCard() {
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
  const openGoogleApp = () => window.open("https://assistant.google.com/", "_blank");

  return (
    <div>
      <p className="px-2 mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
        Raccourcis vocaux
      </p>
      <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100">
          <div className="flex items-center gap-2 mb-2">
            <Mic className="w-4 h-4 text-purple-600" />
            <span className="text-sm font-medium" style={{ color: "var(--pp-text-primary)" }}>
              {isIOS ? "Raccourcis Siri" : "Google Assistant"}
            </span>
          </div>
          <p className="text-[11px] text-slate-500 mb-2">Phrases disponibles :</p>
          <ul className="space-y-2">
            {SHORTCUTS.map((s, i) => (
              <li key={i} className="text-[12px]">
                <div className="font-medium text-slate-700">« {s.phrase} »</div>
                <div className="text-[11px] text-slate-400">{s.desc}</div>
              </li>
            ))}
          </ul>
        </div>
        <button
          onClick={() => isIOS ? alert("Ouvrez l'app Raccourcis iOS et cherchez « Planiprêt »") : openGoogleApp()}
          className="w-full px-4 h-12 flex items-center gap-2 text-left active:bg-slate-50 transition"
        >
          <Smartphone className="w-4 h-4 text-slate-600" />
          <span className="flex-1 text-sm font-medium" style={{ color: "var(--pp-text-primary)" }}>
            {isIOS ? "Ajouter à Siri" : "Configurer Google Assistant"}
          </span>
        </button>
      </div>
    </div>
  );
}
