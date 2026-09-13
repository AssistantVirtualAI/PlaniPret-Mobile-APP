import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PAPage, PAPageHeader } from "@/components/planipret/admin/PAPageShell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Loader2, PhoneCall, RefreshCw, RotateCw, Search } from "lucide-react";
import { toast } from "sonner";
import { useMplanipretLang } from "@/hooks/useMplanipretLang";

const L = (lang: string, fr: string, en: string) => (lang === "en" ? en : fr);

type CallRow = {
  id: string;
  user_id: string | null;
  extension: string | null;
  direction: string | null;
  answered_at: string | null;
  duration_seconds: number | null;
  transcript: string | null;
  created_at: string;
  planipret_profiles?: { full_name: string | null } | null;
};

type SipDevice = { aor: string | null; transport: string | null; registered: boolean; registered_at: string | null };
type SipRow = {
  user_id: string;
  name: string;
  extension: string;
  devices: SipDevice[];
  registered_count: number;
  errors: { created_at: string; status: number | null; path: string; error: string | null }[];
};

type ExtStat = { ext: string; total: number; answered: number; eligible: number; transcribed: number; outbound: number; registered: boolean };
type BrokerStat = {
  key: string;
  name: string;
  exts: ExtStat[];
  total: number;
  answered: number;
  eligible: number;
  transcribed: number;
  outbound: number;
  sipUserId: string | null;
  errors: SipRow["errors"];
};

const RANGES = [7, 14, 30, 90];
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);

