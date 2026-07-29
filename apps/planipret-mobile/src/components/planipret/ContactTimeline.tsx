import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Phone, MessageSquare, Voicemail, Mail, User } from "lucide-react";

type Item = { type: "call" | "sms" | "voicemail" | "email" | "contact"; at: string; data: any };

const ICONS: Record<string, any> = { call: Phone, sms: MessageSquare, voicemail: Voicemail, email: Mail, contact: User };
const COLORS: Record<string, string> = { call: "var(--pp-brand-accent-2)", sms: "#2E9BDC", voicemail: "var(--pp-agent)", email: "#0EA5E9", contact: "#10B981" };

function groupLabel(d: Date) {
  const now = new Date();
  const diffDays = Math.floor((+now - +d) / 86400000);
  if (diffDays === 0) return "Aujourd'hui";
  if (diffDays === 1) return "Hier";
  if (diffDays < 7) return "Cette semaine";
  if (diffDays < 30) return "Ce mois-ci";
  return d.toLocaleDateString("fr-CA", { year: "numeric", month: "long" });
}

export default function ContactTimeline({ number }: { number: string }) {
  const [items, setItems] = useState<Item[]>([]);
  const [meta, setMeta] = useState<{ total: number; first_at: string | null }>({ total: 0, first_at: null });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const sess = (await supabase.auth.getSession()).data.session;
        const r = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/pp-contact-timeline?number=${encodeURIComponent(number)}`, {
          headers: { Authorization: `Bearer ${sess?.access_token}`, apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "" },
        });
        const j = await r.json();
        setItems(j.items ?? []);
        setMeta({ total: j.total ?? 0, first_at: j.first_at ?? null });
      } catch { /* ignore */ }
      setLoading(false);
    })();
  }, [number]);

  if (loading) return <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-slate-400" /></div>;
  if (!items.length) return <div className="text-center py-6 text-sm text-slate-400">Aucun historique</div>;

  let lastGroup = "";
  return (
    <div>
      <div className="mb-3 text-xs text-slate-500">{meta.total} interaction{meta.total > 1 ? "s" : ""}{meta.first_at ? ` · depuis ${new Date(meta.first_at).toLocaleDateString("fr-CA")}` : ""}</div>
      <div className="relative pl-5">
        <div className="absolute left-2 top-0 bottom-0 w-px bg-slate-200" />
        {items.map((it, i) => {
          const d = new Date(it.at);
          const g = groupLabel(d);
          const showGroup = g !== lastGroup; lastGroup = g;
          const Icon = ICONS[it.type] ?? User;
          const color = COLORS[it.type] ?? "#64748b";
          return (
            <div key={i}>
              {showGroup && <div className="text-[11px] uppercase tracking-wider text-slate-400 mt-3 mb-1.5">{g}</div>}
              <div className="relative mb-3">
                <div className="absolute -left-[14px] top-1.5 w-3 h-3 rounded-full ring-2 ring-white" style={{ background: color }} />
                <div className="bg-white border border-slate-100 rounded-lg p-2.5">
                  <div className="flex items-center gap-1.5 text-xs font-semibold" style={{ color }}>
                    <Icon className="w-3.5 h-3.5" />
                    <span>{labelFor(it)}</span>
                    <span className="ml-auto text-[10px] text-slate-400 font-normal">{d.toLocaleString("fr-CA", { hour: "2-digit", minute: "2-digit" })}</span>
                  </div>
                  <div className="text-xs text-slate-600 mt-0.5">{previewFor(it)}</div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function labelFor(it: Item): string {
  switch (it.type) {
    case "call": return `Appel ${it.data.direction === "outbound" ? "sortant" : "entrant"} · ${it.data.duration_seconds ?? 0}s${it.data.lead_score ? ` · Score ${it.data.lead_score}/10` : ""}`;
    case "sms": return `SMS ${it.data.direction === "outbound" ? "envoyé" : "reçu"}`;
    case "voicemail": return `Voicemail · ${it.data.duration_seconds ?? 0}s`;
    case "email": return "Courriel";
    case "contact": return "Contact Maestro";
  }
}

function previewFor(it: Item): string {
  switch (it.type) {
    case "sms": return (it.data.body ?? "").slice(0, 100);
    case "voicemail": return (it.data.transcript ?? "(pas de transcription)").slice(0, 100);
    case "email": return it.data.subject ?? "";
    case "contact": return [it.data.name ?? it.data.full_name, it.data.email].filter(Boolean).join(" · ");
    default: return "";
  }
}
