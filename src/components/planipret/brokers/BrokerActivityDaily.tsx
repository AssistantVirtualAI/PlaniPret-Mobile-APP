import { AlertTriangle, CheckSquare, MessageSquare, Phone, PhoneIncoming, PhoneMissed, PhoneOutgoing } from "lucide-react";
import { formatDayLabel, groupActivityByDay, type BrokerActivity } from "@/lib/planipret/brokerActivity";

const surface = { background: "var(--pp-bg-surface)", border: "1px solid var(--pp-bg-border)", color: "var(--pp-text-primary)" };
const muted = { color: "var(--pp-text-muted)" };

const time = (iso: string | null, en: boolean) =>
  iso ? new Date(iso).toLocaleTimeString(en ? "en-CA" : "fr-CA", { hour: "2-digit", minute: "2-digit", timeZone: "America/Toronto" }) : "—";

/** Journal quotidien d'un courtier : appels, textos et tâches triés par date. */
export default function BrokerActivityDaily({
  activity, lang, loading, emptyText,
}: { activity: BrokerActivity; lang: "fr" | "en"; loading?: boolean; emptyText?: string }) {
  const en = lang === "en";
  const L = (fr: string, e: string) => (en ? e : fr);
  const days = groupActivityByDay(activity);

  if (loading) {
    return <div className="space-y-2">{[0, 1, 2].map((i) => <div key={i} className="h-16 rounded-xl animate-pulse" style={{ background: "#E2E8F0" }} />)}</div>;
  }
  if (days.length === 0) {
    return <p className="text-sm py-6 text-center" style={muted}>{emptyText ?? L("Aucune activité sur la période.", "No activity for this period.")}</p>;
  }

  return (
    <div className="space-y-3">
      {days.map((d) => (
        <section key={d.day} className="rounded-xl overflow-hidden" style={surface}>
          <header className="px-3 py-2 flex flex-wrap items-center gap-2" style={{ borderBottom: "1px solid var(--pp-bg-border)" }}>
            <span className="text-sm font-semibold capitalize">{formatDayLabel(d.day, lang)}</span>
            <span className="ml-auto flex items-center gap-1.5 text-[10px] font-semibold">
              <Chip icon={<Phone className="w-3 h-3" />} text={`${d.calls.length}`} tone="info" />
              <Chip icon={<MessageSquare className="w-3 h-3" />} text={`${d.messages.length}`} tone="muted" />
              <Chip icon={<CheckSquare className="w-3 h-3" />} text={`${d.tasks.length}`} tone="ok" />
            </span>
          </header>

          <div className="px-3 py-2 space-y-3">
            <Block title={L("Appels", "Calls")} empty={d.calls.length === 0} emptyText={L("Aucun appel.", "No call.")}>
              {d.calls.map((c) => {
                const missed = c.direction === "missed" || c.status === "missed" || c.status === "no-answer";
                const out = c.direction === "outbound";
                const Icon = missed ? PhoneMissed : out ? PhoneOutgoing : PhoneIncoming;
                const secs = Number(c.duration_seconds ?? 0);
                return (
                  <li key={c.id} className="text-[11.5px] flex flex-wrap items-center gap-x-2" style={muted}>
                    <Icon className="w-3 h-3" style={{ color: missed ? "#B91C1C" : out ? "var(--pp-brand-accent)" : "#047857" }} />
                    <span style={{ color: "var(--pp-text-primary)", fontWeight: 600 }}>{time(c.at, en)}</span>
                    <span>{out ? (c.to_number ?? "—") : (c.from_number ?? "—")}</span>
                    <span>{missed ? L("manqué", "missed") : `${Math.floor(secs / 60)}m ${secs % 60}s`}</span>
                    {c.recording_url && (
                      <a href={c.recording_url} target="_blank" rel="noreferrer" className="underline" style={{ color: "var(--pp-brand-accent)" }}>
                        {L("enregistrement", "recording")}
                      </a>
                    )}
                  </li>
                );
              })}
            </Block>

            <Block title={L("Textos", "Texts")} empty={d.messages.length === 0} emptyText={L("Aucun texto.", "No text.")}>
              {d.messages.map((m) => (
                <li key={m.id} className="text-[11.5px] flex flex-wrap items-center gap-x-2" style={muted}>
                  <MessageSquare className="w-3 h-3" style={{ color: "var(--pp-brand-accent)" }} />
                  <span style={{ color: "var(--pp-text-primary)", fontWeight: 600 }}>{time(m.at, en)}</span>
                  <span>{m.direction === "outbound" ? (m.to_number ?? "—") : (m.from_number ?? "—")}</span>
                  <span className="truncate max-w-[60%]">{m.body ?? ""}</span>
                </li>
              ))}
            </Block>

            <Block title={L("Tâches", "Tasks")} empty={d.tasks.length === 0} emptyText={L("Aucune tâche.", "No task.")}>
              {d.tasks.map((t) => (
                <li key={t.id} className="text-[11.5px] flex flex-wrap items-center gap-x-2" style={muted}>
                  {t.overdue
                    ? <AlertTriangle className="w-3 h-3" style={{ color: "#B91C1C" }} />
                    : <CheckSquare className="w-3 h-3" style={{ color: "#047857" }} />}
                  <span style={{ color: "var(--pp-text-primary)", fontWeight: 600 }}>{time(t.at, en)}</span>
                  <span style={{ color: "var(--pp-text-primary)" }}>{t.client}</span>
                  <span className="truncate max-w-[60%]">{t.title}</span>
                  <span>{t.status}</span>
                </li>
              ))}
            </Block>
          </div>
        </section>
      ))}
    </div>
  );
}

function Block({ title, children, empty, emptyText }: { title: string; children: React.ReactNode; empty: boolean; emptyText: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide mb-1" style={muted}>{title}</p>
      {empty ? <p className="text-[11.5px]" style={muted}>{emptyText}</p> : <ul className="space-y-1">{children}</ul>}
    </div>
  );
}

function Chip({ text, icon, tone }: { text: string; icon: React.ReactNode; tone: "info" | "muted" | "ok" }) {
  const tones: Record<string, React.CSSProperties> = {
    info: { background: "rgba(37,99,235,0.10)", color: "var(--pp-brand-accent)" },
    muted: { background: "rgba(100,116,139,0.12)", color: "#475569" },
    ok: { background: "rgba(16,185,129,0.12)", color: "#047857" },
  };
  return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full" style={tones[tone]}>{icon}{text}</span>;
}
