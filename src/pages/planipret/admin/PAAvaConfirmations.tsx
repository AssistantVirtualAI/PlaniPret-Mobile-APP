// Écran admin : ce qu'AVA a proposé, ce que le courtier a confirmé, et ce que
// le serveur a réellement exécuté. Aucune action n'est déclenchée d'ici : c'est
// une feuille de lecture et d'audit.
import { useCallback, useEffect, useMemo, useState } from "react";
import { ClipboardList, Loader2, Lock, RefreshCw, Search } from "lucide-react";
import { PAPage, PAPageHeader } from "@/components/planipret/admin/PAPageShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useMplanipretLang } from "@/hooks/useMplanipretLang";

type Row = {
  id: string; user_id: string | null; broker_id: string | null; call_id: string | null;
  session_id: string | null; action: string; surface: string | null; destination: string | null;
  provider: string | null; decision: string | null; status: string | null; error_code: string | null;
  idempotency_key: string | null; proposed_at: string | null; decided_at: string | null;
  executed_at: string | null; created_at: string;
};

const PENDING = new Set(["pending", "proposed", "awaiting_confirmation", "awaiting"]);

const ACTION_LABEL_FR: Record<string, string> = {
  send_sms: "Texto", sms: "Texto", send_email: "Courriel", email: "Courriel",
  create_task: "Tâche", update_task: "Tâche", task: "Tâche",
  save_call: "Sauvegarde Maestro", maestro_save: "Sauvegarde Maestro",
  call_consent: "Sauvegarde Maestro", add_note: "Note Maestro", place_call: "Appel",
};

const tone = (r: Row): "default" | "secondary" | "destructive" | "outline" => {
  const s = (r.status ?? "").toLowerCase();
  if (s === "executed" || s === "sent" || s === "done" || s === "success") return "default";
  if (s === "failed" || s === "error" || r.decision === "cancel" || r.decision === "decline") return "destructive";
  if (PENDING.has(s) || !r.decision) return "outline";
  return "secondary";
};

const dt = (v?: string | null) =>
  v ? new Date(v).toLocaleString("fr-CA", { timeZone: "America/Toronto", dateStyle: "short", timeStyle: "short" }) : "—";

