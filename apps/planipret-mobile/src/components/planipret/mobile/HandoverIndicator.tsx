// In-call REST-control network indicator with short history.

import { useEffect, useState } from "react";
import { RefreshCw, ArrowRightLeft } from "lucide-react";
import { handoverController, type HandoverEvent } from "@/lib/planipret/net/handoverController";
import { useMplanipretLang } from "@/hooks/useMplanipretLang";

const MAX = 5;

function label(t: string) {
  if (t === "wifi") return "Wi-Fi";
  if (t === "cellular") return "LTE";
  if (t === "none") return "—";
  return t.toUpperCase();
}

export default function HandoverIndicator() {
  useMplanipretLang();
  const [events, setEvents] = useState<HandoverEvent[]>([]);
  useEffect(() => {
    const un = handoverController.subscribe((e) => {
      setEvents((prev) => [e, ...prev].slice(0, MAX));
    });
    return () => un();
  }, []);
  if (events.length === 0) return null;
  const last = events[0];
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs"
           style={{ background: "rgba(46,155,220,0.15)", border: "1px solid rgba(46,155,220,0.35)" }}>
        {last.kind === "network-change" ? (
          <>
            <ArrowRightLeft className="w-3.5 h-3.5" />
            <span className="font-medium">{label(last.from)} → {label(last.to)}</span>
          </>
        ) : (
          <>
            <RefreshCw className="w-3.5 h-3.5" />
            <span className="font-medium">Contrôle REST actif</span>
          </>
        )}
      </div>
      {events.length > 1 && (
        <div className="flex flex-wrap justify-center gap-1 max-w-[260px]">
          {events.slice(1).map((e, i) => (
            <span key={i} className="text-[10px] px-2 py-0.5 rounded-full text-white/60"
                  style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }}>
              {e.kind === "network-change" ? `${label(e.from)}→${label(e.to)}` : "REST"}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
