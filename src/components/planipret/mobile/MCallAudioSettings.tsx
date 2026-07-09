// Planipret mobile — Call & Audio settings.
// Controls: noise cancellation on/off, quality mode (standard/office/phone),
// auto network handover (Wi-Fi ↔ LTE) on/off. Values persisted in localStorage
// under the `pp_*` namespace and read by useMplanipretSoftphone / handoverController.

import { useEffect, useState } from "react";
import { Mic, Shuffle, Waves } from "lucide-react";
import { NC_MODE_LABELS, type NCMode } from "@/lib/planipret/audio/audioConstraints";
import { useMplanipretLang } from "@/hooks/useMplanipretLang";

const KEYS = {
  nc: "pp_nc_enabled",
  ncMode: "pp_nc_mode",
  handover: "pp_auto_handover",
};

function readBool(k: string, dflt: boolean) {
  try { const v = localStorage.getItem(k); return v === null ? dflt : v === "1"; } catch { return dflt; }
}
function writeBool(k: string, v: boolean) { try { localStorage.setItem(k, v ? "1" : "0"); } catch {} }

export default function MCallAudioSettings() {
  const { t, lang } = useMplanipretLang();
  const [nc, setNc] = useState(() => readBool(KEYS.nc, true));
  const [handover, setHandover] = useState(() => readBool(KEYS.handover, true));
  const [mode, setMode] = useState<NCMode>(() => {
    try { return (localStorage.getItem(KEYS.ncMode) as NCMode) || "standard"; } catch { return "standard"; }
  });

  useEffect(() => writeBool(KEYS.nc, nc), [nc]);
  useEffect(() => writeBool(KEYS.handover, handover), [handover]);
  useEffect(() => { try { localStorage.setItem(KEYS.ncMode, mode); } catch {} }, [mode]);

  const modes: NCMode[] = ["standard", "office", "phone"];

  return (
    <section className="rounded-3xl p-5 mb-4"
             style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
      <div className="flex items-center gap-2 mb-4">
        <Waves className="w-4 h-4 opacity-70" />
        <h3 className="text-sm font-semibold">{t("callSettings.title")}</h3>
      </div>

      <ToggleRow
        icon={<Mic className="w-4 h-4" />}
        label={t("callSettings.ncLabel")}
        sub={t("callSettings.ncSub")}
        value={nc}
        onChange={setNc}
      />

      {nc && (
        <div className="mt-3 grid grid-cols-3 gap-2">
          {modes.map((m) => (
            <button key={m} onClick={() => setMode(m)}
                    className="rounded-2xl px-2 py-2 text-xs font-medium text-left"
                    style={{
                      background: mode === m ? "rgba(46,155,220,0.2)" : "rgba(255,255,255,0.05)",
                      border: `1px solid ${mode === m ? "rgba(46,155,220,0.5)" : "rgba(255,255,255,0.1)"}`,
                    }}>
              <div className="font-semibold">{NC_MODE_LABELS[m][lang]}</div>
              <div className="text-[10px] opacity-70 mt-0.5 leading-tight">
                {NC_MODE_LABELS[m][lang === "fr" ? "desc_fr" : "desc_en"]}
              </div>
            </button>
          ))}
        </div>
      )}

      <div className="my-4 h-px" style={{ background: "rgba(255,255,255,0.06)" }} />

      <ToggleRow
        icon={<Shuffle className="w-4 h-4" />}
        label={t("callSettings.handoverLabel")}
        sub={t("callSettings.handoverSub")}
        value={handover}
        onChange={setHandover}
      />
    </section>
  );
}

function ToggleRow({ icon, label, sub, value, onChange }: {
  icon: React.ReactNode; label: string; sub: string; value: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <button onClick={() => onChange(!value)} className="w-full flex items-center justify-between text-left">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-full flex items-center justify-center"
             style={{ background: "rgba(46,155,220,0.15)", border: "1px solid rgba(46,155,220,0.25)" }}>
          {icon}
        </div>
        <div>
          <div className="text-sm font-medium">{label}</div>
          <div className="text-[11px] opacity-60 mt-0.5">{sub}</div>
        </div>
      </div>
      <div className="w-11 h-6 rounded-full transition-colors relative shrink-0"
           style={{ background: value ? "rgba(46,155,220,0.6)" : "rgba(255,255,255,0.12)" }}>
        <div className="absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all"
             style={{ left: value ? "22px" : "2px" }} />
      </div>
    </button>
  );
}
