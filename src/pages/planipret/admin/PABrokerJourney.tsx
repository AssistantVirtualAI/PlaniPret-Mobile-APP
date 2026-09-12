import { useEffect, useMemo, useState } from "react";
import { RefreshCw, UserSquare2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PAPage, PAPageHeader } from "@/components/planipret/admin/PAPageShell";
import { PPEmptyState, PPSkeleton } from "@/components/planipret/admin/PPPrimitives";
import { useMplanipretLang } from "@/hooks/useMplanipretLang";

interface BrokerOption { userId: string; name: string }

interface CallRow {
  id: string;
  user_id: string | null;
  status: string | null;
  direction: string | null;
  started_at: string | null;
  ended_at: string | null;
  save_consent: string | null;
  save_consent_at: string | null;
  save_consent_channel: string | null;
  maestro_client_name: string | null;
  from_number: string | null;
  to_number: string | null;
}

interface SmsRow {
  id: string;
  user_id: string | null;
  created_at: string | null;
  to_number: string | null;
  body: string | null;
}

const DAYS = [7, 30, 90];

/**
 * Parcours d'un courtier : ses appels regroupés par statut, ses réponses à la
 * feuille de fin d'appel (sauvegarde Maestro) et les textos qu'il a envoyés.
 */
export default function PABrokerJourney() {
  const { lang } = useMplanipretLang();
  const en = lang === "en";
  const L = (fr: string, e: string) => (en ? e : fr);

  const [brokers, setBrokers] = useState<BrokerOption[]>([]);
  const [broker, setBroker] = useState("");
  const [days, setDays] = useState(30);
  const [calls, setCalls] = useState<CallRow[]>([]);
  const [sms, setSms] = useState<SmsRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const { data } = await supabase
        .from("planipret_profiles")
        .select("user_id, full_name, email")
        .not("user_id", "is", null)
        .order("full_name", { ascending: true });
      if (!alive) return;
      const opts: BrokerOption[] = [];
      const seen = new Set<string>();
      for (const p of (data ?? []) as any[]) {
        const uid = String(p.user_id ?? "");
        if (!uid || seen.has(uid)) continue;
        seen.add(uid);
        opts.push({ userId: uid, name: p.full_name || p.email || uid.slice(0, 8) });
      }
      setBrokers(opts);
      if (!broker && opts[0]) setBroker(opts[0].userId);
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!broker) return;
    let alive = true;
    void (async () => {
      setLoading(true);
      const since = new Date(Date.now() - days * 86400000).toISOString();
      const [c, m] = await Promise.all([
        supabase.from("planipret_phone_calls")
          .select("id, user_id, status, direction, started_at, ended_at, save_consent, save_consent_at, save_consent_channel, maestro_client_name, from_number, to_number")
          .eq("user_id", broker)
          .gte("created_at", since)
          .order("started_at", { ascending: false })
          .limit(1000),
        supabase.from("planipret_phone_messages")
          .select("id, user_id, created_at, to_number, body")
          .eq("user_id", broker)
          .eq("direction", "outbound")
          .gte("created_at", since)
          .order("created_at", { ascending: false })
          .limit(500),
      ]);
      if (!alive) return;
      setCalls((c.data ?? []) as unknown as CallRow[]);
      setSms((m.data ?? []) as unknown as SmsRow[]);
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [broker, days, reloadKey]);

  const byStatus = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of calls) {
      const key = String(c.status || c.direction || "—").toLowerCase();
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [calls]);

  const consent = useMemo(() => {
    let approved = 0, declined = 0, pending = 0;
    for (const c of calls) {
      if (c.save_consent === "approved") approved++;
      else if (c.save_consent === "declined") declined++;
      else pending++;
    }
    return { approved, declined, pending };
  }, [calls]);

  const confirmedCalls = useMemo(
    () => calls.filter((c) => c.save_consent === "approved" || c.save_consent === "declined").slice(0, 100),
    [calls],
  );

  const surface = { background: "var(--pp-bg-surface)", border: "1px solid var(--pp-bg-border)", color: "var(--pp-text-primary)" };
  const dt = (v: string | null) =>
    v ? new Date(v).toLocaleString(en ? "en-CA" : "fr-CA", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: "America/Toronto" }) : "—";

  return (
    <PAPage>
      <PAPageHeader
        icon={<UserSquare2 className="w-5 h-5" />}
        title={L("Parcours du courtier", "Broker journey")}
        subtitle={L(
          "Appels par statut, réponses de fin d'appel et textos envoyés par ce courtier.",
          "Calls by status, end-of-call answers and texts sent by this broker.",
        )}
        actions={
          <div className="flex items-center gap-2">
            <select aria-label={L("Courtier", "Broker")} value={broker} onChange={(e) => setBroker(e.target.value)}
              className="min-h-[36px] rounded-lg px-2 text-xs" style={surface}>
              {brokers.map((b) => <option key={b.userId} value={b.userId}>{b.name}</option>)}
            </select>
            <select aria-label={L("Période", "Period")} value={days} onChange={(e) => setDays(Number(e.target.value))}
              className="min-h-[36px] rounded-lg px-2 text-xs" style={surface}>
              {DAYS.map((d) => <option key={d} value={d}>{d} {L("jours", "days")}</option>)}
            </select>
            <button onClick={() => setReloadKey((k) => k + 1)} className="min-h-[36px] px-3 rounded-lg text-xs inline-flex items-center gap-1.5" style={surface}>
              <RefreshCw className="w-3.5 h-3.5" /> {L("Actualiser", "Refresh")}
            </button>
          </div>
        }
      />

      {loading ? <PPSkeleton /> : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <Tile label={L("Appels", "Calls")} value={calls.length} surface={surface} />
            <Tile label={L("Sauvegardes Maestro", "Maestro saves")} value={consent.approved} surface={surface} tone="#047857" />
            <Tile label={L("Refus", "Declined")} value={consent.declined} surface={surface} tone="#B91C1C" />
            <Tile label={L("Textos envoyés", "Texts sent")} value={sms.length} surface={surface} />
          </div>

          <section className="rounded-xl p-3" style={surface}>
            <h2 className="text-sm font-semibold mb-2">{L("Appels par statut", "Calls by status")}</h2>
            {byStatus.length === 0 ? <PPEmptyState title={L("Aucun appel.", "No call.")} /> : (
              <ul className="flex flex-wrap gap-2">
                {byStatus.map(([s, n]) => (
                  <li key={s} className="rounded-lg px-2.5 py-1.5 text-xs" style={{ background: "rgba(37,99,235,0.08)" }}>
                    <span className="font-semibold">{n}</span> · {s}
                  </li>
                ))}
                <li className="rounded-lg px-2.5 py-1.5 text-xs" style={{ background: "rgba(148,163,184,0.15)" }}>
                  <span className="font-semibold">{consent.pending}</span> · {L("en attente de réponse", "awaiting answer")}
                </li>
              </ul>
            )}
          </section>

          <section className="rounded-xl p-3" style={surface}>
            <h2 className="text-sm font-semibold mb-2">{L("Confirmations de sauvegarde Maestro", "Maestro save confirmations")}</h2>
            {confirmedCalls.length === 0 ? <PPEmptyState title={L("Aucune réponse enregistrée.", "No answer recorded.")} /> : (
              <div className="overflow-x-auto">
                <table className="w-full text-[11.5px]">
                  <thead style={{ color: "var(--pp-text-muted)" }}>
                    <tr className="text-left">
                      <th className="py-1 pr-3">{L("Client", "Client")}</th>
                      <th className="py-1 pr-3">{L("Début", "Start")}</th>
                      <th className="py-1 pr-3">{L("Fin d'appel", "Call ended")}</th>
                      <th className="py-1 pr-3">{L("Réponse", "Answer")}</th>
                      <th className="py-1 pr-3">{L("Répondu à", "Answered at")}</th>
                      <th className="py-1">{L("Canal", "Channel")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {confirmedCalls.map((c) => (
                      <tr key={c.id} style={{ borderTop: "1px solid var(--pp-bg-border)" }}>
                        <td className="py-1 pr-3">{c.maestro_client_name || c.to_number || c.from_number || "—"}</td>
                        <td className="py-1 pr-3">{dt(c.started_at)}</td>
                        <td className="py-1 pr-3">{dt(c.ended_at)}</td>
                        <td className="py-1 pr-3" style={{ color: c.save_consent === "approved" ? "#047857" : "#B91C1C", fontWeight: 600 }}>
                          {c.save_consent === "approved" ? L("sauvegardé", "saved") : L("refusé", "declined")}
                        </td>
                        <td className="py-1 pr-3">{dt(c.save_consent_at)}</td>
                        <td className="py-1">{c.save_consent_channel === "voice" ? L("voix", "voice") : L("écran", "screen")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="rounded-xl p-3" style={surface}>
            <h2 className="text-sm font-semibold mb-2">{L("Textos envoyés", "Texts sent")}</h2>
            {sms.length === 0 ? <PPEmptyState title={L("Aucun texto envoyé.", "No text sent.")} /> : (
              <ul className="space-y-1.5">
                {sms.slice(0, 100).map((m) => (
                  <li key={m.id} className="rounded-lg px-2 py-2 text-[11.5px]" style={{ background: "rgba(148,163,184,0.10)" }}>
                    <span className="flex flex-wrap gap-x-2" style={{ color: "var(--pp-text-muted)" }}>
                      <span style={{ color: "var(--pp-text-primary)", fontWeight: 600 }}>{dt(m.created_at)}</span>
                      <span>{m.to_number || "—"}</span>
                    </span>
                    {m.body && <span className="block break-words mt-0.5">{m.body}</span>}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </PAPage>
  );
}

function Tile({ label, value, surface, tone }: { label: string; value: number; surface: React.CSSProperties; tone?: string }) {
  return (
    <div className="rounded-xl px-3 py-2.5" style={surface}>
      <div className="text-[11px]" style={{ color: "var(--pp-text-muted)" }}>{label}</div>
      <div className="text-xl font-semibold" style={tone ? { color: tone } : undefined}>{value}</div>
    </div>
  );
}