export default function PABrokerTelephony() {
  const { lang } = useMplanipretLang();
  const [days, setDays] = useState(14);
  const [loading, setLoading] = useState(false);
  const [calls, setCalls] = useState<CallRow[]>([]);
  const [sip, setSip] = useState<SipRow[]>([]);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const since = new Date(Date.now() - days * 86400000).toISOString();
    const [c, s] = await Promise.all([
      supabase
        .from("planipret_phone_calls")
        .select("id, user_id, extension, direction, answered_at, duration_seconds, transcript, created_at, planipret_profiles(full_name)")
        .gte("created_at", since)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(5000),
      supabase.functions.invoke("pp-admin-sip-ops", { body: { action: "status", limit: 60 } }),
    ]);
    setLoading(false);
    if (c.error) toast.error(c.error.message);
    setCalls((c.data as unknown as CallRow[]) ?? []);
    const res = s.data as { extensions?: SipRow[] } | null;
    setSip(res?.extensions ?? []);
  }, [days]);

  useEffect(() => { void load(); }, [load]);

  const brokers = useMemo(() => {
    const map = new Map<string, BrokerStat>();
    const sipByExt = new Map(sip.map((r) => [String(r.extension), r]));

    const ensure = (key: string, name: string) =>
      map.get(key) ?? { key, name, exts: [], total: 0, answered: 0, eligible: 0, transcribed: 0, outbound: 0, sipUserId: null, errors: [] };

    for (const r of sip) {
      const b = ensure(r.name || r.extension, r.name || r.extension);
      b.sipUserId = r.user_id;
      b.errors = r.errors ?? [];
      if (!b.exts.some((e) => e.ext === String(r.extension))) {
        b.exts.push({ ext: String(r.extension), total: 0, answered: 0, eligible: 0, transcribed: 0, outbound: 0, registered: r.registered_count > 0 });
      }
      map.set(b.key, b);
    }

    for (const r of calls) {
      const ext = String(r.extension ?? "—");
      const name = r.planipret_profiles?.full_name ?? sipByExt.get(ext)?.name ?? L(lang, "Inconnu", "Unknown");
      const b = ensure(name, name);
      let e = b.exts.find((x) => x.ext === ext);
      if (!e) {
        e = { ext, total: 0, answered: 0, eligible: 0, transcribed: 0, outbound: 0, registered: (sipByExt.get(ext)?.registered_count ?? 0) > 0 };
        b.exts.push(e);
      }
      const answered = !!r.answered_at || (r.duration_seconds ?? 0) > 0;
      const eligible = (r.duration_seconds ?? 0) >= 15;
      e.total += 1; b.total += 1;
      if ((r.direction ?? "").toLowerCase().startsWith("out")) { e.outbound += 1; b.outbound += 1; }
      if (answered) { e.answered += 1; b.answered += 1; }
      if (eligible) {
        e.eligible += 1; b.eligible += 1;
        if (r.transcript) { e.transcribed += 1; b.transcribed += 1; }
      }
      map.set(b.key, b);
    }

    return [...map.values()].sort((a, b) => b.total - a.total);
  }, [calls, sip, lang]);

  const filtered = useMemo(() => {
    const n = q.trim().toLowerCase();
    if (!n) return brokers;
    return brokers.filter((b) => b.name.toLowerCase().includes(n) || b.exts.some((e) => e.ext.includes(n)));
  }, [brokers, q]);

  const totals = useMemo(() => ({
    brokers: brokers.length,
    calls: brokers.reduce((s, b) => s + b.total, 0),
    answered: brokers.reduce((s, b) => s + b.answered, 0),
    eligible: brokers.reduce((s, b) => s + b.eligible, 0),
    transcribed: brokers.reduce((s, b) => s + b.transcribed, 0),
    outbound: brokers.reduce((s, b) => s + b.outbound, 0),
  }), [brokers]);

  const relaunch = async (b: BrokerStat) => {
    if (!b.sipUserId) { toast.error(L(lang, "Poste non relié à un courtier.", "Extension not linked to a broker.")); return; }
    setBusy(b.key);
    const { data, error } = await supabase.functions.invoke("pp-admin-sip-ops", { body: { action: "reprovision", broker_id: b.sipUserId } });
    setBusy(null);
    if (error) { toast.error(error.message); return; }
    if ((data as { ok?: boolean })?.ok) toast.success(L(lang, "Relance envoyée.", "Relaunch sent."));
    else toast.error(L(lang, "Relance échouée.", "Relaunch failed."));
    await load();
  };

  return (
    <PAPage>
      <PAPageHeader
        accent="#8B5CF6"
        icon={<PhoneCall className="w-5 h-5" />}
        title={L(lang, "Téléphonie par courtier", "Telephony by broker")}
        subtitle={L(lang, "Postes, appels, taux de réponse et taux de transcription par courtier.", "Extensions, calls, answer rate and transcription rate per broker.")}
        actions={
          <div className="flex items-center gap-2">
            {RANGES.map((d) => (
              <Button key={d} size="sm" variant={days === d ? "default" : "outline"} onClick={() => setDays(d)}>{d}j</Button>
            ))}
            <Button variant="outline" onClick={() => void load()} disabled={loading} className="gap-2">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              {L(lang, "Actualiser", "Refresh")}
            </Button>
          </div>
        }
      />

      <div className="pa-stats">
        <div className="pa-stat">
          <div className="pa-stat-label">{L(lang, "Courtiers", "Brokers")}</div>
          <div className="pa-stat-value">{totals.brokers}</div>
        </div>
        <div className="pa-stat">
          <div className="pa-stat-label">{L(lang, "Appels", "Calls")}</div>
          <div className="pa-stat-value">{totals.calls}</div>
        </div>
        <div className="pa-stat">
          <div className="pa-stat-label">{L(lang, "Taux de réponse", "Answer rate")}</div>
          <div className="pa-stat-value text-emerald-400">{pct(totals.answered, totals.calls)}%</div>
        </div>
        <div className="pa-stat">
          <div className="pa-stat-label">{L(lang, "Taux de transcription (>15s)", "Transcription rate (>15s)")}</div>
          <div className="pa-stat-value text-sky-400">{pct(totals.transcribed, totals.eligible)}%</div>
        </div>
        <div className="pa-stat">
          <div className="pa-stat-label">{L(lang, "Taux d'appels sortants", "Outbound rate")}</div>
          <div className="pa-stat-value text-amber-400">{pct(totals.outbound, totals.calls)}%</div>
        </div>
      </div>

      <Card className="pa-card">
        <CardHeader className="pa-card-head">
          <CardTitle className="pa-card-title">{L(lang, "Courtiers", "Brokers")}</CardTitle>
          <CardDescription className="pa-card-sub">
            {L(lang, "Cliquez une ligne pour voir les postes du courtier.", "Click a row to see the broker's extensions.")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="relative max-w-xs">
            <Search className="w-4 h-4 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={L(lang, "Rechercher", "Search")} className="pl-8" />
          </div>

          <div className="pa-scroll overflow-x-auto">
            <table className="pa-table w-full text-sm">
              <thead>
                <tr>
                  <th>{L(lang, "Courtier", "Broker")}</th>
                  <th>{L(lang, "Postes", "Extensions")}</th>
                  <th className="text-right">{L(lang, "Appels", "Calls")}</th>
                  <th className="text-right">{L(lang, "Répondus", "Answered")}</th>
                  <th className="text-right">{L(lang, "Taux de réponse", "Answer rate")}</th>
                  <th className="text-right">{L(lang, "Transcrits", "Transcribed")}</th>
                  <th className="text-right">{L(lang, "Taux transcription", "Transcript rate")}</th>
                  <th className="text-right">{L(lang, "Taux sortants", "Outbound rate")}</th>
                  <th className="text-right">{L(lang, "Actions", "Actions")}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((b) => {
                  const isOpen = open === b.key;
                  return (
                    <Fragment key={b.key}>
                      <tr className="cursor-pointer" onClick={() => setOpen(isOpen ? null : b.key)}>
                        <td>{b.name}</td>
                        <td className="font-mono text-xs">
                          {b.exts.map((e) => (
                            <span key={e.ext} className="mr-1">
                              <span className={e.registered ? "text-emerald-400" : "text-amber-400"}>●</span>{e.ext}
                            </span>
                          ))}
                        </td>
                        <td className="text-right">{b.total}</td>
                        <td className="text-right">{b.answered}</td>
                        <td className="text-right">{pct(b.answered, b.total)}%</td>
                        <td className="text-right">{b.transcribed}/{b.eligible}</td>
                        <td className="text-right">{pct(b.transcribed, b.eligible)}%</td>
                        <td className="text-right">{pct(b.outbound, b.total)}%</td>
                        <td className="text-right">
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-1"
                            disabled={busy === b.key}
                            onClick={(e) => { e.stopPropagation(); void relaunch(b); }}
                          >
                            {busy === b.key ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCw className="w-3 h-3" />}
                            {L(lang, "Relancer", "Relaunch")}
                          </Button>
                        </td>
                      </tr>
                      {isOpen && (
                        <tr>
                          <td colSpan={9} className="bg-muted/30">
                            <div className="p-3 space-y-3">
                              <table className="pa-table w-full text-xs">
                                <thead>
                                  <tr>
                                    <th>{L(lang, "Poste", "Ext.")}</th>
                                    <th>{L(lang, "Statut SIP", "SIP status")}</th>
                                    <th className="text-right">{L(lang, "Appels", "Calls")}</th>
                                    <th className="text-right">{L(lang, "Taux de réponse", "Answer rate")}</th>
                                    <th className="text-right">{L(lang, "Taux transcription", "Transcript rate")}</th>
                                    <th className="text-right">{L(lang, "Taux sortants", "Outbound rate")}</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {b.exts.map((e) => (
                                    <tr key={e.ext}>
                                      <td className="font-mono">{e.ext}</td>
                                      <td>
                                        <Badge variant={e.registered ? "default" : "destructive"}>
                                          {e.registered ? L(lang, "Inscrit", "Registered") : L(lang, "Non inscrit", "Not registered")}
                                        </Badge>
                                      </td>
                                      <td className="text-right">{e.total}</td>
                                      <td className="text-right">{pct(e.answered, e.total)}%</td>
                                      <td className="text-right">{pct(e.transcribed, e.eligible)}%</td>
                                      <td className="text-right">{pct(e.outbound, e.total)}%</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                              {b.errors.length > 0 && (
                                <div>
                                  <div className="text-xs font-semibold mb-1">{L(lang, "Dernières erreurs SIP", "Last SIP errors")}</div>
                                  {b.errors.slice(0, 5).map((e, i) => (
                                    <div key={i} className="text-xs text-muted-foreground break-all">
                                      {new Date(e.created_at).toLocaleString()} · {e.status ?? "—"} · {e.path}
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
                {!loading && filtered.length === 0 && (
                  <tr><td colSpan={9} className="pa-empty">{L(lang, "Aucun courtier.", "No broker.")}</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </PAPage>
  );
}
