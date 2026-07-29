import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

type Suggestion = {
  email: string;
  name?: string;
  source: "ms365" | "history" | "local";
  count?: number;
};

type Props = {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  style?: React.CSSProperties;
  className?: string;
};

/**
 * Multi-recipient autocomplete: reads from
 *   - planipret_ms_contacts (imported MS365 address book)
 *   - planipret_email_messages (people already emailed with)
 * Values are stored as a comma-separated string in `value`.
 */
export default function RecipientAutocomplete({ value, onChange, placeholder, style, className }: Props) {
  const [open, setOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [query, setQuery] = useState("");
  const [alreadyContacted, setAlreadyContacted] = useState<number | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const lastTerm = () => {
    const parts = value.split(",");
    return parts[parts.length - 1].trim();
  };

  useEffect(() => {
    setQuery(lastTerm());
  }, [value]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const q = query.trim();
    if (q.length < 2) { setSuggestions([]); setAlreadyContacted(null); return; }
    debounceRef.current = setTimeout(async () => {
      const like = `%${q.replace(/[%_]/g, "")}%`;
      const [ms, sent, received] = await Promise.all([
        supabase.from("planipret_ms_contacts")
          .select("display_name, emails")
          .or(`display_name.ilike.${like},emails.cs.[{"address":"${q}"}]`)
          .limit(15),
        supabase.from("planipret_email_messages")
          .select("to_recipients, cc_recipients")
          .eq("is_sent_by_me", true)
          .limit(200),
        supabase.from("planipret_email_messages")
          .select("from_email, from_name")
          .ilike("from_email", like)
          .limit(15),
      ]);

      const map = new Map<string, Suggestion>();

      for (const row of (ms.data ?? []) as any[]) {
        for (const e of (row.emails ?? []) as any[]) {
          const addr = String(e?.address ?? "").toLowerCase().trim();
          if (!addr) continue;
          if (!addr.includes(q.toLowerCase()) && !String(row.display_name ?? "").toLowerCase().includes(q.toLowerCase())) continue;
          map.set(addr, { email: addr, name: row.display_name ?? e?.name, source: "ms365" });
        }
      }

      for (const row of (sent.data ?? []) as any[]) {
        for (const r of (row.to_recipients ?? []) as any[]) {
          const addr = String(r?.address ?? "").toLowerCase().trim();
          if (!addr || !addr.includes(q.toLowerCase())) continue;
          const prev = map.get(addr);
          map.set(addr, { email: addr, name: r?.name ?? prev?.name, source: prev?.source ?? "history", count: (prev?.count ?? 0) + 1 });
        }
      }

      for (const row of (received.data ?? []) as any[]) {
        const addr = String(row.from_email ?? "").toLowerCase();
        if (!addr) continue;
        const prev = map.get(addr);
        map.set(addr, { email: addr, name: row.from_name ?? prev?.name, source: prev?.source ?? "history", count: (prev?.count ?? 0) + 1 });
      }

      const list = Array.from(map.values()).sort((a, b) => (b.count ?? 0) - (a.count ?? 0)).slice(0, 8);
      setSuggestions(list);

      // "Déjà en contact" badge for exact address
      if (/@/.test(q)) {
        const { count } = await supabase.from("planipret_email_messages")
          .select("id", { count: "exact", head: true })
          .or(`from_email.eq.${q.toLowerCase()},to_recipients.cs.[{"address":"${q.toLowerCase()}"}]`);
        setAlreadyContacted(count ?? 0);
      } else {
        setAlreadyContacted(null);
      }
    }, 220);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query]);

  const pick = (s: Suggestion) => {
    const parts = value.split(",");
    parts[parts.length - 1] = ` ${s.email}`;
    onChange(parts.join(",").replace(/^\s+/, "") + ", ");
    setOpen(false);
    setSuggestions([]);
  };

  return (
    <div className="relative">
      <input
        value={value}
        onChange={(e) => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder={placeholder}
        className={className}
        style={style}
      />
      {alreadyContacted && alreadyContacted > 0 && (
        <div className="text-[10px] mt-0.5" style={{ color: "var(--pp-brand-accent)" }}>
          ✓ Déjà {alreadyContacted} message{alreadyContacted > 1 ? "s" : ""} échangé{alreadyContacted > 1 ? "s" : ""}
        </div>
      )}
      {open && suggestions.length > 0 && (
        <ul
          className="absolute z-[10000] left-0 right-0 mt-1 rounded-lg overflow-hidden shadow-xl max-h-72 overflow-y-auto"
          style={{ background: "var(--pp-bg-elevated)", border: "1px solid var(--pp-bg-border-2)" }}
        >
          {suggestions.map((s) => (
            <li
              key={s.email}
              onMouseDown={(e) => { e.preventDefault(); pick(s); }}
              className="px-3 py-2 cursor-pointer hover:opacity-80"
              style={{ borderBottom: "1px solid var(--pp-bg-border)" }}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm truncate" style={{ color: "var(--pp-text-primary)" }}>{s.name || s.email}</p>
                  {s.name && <p className="text-[11px] truncate" style={{ color: "var(--pp-text-muted)" }}>{s.email}</p>}
                </div>
                <span className="text-[9px] uppercase px-1.5 py-0.5 rounded" style={{ background: "var(--pp-bg-deep)", color: "var(--pp-text-muted)" }}>
                  {s.source === "ms365" ? "M365" : s.source === "history" ? "Historique" : "Local"}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
