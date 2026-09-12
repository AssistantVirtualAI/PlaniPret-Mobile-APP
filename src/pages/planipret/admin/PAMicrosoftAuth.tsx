import { PAPageHeader } from "@/components/planipret/admin/PAPageShell";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { RefreshCw, AlertTriangle, CheckCircle2, PauseCircle } from "lucide-react";
import { useMplanipretLang } from "@/hooks/useMplanipretLang";

type Attempt = {
  id: string;
  profile_id: string | null;
  email: string | null;
  attempt_type: string;
  status: string;
  error_code: string | null;
  error_message: string | null;
  source: string | null;
  paused: boolean;
  created_at: string;
};

type PausedProfile = {
  id: string;
  full_name: string | null;
  ms365_email: string | null;
  ms365_auth_paused_at: string | null;
  ms365_auth_error: string | null;
};

const DICT = {
  fr: {
    title: "Connexions Microsoft",
    subtitle: "Tentatives de renouvellement et de connexion Microsoft 365, par courtier",
    refresh: "Rafraîchir",
    search: "Rechercher un courtier ou un courriel",
    paused: "Comptes en pause (aucune demande envoyée)",
    none: "Aucune tentative enregistrée pour le moment.",
    noPaused: "Aucun compte en pause.",
    date: "Date",
    broker: "Courtier",
    type: "Type",
    status: "Statut",
    detail: "Détail",
    total: "Tentatives (30 jours)",
    failures: "Échecs",
    successes: "Réussites",
    typeRefresh: "Renouvellement",
    typeInteractive: "Connexion manuelle",
    stSuccess: "Réussite",
    stFailed: "Échec",
    stFailedPermanent: "Échec — mis en pause",
    stSkipped: "Ignorée (en pause)",
    error: "Impossible de charger les tentatives.",
    retry: "Réessayer",
  },
  en: {
    title: "Microsoft sign-ins",
    subtitle: "Microsoft 365 renewal and sign-in attempts, per broker",
    refresh: "Refresh",
    search: "Search a broker or email",
    paused: "Paused accounts (no prompt sent)",
    none: "No attempt recorded yet.",
    noPaused: "No paused account.",
    date: "Date",
    broker: "Broker",
    type: "Type",
    status: "Status",
    detail: "Detail",
    total: "Attempts (30 days)",
    failures: "Failures",
    successes: "Successes",
    typeRefresh: "Renewal",
    typeInteractive: "Manual sign-in",
    stSuccess: "Success",
    stFailed: "Failed",
    stFailedPermanent: "Failed — paused",
    stSkipped: "Skipped (paused)",
    error: "Could not load the attempts.",
    retry: "Retry",
  },
};