export default function PAAvaConfirmations() {
  const { lang } = useMplanipretLang();
  const isFr = lang !== "en";
  const L = (fr: string, en: string) => (isFr ? fr : en);

  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [actionFilter, setActionFilter] = useState("all");
  const [brokerFilter, setBrokerFilter] = useState("all");
  const [monthFilter, setMonthFilter] = useState("all");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { if (!cancelled) setAllowed(false); return; }
      const { data: isAdmin } = await supabase.rpc("is_planipret_admin", { _user_id: user.id });
      if (!cancelled) setAllowed(isAdmin === true);
    })();
    return () => { cancelled = true; };
  }, []);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    const { data, error: err } = await supabase
      .from("planipret_ava_action_confirmations")
      .select("id,user_id,broker_id,call_id,session_id,action,surface,destination,provider,decision,status,error_code,idempotency_key,proposed_at,decided_at,executed_at,created_at")
      .order("created_at", { ascending: false })
      .limit(500);
    if (err) { setError(err.message); setLoading(false); return; }
    const list = (data ?? []) as Row[];
    setRows(list);
    const ids = Array.from(new Set(list.map((r) => r.user_id).filter(Boolean) as string[]));
    if (ids.length) {
      const { data: profs } = await supabase
        .from("planipret_profiles").select("user_id, full_name, email").in("user_id", ids);
      const map: Record<string, string> = {};
      for (const p of (profs ?? []) as any[]) map[String(p.user_id)] = p.full_name || p.email || String(p.user_id).slice(0, 8);
      setNames(map);
    }
    setLoading(false);
  }, []);

  useEffect(() => { if (allowed) void load(); }, [allowed, load]);

  useEffect(() => {
    if (!allowed) return;
    const ch = supabase
      .channel("pp-ava-confirmations")
      .on("postgres_changes", { event: "*", schema: "public", table: "planipret_ava_action_confirmations" }, () => void load())
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [allowed, load]);

  const brokerOf = (r: Row) => (r.user_id ? names[r.user_id] : null) ?? r.broker_id ?? "—";
  const actionLabel = (a: string) => (isFr ? ACTION_LABEL_FR[a] ?? a : a);

  const actions = useMemo(
    () => Array.from(new Set(rows.map((r) => r.action))).sort(),
    [rows],
  );

  const monthOf = (r: Row) => String(r.proposed_at ?? r.created_at ?? "").slice(0, 7);

  const brokers = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of rows) {
      const id = r.user_id ?? r.broker_id;
      if (id) map.set(id, (r.user_id ? names[r.user_id] : null) ?? r.broker_id ?? id.slice(0, 8));
    }
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, names]);

  const months = useMemo(
    () => Array.from(new Set(rows.map(monthOf).filter(Boolean))).sort().reverse(),
    [rows],
  );

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (actionFilter !== "all" && r.action !== actionFilter) return false;
      if (brokerFilter !== "all" && (r.user_id ?? r.broker_id) !== brokerFilter) return false;
      if (monthFilter !== "all" && monthOf(r) !== monthFilter) return false;
      if (!needle) return true;
      return [brokerOf(r), r.call_id, r.action, r.destination, r.idempotency_key, r.status]
        .some((v) => String(v ?? "").toLowerCase().includes(needle));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, q, actionFilter, brokerFilter, monthFilter, names]);

  // Nombre d'appels (call_id distincts) par statut, sur la sélection courante.
  const statusCounts = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const r of filtered) {
      const s = (r.status ?? (r.decision ? r.decision : "pending")).toLowerCase();
      if (!map.has(s)) map.set(s, new Set());
      map.get(s)!.add(r.call_id ?? r.session_id ?? r.id);
    }
    return Array.from(map.entries())
      .map(([status, set]) => ({ status, calls: set.size }))
      .sort((a, b) => b.calls - a.calls);
  }, [filtered]);

  const pending = useMemo(
    () => filtered.filter((r) => !r.executed_at && (PENDING.has((r.status ?? "").toLowerCase()) || !r.decision)),
    [filtered],
  );

  if (allowed === null) return <PAPage><div className="py-16 text-center text-sm text-muted-foreground">…</div></PAPage>;
  if (!allowed) {
    return (
      <PAPage>
        <div className="py-20 flex flex-col items-center gap-3 text-center">
          <Lock className="w-8 h-8 text-muted-foreground" />
          <h1 className="text-lg font-semibold">{L("Page restreinte", "Restricted page")}</h1>
        </div>
      </PAPage>
    );
  }

  return (
    <PAPage>
      <PAPageHeader
        icon={<ClipboardList className="w-5 h-5" />}
        title={L("AVA — Actions et confirmations", "AVA — Actions and confirmations")}
        subtitle={L(
          "Textos, tâches et sauvegardes Maestro proposés par AVA : statut, décision du courtier et clé anti-double-envoi.",
          "Texts, tasks and Maestro saves proposed by AVA: status, broker decision and duplicate-protection key.",
        )}
      />

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="relative">
          <Search className="w-4 h-4 absolute left-2.5 top-2.5 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={L("Courtier, appel, destinataire, clé…", "Broker, call, recipient, key…")}
            className="pl-8 w-[300px]"
          />
        </div>
        <Select value={actionFilter} onValueChange={setActionFilter}>
          <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{L("Toutes les actions", "All actions")}</SelectItem>
            {actions.map((a) => <SelectItem key={a} value={a}>{actionLabel(a)}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={brokerFilter} onValueChange={setBrokerFilter}>
          <SelectTrigger className="w-[220px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{L("Tous les courtiers", "All brokers")}</SelectItem>
            {brokers.map(([id, name]) => <SelectItem key={id} value={id}>{name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={monthFilter} onValueChange={setMonthFilter}>
          <SelectTrigger className="w-[170px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{L("Tous les mois", "All months")}</SelectItem>
            {months.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          <span className="ml-2">{L("Actualiser", "Refresh")}</span>
        </Button>
      </div>

      <Card className="mb-4">
        <CardContent className="py-3 flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium mr-1">{L("Appels par statut", "Calls by status")}</span>
          {statusCounts.length === 0 && (
            <span className="text-sm text-muted-foreground">{L("Aucune donnée pour cette sélection.", "No data for this selection.")}</span>
          )}
          {statusCounts.map((s) => (
            <Badge key={s.status} variant="outline">{s.status} · {s.calls}</Badge>
          ))}
        </CardContent>
      </Card>

      {error && <Card className="mb-4 border-destructive/40"><CardContent className="py-3 text-sm text-destructive">{error}</CardContent></Card>}

      <Card className="mb-6">
        <CardContent className="p-0">
          <div className="px-4 py-3 border-b flex items-center justify-between">
            <div className="text-sm font-medium">{L("En attente de confirmation", "Awaiting confirmation")}</div>
            <Badge variant="outline">{pending.length}</Badge>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left">
                <tr>
                  {[L("Courtier", "Broker"), L("Action", "Action"), L("Destinataire", "Recipient"),
                    L("Appel", "Call"), L("Proposée", "Proposed"), L("Statut", "Status"), "idempotency_key",
                  ].map((h) => <th key={h} className="px-3 py-2 font-medium whitespace-nowrap">{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {pending.map((r) => (
                  <tr key={r.id} className="border-t">
                    <td className="px-3 py-2 whitespace-nowrap">{brokerOf(r)}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{actionLabel(r.action)}</td>
                    <td className="px-3 py-2">{r.destination ?? "—"}</td>
                    <td className="px-3 py-2 font-mono text-xs">{r.call_id ?? r.session_id ?? "—"}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{dt(r.proposed_at ?? r.created_at)}</td>
                    <td className="px-3 py-2"><Badge variant={tone(r)}>{r.status ?? L("en attente", "pending")}</Badge></td>
                    <td className="px-3 py-2 font-mono text-xs break-all max-w-[260px]">{r.idempotency_key ?? "—"}</td>
                  </tr>
                ))}
                {!pending.length && (
                  <tr><td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">
                    {L("Aucune action en attente.", "No pending action.")}
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <div className="px-4 py-3 border-b flex items-center justify-between">
            <div className="text-sm font-medium">{L("Feuille d'audit complète", "Full audit sheet")}</div>
            <Badge variant="outline">{filtered.length}</Badge>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left">
                <tr>
                  {[L("Courtier", "Broker"), "call_id", L("Action", "Action"), L("Surface", "Surface"),
                    L("Destination", "Destination"), L("Proposée", "Proposed"), L("Décision", "Decision"),
                    L("Confirmée", "Confirmed"), L("Exécutée", "Executed"), L("Statut", "Status"),
                    L("Erreur", "Error"), "idempotency_key",
                  ].map((h) => <th key={h} className="px-3 py-2 font-medium whitespace-nowrap">{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.id} className="border-t">
                    <td className="px-3 py-2 whitespace-nowrap">{brokerOf(r)}</td>
                    <td className="px-3 py-2 font-mono text-xs">{r.call_id ?? r.session_id ?? "—"}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{actionLabel(r.action)}</td>
                    <td className="px-3 py-2">{r.surface ?? "—"}</td>
                    <td className="px-3 py-2">{r.destination ?? "—"}{r.provider ? ` · ${r.provider}` : ""}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{dt(r.proposed_at ?? r.created_at)}</td>
                    <td className="px-3 py-2">{r.decision ?? "—"}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{dt(r.decided_at)}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{dt(r.executed_at)}</td>
                    <td className="px-3 py-2"><Badge variant={tone(r)}>{r.status ?? "—"}</Badge></td>
                    <td className="px-3 py-2 text-destructive text-xs">{r.error_code ?? ""}</td>
                    <td className="px-3 py-2 font-mono text-xs break-all max-w-[240px]">{r.idempotency_key ?? "—"}</td>
                  </tr>
                ))}
                {!filtered.length && !loading && (
                  <tr><td colSpan={12} className="px-3 py-8 text-center text-muted-foreground">
                    {L("Aucune confirmation enregistrée.", "No confirmation recorded.")}
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </PAPage>
  );
}
