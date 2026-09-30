import { useEffect, useRef, useState } from "react";
import { MapPin, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export type ParsedAddress = { streetNumber: string; route: string; city: string; region: string; zip: string };

type Suggestion = { placeId: string; text: string };

const TYPES: [RegExp, string][] = [
  [/^(rue|street|st)\b/i, "1"], [/^(avenue|av|ave)\b/i, "2"], [/^(boulevard|boul|blvd)\b/i, "3"],
  [/^(chemin|ch|road|rd)\b/i, "4"], [/^rang\b/i, "5"], [/^(place|pl)\b/i, "6"],
];
const TYPES_SUFFIX: [RegExp, string][] = [
  [/\s(street|st)$/i, "1"], [/\s(avenue|ave)$/i, "2"], [/\s(boulevard|blvd)$/i, "3"], [/\s(road|rd)$/i, "4"], [/\s(place|pl)$/i, "6"],
];

/** Sépare « Rue Principale » → type Maestro + nom de rue. */
export function splitRoute(route: string): { streetType: string; streetName: string } {
  const r = route.trim();
  for (const [re, v] of TYPES) if (re.test(r)) return { streetType: v, streetName: r.replace(re, "").replace(/^\s*(de la|du|des|de|d')\s*/i, (m) => m).trim() };
  for (const [re, v] of TYPES_SUFFIX) if (re.test(r)) return { streetType: v, streetName: r.replace(re, "").trim() };
  return { streetType: "", streetName: r };
}

const unavailable = "Recherche Google indisponible. Saisissez l’adresse manuellement.";
const retryMessage = "Impossible de rechercher l’adresse pour le moment. Réessayez ou saisissez-la manuellement.";

export default function AddressAutocomplete({ onSelect, className, style }: {
  onSelect: (a: ParsedAddress) => void; className: string; style: React.CSSProperties;
}) {
  const [q, setQ] = useState("");
  const [items, setItems] = useState<Suggestion[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [configurationMissing, setConfigurationMissing] = useState(false);
  const skip = useRef(false);
  const requestSequence = useRef(0);
  const sessionToken = useRef(globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`);

  useEffect(() => {
    if (skip.current) { skip.current = false; return; }
    const input = q.trim();
    if (input.length < 3) { setItems([]); setMessage(null); return; }
    if (configurationMissing) return;

    const requestId = ++requestSequence.current;
    const id = setTimeout(async () => {
      try {
        const { data, error } = await supabase.functions.invoke("pp-address-autocomplete", {
          body: { input, sessionToken: sessionToken.current },
        });
        if (requestId !== requestSequence.current) return;
        if (data?.error === "not_configured") {
          setConfigurationMissing(true);
          setItems([]);
          setMessage(unavailable);
          return;
        }
        if (error || data?.error) {
          setItems([]);
          setMessage(retryMessage);
          return;
        }
        setMessage(null);
        setItems(data?.suggestions ?? []);
      } catch {
        if (requestId === requestSequence.current) {
          setItems([]);
          setMessage(retryMessage);
        }
      }
    }, 300);
    return () => clearTimeout(id);
  }, [q, configurationMissing]);

  const pick = async (s: Suggestion) => {
    skip.current = true;
    setQ(s.text);
    setItems([]);
    setMessage(null);
    try {
      const { data, error } = await supabase.functions.invoke("pp-address-autocomplete", {
        body: { action: "details", placeId: s.placeId, sessionToken: sessionToken.current },
      });
      if (data?.error === "not_configured") {
        setConfigurationMissing(true);
        setMessage(unavailable);
        return;
      }
      if (error || !data || data.error) {
        setMessage(retryMessage);
        return;
      }
      onSelect(data as ParsedAddress);
    } catch {
      setMessage(retryMessage);
    }
  };

  return (
    <div className="relative">
      <div className="relative">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 opacity-60" />
        <input
          className={className}
          style={{ ...style, paddingLeft: 34 }}
          placeholder="Rechercher l’adresse (Google)"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          autoComplete="off"
          aria-label="Rechercher l’adresse Google"
        />
      </div>
      {message && <p className="mt-1 text-[11px]" style={{ color: "var(--pp-text-muted)" }} role="status">{message}</p>}
      {items.length > 0 && (
        <div className="absolute left-0 right-0 mt-1 rounded-xl overflow-hidden shadow-xl z-10"
          style={{ background: "var(--pp-bg-surface)", border: "1px solid var(--pp-bg-border)" }}>
          {items.map((s) => (
            <button key={s.placeId} type="button" onClick={() => void pick(s)}
              className="w-full text-left px-3 py-2 text-sm flex items-start gap-2"
              style={{ color: "var(--pp-text-primary)", borderBottom: "1px solid var(--pp-bg-border)" }}>
              <MapPin className="w-4 h-4 mt-0.5 shrink-0 opacity-60" /> {s.text}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