export default function PAMicrosoftAuth() {
  const { lang } = useMplanipretLang();
  const t = DICT[(lang as "fr" | "en") ?? "fr"] ?? DICT.fr;

  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [pausedList, setPausedList] = useState<PausedProfile[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const since = new Date(Date.now() - 30 * 864e5).toISOString();
      const [a, p] = await Promise.all([
        supabase
          .from("planipret_ms_auth_attempts")
          .select("*")
          .gte("created_at", since)
          .order("created_at", { ascending: false })
          .limit(500),
        supabase
          .from("planipret_profiles")
          .select("id, full_name, ms365_email, ms365_auth_paused_at, ms365_auth_error")
          .not("ms365_auth_paused_at", "is", null)
          .order("ms365_auth_paused_at", { ascending: false })
          .limit(200),
      ]);
      if (a.error) throw a.error;
      if (p.error) throw p.error;
      const rows = (a.data ?? []) as Attempt[];
      setAttempts(rows);
      setPausedList((p.data ?? []) as PausedProfile[]);

      const ids = Array.from(new Set(rows.map((r) => r.profile_id).filter(Boolean))) as string[];
      if (ids.length) {
        const { data: profs } = await supabase
          .from("planipret_profiles")
          .select("id, full_name, ms365_email")
          .in("id", ids);
        const map: Record<string, string> = {};
        (profs ?? []).forEach((pr: any) => {
          map[pr.id] = pr.full_name || pr.ms365_email || pr.id;
        });
        setNames(map);
      }
    } catch (e: any) {
      setErr(e?.message ?? t.error);
    } finally {
      setLoading(false);
    }
  }, [t.error]);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return attempts;
    return attempts.filter((r) => {
      const name = (r.profile_id ? names[r.profile_id] : "") ?? "";
      return `${name} ${r.email ?? ""} ${r.error_message ?? ""}`.toLowerCase().includes(s);
    });
  }, [attempts, names, q]);

  const stats = useMemo(() => {
    const failures = attempts.filter((r) => r.status.startsWith("failed")).length;
    const successes = attempts.filter((r) => r.status === "success").length;
    return { total: attempts.length, failures, successes };
  }, [attempts]);

  const statusLabel = (s: string) =>
    s === "success" ? t.stSuccess
      : s === "failed_permanent" ? t.stFailedPermanent
      : s === "skipped_paused" ? t.stSkipped
      : t.stFailed;

  const statusVariant = (s: string): "default" | "secondary" | "destructive" | "outline" =>
    s === "success" ? "default" : s === "skipped_paused" ? "secondary" : "destructive";

  const fmt = (iso: string) =>
    new Date(iso).toLocaleString(lang === "en" ? "en-CA" : "fr-CA", { dateStyle: "short", timeStyle: "short" });

  return (
    <div className="pa-page">
      <PAPageHeader
        icon={<CheckCircle2 className="h-[18px] w-[18px]" />}
        title={t.title}
        subtitle={t.subtitle}
        actions={
          <Button variant="outline" onClick={load} disabled={loading}>
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            {t.refresh}
          </Button>
        }
      />

      {err && (
        <Card className="border-destructive/50">
          <CardContent className="flex items-center justify-between gap-3 p-4">
            <span className="text-sm text-destructive">{err}</span>
            <Button size="sm" variant="outline" onClick={load}>{t.retry}</Button>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">{t.total}</CardTitle></CardHeader>
          <CardContent className="text-2xl font-semibold">{stats.total}</CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">{t.successes}</CardTitle></CardHeader>
          <CardContent className="flex items-center gap-2 text-2xl font-semibold"><CheckCircle2 className="h-5 w-5 text-emerald-500" />{stats.successes}</CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">{t.failures}</CardTitle></CardHeader>
          <CardContent className="flex items-center gap-2 text-2xl font-semibold"><AlertTriangle className="h-5 w-5 text-amber-500" />{stats.failures}</CardContent></Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base"><PauseCircle className="h-4 w-4" />{t.paused}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {pausedList.length === 0 && <p className="text-sm text-muted-foreground">{t.noPaused}</p>}
          {pausedList.map((p) => (
            <div key={p.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3 text-sm">
              <div>
                <div className="font-medium">{p.full_name || p.ms365_email || p.id}</div>
                <div className="text-xs text-muted-foreground">{p.ms365_email}</div>
              </div>
              <div className="text-right">
                <div className="text-xs text-muted-foreground">{p.ms365_auth_paused_at ? fmt(p.ms365_auth_paused_at) : ""}</div>
                <div className="max-w-[380px] truncate text-xs text-destructive">{p.ms365_auth_error}</div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="gap-3">
          <CardTitle className="text-base">{t.title}</CardTitle>
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t.search} className="max-w-sm" />
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {filtered.length === 0 ? (
            <p className="py-6 text-sm text-muted-foreground">{t.none}</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                  <th className="py-2 pr-4">{t.date}</th>
                  <th className="py-2 pr-4">{t.broker}</th>
                  <th className="py-2 pr-4">{t.type}</th>
                  <th className="py-2 pr-4">{t.status}</th>
                  <th className="py-2">{t.detail}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.id} className="border-b last:border-0">
                    <td className="whitespace-nowrap py-2 pr-4">{fmt(r.created_at)}</td>
                    <td className="py-2 pr-4">{(r.profile_id ? names[r.profile_id] : null) || r.email || "—"}</td>
                    <td className="py-2 pr-4">{r.attempt_type === "interactive" ? t.typeInteractive : t.typeRefresh}</td>
                    <td className="py-2 pr-4"><Badge variant={statusVariant(r.status)}>{statusLabel(r.status)}</Badge></td>
                    <td className="max-w-[420px] truncate py-2 text-xs text-muted-foreground">{r.error_message || r.error_code || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
