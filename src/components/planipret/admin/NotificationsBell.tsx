import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, Phone, MessageSquare, Voicemail, Sparkles } from "lucide-react";
import { useAdminRealtime, clearAdminUnread, type AdminEvent } from "@/hooks/useAdminRealtime";

const ICONS: Record<AdminEvent["kind"], any> = {
  call: Phone, message: MessageSquare, voicemail: Voicemail, ava: Sparkles,
};
const COLORS: Record<AdminEvent["kind"], string> = {
  call: "#2E9BDC", message: "#10B981", voicemail: "#F5A623", ava: "#A855F7",
};

const relTime = (t: number) => {
  const s = Math.floor((Date.now() - t) / 1000);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}j`;
};

export default function NotificationsBell() {
  const { events, unread } = useAdminRealtime();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const toggle = () => {
    setOpen((v) => {
      const next = !v;
      if (next) clearAdminUnread();
      return next;
    });
  };

  return (
    <div ref={ref} className="relative">
      <button onClick={toggle} className="relative w-9 h-9 rounded-full flex items-center justify-center transition"
        style={{ color: "var(--pp-text-secondary)" }}
        onMouseEnter={(e) => (e.currentTarget.style.background = "var(--pp-bg-elevated)")}
        onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
        <Bell className="w-4 h-4" />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 text-[9px] font-bold text-white rounded-full flex items-center justify-center"
            style={{ background: "var(--pp-danger)", minWidth: 16, height: 16, padding: "0 4px" }}>
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-80 rounded-xl shadow-2xl overflow-hidden z-50"
          style={{ background: "var(--pp-bg-surface)", border: "1px solid var(--pp-bg-border)" }}>
          <div className="px-4 py-3" style={{ borderBottom: "1px solid var(--pp-bg-border)" }}>
            <p style={{ fontSize: 13, fontWeight: 700, color: "var(--pp-text-primary)" }}>Activité en direct</p>
            <p style={{ fontSize: 10, color: "var(--pp-text-muted)" }}>{events.length} événement(s) récent(s)</p>
          </div>
          <div className="max-h-96 overflow-y-auto">
            {events.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm" style={{ color: "var(--pp-text-muted)" }}>
                Aucun événement pour l'instant
              </div>
            ) : events.map((ev) => {
              const Icon = ICONS[ev.kind];
              return (
                <button key={ev.id}
                  onClick={() => { setOpen(false); navigate(ev.href); }}
                  className="w-full text-left px-4 py-3 flex items-start gap-3 transition"
                  style={{ borderBottom: "1px solid var(--pp-bg-border)" }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "var(--pp-bg-elevated)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
                  <div className="rounded-lg p-1.5 flex-shrink-0" style={{ background: `${COLORS[ev.kind]}22` }}>
                    <Icon className="w-3.5 h-3.5" style={{ color: COLORS[ev.kind] }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p style={{ fontSize: 12, fontWeight: 600, color: "var(--pp-text-primary)" }}>{ev.label}</p>
                    <p style={{ fontSize: 10, color: "var(--pp-text-muted)" }} className="mt-0.5">il y a {relTime(ev.at)}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
