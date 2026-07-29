import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Loader2, RefreshCw, Search, CheckCircle2, XCircle, PlayCircle, RotateCcw } from "lucide-react";
import { useMplanipretLang } from "@/hooks/useMplanipretLang";

interface ProfileRow {
  id: string;
  user_id: string | null;
  full_name: string | null;
  email: string | null;
  extension: string | null;
  phone: string | null;
  maestro_broker_id: string | null;
}

interface RetryRow {
  call_id: string;
  user_id: string | null;
  attempts: number;
  max_attempts: number;
  status: "pending" | "succeeded" | "abandoned";
  next_attempt_at: string | null;
  last_reason: string | null;
  last_error: string | null;
  last_status: number | null;
  updated_at: string;
}

export default function PATelecomMapping() {
  const { lang } = useMplanipretLang();
  const fr = lang !== "en";
  const t = useMemo(
    () => ({
      title: fr ? "Mapping Telecom" : "Telecom mapping",
      sub: fr
        ? "Associez chaque courtier à son identifiant numérique Maestro Telecom (ex: 67) et testez-le avant d'enregistrer."
        : "Link every broker to their numeric Maestro Telecom id (e.g. 67) and test it before saving.",
      search: fr ? "Rechercher par nom ou courriel…" : "Search by name or email…",
      broker: fr ? "Courtier" : "Broker",
      ext: fr ? "Poste" : "Extension",
      telecomId: fr ? "ID Telecom" : "Telecom id",
      test: fr ? "Tester" : "Test",
      save: fr ? "Enregistrer" : "Save",
      saved: fr ? "Mapping enregistré" : "Mapping saved",
      testOk: (u: string) => (fr ? `OK — SIP: ${u}` : `OK — SIP: ${u}`),
      testFail: (e: string) => (fr ? `Échec: ${e}` : `Failed: ${e}`),
      numeric: fr ? "L'ID doit être numérique" : "Id must be numeric",
      retries: fr ? "File de retry CDR" : "CDR retry queue",
      retriesSub: fr
        ? "État final de chaque synchronisation CDR échouée (en attente / réussi / abandonné)."
        : "Final state of every failed CDR sync (pending / succeeded / abandoned).",
      runNow: fr ? "Exécuter le job" : "Run job",
      reset: fr ? "Relancer" : "Requeue",
      none: fr ? "Aucune entrée" : "No entries",
      pending: fr ? "En attente" : "Pending",
      succeeded: fr ? "Réussi" : "Succeeded",
      abandoned: fr ? "Abandonné" : "Abandoned",
      attempts: fr ? "Tentatives" : "Attempts",
      next: fr ? "Prochaine tentative" : "Next attempt",
      reason: fr ? "Raison" : "Reason",
    }),
    [fr],
  );

  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [retries, setRetries] = useState<RetryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [running, setRunning] = useState(false);

  const call = useCallback(async (body: Record<string, unknown>) => {
    const { data, error } = await supabase.functions.invoke("pp-maestro-admin", { body });
    if (error) throw new Error(error.message);
    return data as any;
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [p, r] = await Promise.all([
        call({ action: "telecom-map-list" }),
        call({ action: "cdr-retries", limit: 100 }),
      ]);
      setProfiles(p?.profiles ?? []);
      setRetries(r?.entries ?? []);
    } catch (e: any) {
      toast.error(e?.message ?? "Error");
    } finally {
      setLoading(false);
    }
  }, [call]);

  useEffect(() => { void load(); }, [load]);

  const filtered = profiles.filter((p) => {
    const s = q.trim().toLowerCase();
    if (!s) return true;
    return [p.full_name, p.email, p.extension, p.maestro_broker_id]
      .some((v) => String(v ?? "").toLowerCase().includes(s));
  });

  const runJob = async () => {
    setRunning(true);
    try {
      const out = await call({ action: "cdr-retry-run", limit: 15 });
      const res = out?.result ?? {};
      toast.success(
        fr
          ? `Job terminé — ${res.enqueued ?? 0} ajoutés, ${res.processed_count ?? 0} traités`
          : `Job done — ${res.enqueued ?? 0} enqueued, ${res.processed_count ?? 0} processed`,
      );
      await load();
    } catch (e: any) {
      toast.error(e?.message ?? "Error");
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">{t.title}</h1>
          <p className="text-sm text-muted-foreground max-w-2xl">{t.sub}</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          {fr ? "Actualiser" : "Refresh"}
        </Button>
      </header>

      <Card className="p-4 space-y-4">
        <div className="relative max-w-sm">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9" placeholder={t.search} value={q} onChange={(e) => setQ(e.target.value)} />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-muted-foreground border-b">
              <tr>
                <th className="p-2">{t.broker}</th>
                <th className="p-2">{t.ext}</th>
                <th className="p-2">{t.telecomId}</th>
                <th className="p-2 w-[280px]" />
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={4} className="p-6 text-center text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin inline" />
                </td></tr>
              )}
              {!loading && filtered.map((p) => (
                <MappingRow key={p.id} profile={p} t={t} call={call} onSaved={load} />
              ))}
              {!loading && !filtered.length && (
                <tr><td colSpan={4} className="p-6 text-center text-muted-foreground">{t.none}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="p-4 space-y-4">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-lg font-semibold">{t.retries}</h2>
            <p className="text-sm text-muted-foreground">{t.retriesSub}</p>
          </div>
          <Button size="sm" onClick={() => void runJob()} disabled={running}>
            {running ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <PlayCircle className="w-4 h-4 mr-2" />}
            {t.runNow}
          </Button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-muted-foreground border-b">
              <tr>
                <th className="p-2">Call</th>
                <th className="p-2">{fr ? "État" : "State"}</th>
                <th className="p-2">{t.attempts}</th>
                <th className="p-2">{t.next}</th>
                <th className="p-2">{t.reason}</th>
                <th className="p-2" />
              </tr>
            </thead>
            <tbody>
              {retries.map((r) => (
                <tr key={r.call_id} className="border-b last:border-0">
                  <td className="p-2 font-mono text-xs">{r.call_id.slice(0, 8)}…</td>
                  <td className="p-2">
                    <Badge variant={r.status === "succeeded" ? "default" : r.status === "abandoned" ? "destructive" : "secondary"}>
                      {r.status === "succeeded" ? t.succeeded : r.status === "abandoned" ? t.abandoned : t.pending}
                    </Badge>
                  </td>
                  <td className="p-2">{r.attempts}/{r.max_attempts}</td>
                  <td className="p-2 text-xs text-muted-foreground">
                    {r.status === "pending" && r.next_attempt_at ? new Date(r.next_attempt_at).toLocaleString(fr ? "fr-CA" : "en-CA") : "—"}
                  </td>
                  <td className="p-2 text-xs text-muted-foreground max-w-[280px] truncate" title={r.last_error ?? ""}>
                    {r.last_reason ?? "—"}{r.last_status ? ` (${r.last_status})` : ""}
                  </td>
                  <td className="p-2 text-right">
                    {r.status !== "succeeded" && (
                      <Button variant="ghost" size="sm" onClick={async () => {
                        try {
                          await call({ action: "cdr-retry-reset", call_id: r.call_id });
                          toast.success(t.reset);
                          await load();
                        } catch (e: any) { toast.error(e?.message ?? "Error"); }
                      }}>
                        <RotateCcw className="w-4 h-4" />
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
              {!retries.length && (
                <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">{t.none}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function MappingRow({
  profile, t, call, onSaved,
}: {
  profile: ProfileRow;
  t: Record<string, any>;
  call: (b: Record<string, unknown>) => Promise<any>;
  onSaved: () => void | Promise<void>;
}) {
  const [value, setValue] = useState(String(profile.maestro_broker_id ?? ""));
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; label: string } | null>(null);

  const dirty = value.trim() !== String(profile.maestro_broker_id ?? "");

  const test = async () => {
    const v = value.trim();
    if (!/^\d+$/.test(v)) { setResult({ ok: false, label: t.numeric }); return; }
    setTesting(true);
    setResult(null);
    try {
      const d = await call({ action: "telecom-map-test", telecom_id: v });
      if (d?.ok) setResult({ ok: true, label: t.testOk(d.sip_username ?? "?") });
      else setResult({ ok: false, label: t.testFail(d?.error ?? `HTTP ${d?.status ?? "?"}`) });
    } catch (e: any) {
      setResult({ ok: false, label: t.testFail(e?.message ?? "error") });
    } finally {
      setTesting(false);
    }
  };

  const save = async () => {
    const v = value.trim();
    if (v && !/^\d+$/.test(v)) { toast.error(t.numeric); return; }
    setSaving(true);
    try {
      await call({ action: "telecom-map-save", profile_id: profile.id, telecom_id: v || null });
      toast.success(t.saved);
      await onSaved();
    } catch (e: any) {
      toast.error(e?.message ?? "Error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <tr className="border-b last:border-0">
      <td className="p-2">
        <div className="font-medium">{profile.full_name ?? "—"}</div>
        <div className="text-xs text-muted-foreground">{profile.email ?? ""}</div>
      </td>
      <td className="p-2 text-sm">{profile.extension ?? "—"}</td>
      <td className="p-2">
        <Input
          className="w-28 font-mono"
          inputMode="numeric"
          placeholder="67"
          value={value}
          onChange={(e) => { setValue(e.target.value.replace(/\D/g, "")); setResult(null); }}
        />
      </td>
      <td className="p-2">
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={() => void test()} disabled={testing || !value.trim()}>
            {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : t.test}
          </Button>
          <Button size="sm" onClick={() => void save()} disabled={saving || !dirty}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : t.save}
          </Button>
          {result && (
            <span className={`text-xs flex items-center gap-1 ${result.ok ? "text-emerald-600" : "text-destructive"}`}>
              {result.ok ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
              {result.label}
            </span>
          )}
        </div>
      </td>
    </tr>
  );
}
