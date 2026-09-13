import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PAPage, PAPageHeader } from "@/components/planipret/admin/PAPageShell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Copy, Loader2, RefreshCw, RotateCw, Search, Wifi } from "lucide-react";
import { toast } from "sonner";
import { useMplanipretLang } from "@/hooks/useMplanipretLang";

const L = (lang: string, fr: string, en: string) => (lang === "en" ? en : fr);

type Device = {
  aor: string | null;
  transport: string | null;
  state: string;
  registered: boolean;
  expires_at: string | null;
  registered_at: string | null;
  contact: string | null;
  user_agent: string | null;
  server: string | null;
};
type ErrLog = { path: string; status: number | null; error: string | null; created_at: string; function_name: string | null };
type Row = {
  user_id: string;
  name: string;
  email: string | null;
  extension: string;
  ns_status: number;
  devices: Device[];
  registered_count: number;
  last_registered_at: string | null;
  dids: { phone_number_e164: string | null }[];
  errors: ErrLog[];
};

const fmt = (v: string | null) => {
  if (!v) return "—";
  const d = new Date(v.includes("T") ? v : v.replace(" ", "T") + "Z");
  return Number.isNaN(d.getTime()) ? v : d.toLocaleString();
};

export default function PASipMonitor() {
  const { lang } = useMplanipretLang();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [domain, setDomain] = useState<string>("");

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.functions.invoke("pp-admin-sip-ops", { body: { action: "status", limit: 60 } });
    setLoading(false);
    if (error) { toast.error(error.message); return; }
    const res = data as { extensions?: Row[]; error?: string; domain?: string };
    if (res?.error) { toast.error(res.error); return; }
    setRows(res?.extensions ?? []);
    setDomain(res?.domain ?? "");
  }, []);

  const buildRoute = useCallback((r: Row) => {
    const dids = r.dids.map((d) => d.phone_number_e164).filter(Boolean);
    const lines: string[] = [];
    lines.push(`Courtier: ${r.name}${r.email ? ` <${r.email}>` : ""}`);
    lines.push(`Domaine SIP: ${domain || "—"}`);
    lines.push(`Poste (AOR de base): ${r.extension}@${domain || "—"}`);
    lines.push(`Numéros (DID): ${dids.length ? dids.join(", ") : "—"}`);
    lines.push("");
    lines.push("Route entrante:");
    lines.push(`  ${dids.length ? dids.join(" / ") : "DID"} → domaine ${domain || "—"} → utilisateur ${r.extension} → règles de sonnerie → appareils inscrits`);
    lines.push("");
    lines.push("Route sortante:");
    lines.push(`  appareil (${r.devices.map((d) => d.transport ?? "?").join("/") || "—"}) → ${r.extension}@${domain || "—"} → coeur NetSapiens → passerelle → RTC`);
    lines.push("");
    lines.push(`Appareils (${r.devices.length}):`);
    if (!r.devices.length) lines.push("  aucun appareil");
    for (const d of r.devices) {
      lines.push(
        `  ${d.registered ? "[INSCRIT]" : "[HORS LIGNE]"} ${d.aor ?? "—"} · ${d.transport ?? "—"} · serveur ${d.server ?? "—"}`,
      );
      lines.push(`      contact: ${d.contact ?? "—"}`);
      lines.push(`      inscrit: ${fmt(d.registered_at)} · expire: ${fmt(d.expires_at)} · UA: ${d.user_agent ?? "—"}`);
    }
    if (r.errors.length) {
      lines.push("");
      lines.push("Dernières erreurs:");
      for (const e of r.errors.slice(0, 5)) lines.push(`  ${fmt(e.created_at)} · ${e.status ?? "—"} · ${e.path}${e.error ? ` · ${e.error}` : ""}`);
    }
    return lines.join("\n");
  }, [domain]);

  const copyRoute = async (r: Row) => {
    try {
      await navigator.clipboard.writeText(buildRoute(r));
      toast.success(L(lang, "Route SIP copiée.", "SIP route copied."));
    } catch {
      toast.error(L(lang, "Copie impossible.", "Copy failed."));
    }
  };

  const marc = useMemo(() => rows.find((r) => String(r.name ?? "").toLowerCase().includes("marc")) ?? null, [rows]);

  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => {
    const n = q.trim().toLowerCase();
    if (!n) return rows;
    return rows.filter((r) => [r.name, r.email, r.extension].some((v) => String(v ?? "").toLowerCase().includes(n)));
  }, [rows, q]);

  const stats = useMemo(() => ({
    total: rows.length,
    up: rows.filter((r) => r.registered_count > 0).length,
    down: rows.filter((r) => r.registered_count === 0).length,
  }), [rows]);

  const relaunch = async (r: Row) => {
    setBusy(r.user_id);
    const { data, error } = await supabase.functions.invoke("pp-admin-sip-ops", {
      body: { action: "reprovision", broker_id: r.user_id },
    });
    setBusy(null);
    if (error) { toast.error(error.message); return; }
    const res = data as { ok?: boolean; result?: unknown };
    if (res?.ok) toast.success(L(lang, `Relance envoyée pour le poste ${r.extension}`, `Re-registration pushed for ext ${r.extension}`));
    else toast.error(L(lang, "Relance échouée", "Relaunch failed"), { description: JSON.stringify(res?.result ?? {}).slice(0, 160) });
    await load();
  };

  return (
    <PAPage>
      <PAPageHeader
        accent="#06B6D4"
        icon={<Wifi className="w-5 h-5" />}
        title={L(lang, "Suivi SIP par poste", "SIP monitoring by extension")}
        subtitle={L(lang, "Statut inscrit, date d'inscription, dernières erreurs et relance.", "Registration status, registration date, last errors and relaunch.")}
        actions={
          <Button variant="outline" onClick={() => void load()} disabled={loading} className="gap-2">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            {L(lang, "Actualiser", "Refresh")}
          </Button>
        }
      />

      <div className="pa-stats">
        <div className="pa-stat">
          <div className="pa-stat-label">{L(lang, "Postes suivis", "Extensions tracked")}</div>
          <div className="pa-stat-value">{stats.total}</div>
        </div>
        <div className="pa-stat">
          <div className="pa-stat-label">{L(lang, "Inscrits", "Registered")}</div>
          <div className="pa-stat-value text-emerald-400">{stats.up}</div>
        </div>
        <div className="pa-stat">
          <div className="pa-stat-label">{L(lang, "Non inscrits", "Not registered")}</div>
          <div className="pa-stat-value text-amber-400">{stats.down}</div>
        </div>
      </div>

      {marc && (
        <Card className="pa-card">
          <CardHeader className="pa-card-head">
            <CardTitle className="pa-card-title">{L(lang, `Route SIP actuelle — ${marc.name}`, `Current SIP route — ${marc.name}`)}</CardTitle>
            <CardDescription className="pa-card-sub">
              {L(lang, "Route entrante, sortante et appareils inscrits.", "Inbound route, outbound route and registered devices.")}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <Button size="sm" variant="outline" className="gap-1" onClick={() => void copyRoute(marc)}>
              <Copy className="w-3 h-3" />{L(lang, "Copier la route", "Copy route")}
            </Button>
            <pre className="text-[11px] whitespace-pre-wrap font-mono bg-background/60 rounded p-2 border">{buildRoute(marc)}</pre>
          </CardContent>
        </Card>
      )}

      <Card className="pa-card">
        <CardHeader className="pa-card-head">
          <CardTitle className="pa-card-title">{L(lang, "Postes", "Extensions")}</CardTitle>
          <CardDescription className="pa-card-sub">
            {L(lang, "Cliquez une ligne pour voir les appareils et les erreurs.", "Click a row to see devices and errors.")}
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
                  <th>{L(lang, "Poste", "Ext.")}</th>
                  <th>{L(lang, "Courtier", "Broker")}</th>
                  <th>{L(lang, "Statut", "Status")}</th>
                  <th>{L(lang, "Dernière inscription", "Last registration")}</th>
                  <th>{L(lang, "Expire", "Expires")}</th>
                  <th>{L(lang, "Erreurs", "Errors")}</th>
                  <th className="text-right">{L(lang, "Actions", "Actions")}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => {
                  const expires = r.devices.map((d) => d.expires_at).filter(Boolean).sort().pop() ?? null;
                  const isOpen = open === r.user_id;
                  return (
                    <Fragment key={r.user_id}>
                      <tr className="cursor-pointer" onClick={() => setOpen(isOpen ? null : r.user_id)}>
                        <td className="font-mono">{r.extension}</td>
                        <td>{r.name}</td>
                        <td>
                          <Badge variant={r.registered_count > 0 ? "default" : "destructive"}>
                            {r.registered_count > 0
                              ? L(lang, `Inscrit (${r.registered_count})`, `Registered (${r.registered_count})`)
                              : L(lang, "Aucun appareil inscrit", "No registered device")}
                          </Badge>
                        </td>
                        <td className="text-xs">{fmt(r.last_registered_at)}</td>
                        <td className="text-xs">{fmt(expires)}</td>
                        <td>{r.errors.length ? <Badge variant="outline">{r.errors.length}</Badge> : "—"}</td>
                        <td className="text-right">
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-1"
                            disabled={busy === r.user_id}
                            onClick={(e) => { e.stopPropagation(); void relaunch(r); }}
                          >
                            {busy === r.user_id ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCw className="w-3 h-3" />}
                            {L(lang, "Relancer", "Relaunch")}
                          </Button>
                        </td>
                      </tr>
                      {isOpen && (
                        <tr>
                          <td colSpan={7} className="bg-muted/30">
                            <div className="grid md:grid-cols-2 gap-4 p-3">
                              <div>
                                <div className="text-xs font-semibold mb-1">{L(lang, "Appareils", "Devices")}</div>
                                {r.devices.length === 0 && <div className="text-xs text-muted-foreground">{L(lang, "Aucun appareil.", "No device.")}</div>}
                                {r.devices.map((d, i) => (
                                  <div key={i} className="text-xs font-mono mb-1">
                                    <span className={d.registered ? "text-emerald-400" : "text-amber-400"}>●</span>{" "}
                                    {d.aor ?? "—"} · {d.transport ?? "—"} · {d.state}
                                    <div className="text-muted-foreground">
                                      {L(lang, "inscrit", "registered")}: {fmt(d.registered_at)} · {L(lang, "expire", "expires")}: {fmt(d.expires_at)}
                                    </div>
                                    {d.contact && <div className="text-muted-foreground break-all">{d.contact}</div>}
                                  </div>
                                ))}
                              </div>
                              <div>
                                <div className="text-xs font-semibold mb-1">{L(lang, "Dernières erreurs", "Last errors")}</div>
                                {r.errors.length === 0 && <div className="text-xs text-muted-foreground">{L(lang, "Aucune erreur récente.", "No recent error.")}</div>}
                                {r.errors.map((e, i) => (
                                  <div key={i} className="text-xs mb-1">
                                    <span className="text-muted-foreground">{fmt(e.created_at)}</span>{" "}
                                    <Badge variant="outline">{e.status ?? "—"}</Badge>{" "}
                                    <span className="font-mono break-all">{e.path}</span>
                                    {e.error && <div className="text-destructive break-all">{e.error}</div>}
                                  </div>
                                ))}
                              </div>
                            </div>
                            <div className="px-3 pb-3">
                              <div className="flex items-center justify-between mb-1">
                                <div className="text-xs font-semibold">{L(lang, "Route SIP complète", "Full SIP route")}</div>
                                <Button size="sm" variant="outline" className="gap-1" onClick={() => void copyRoute(r)}>
                                  <Copy className="w-3 h-3" />{L(lang, "Copier", "Copy")}
                                </Button>
                              </div>
                              <pre className="text-[11px] whitespace-pre-wrap font-mono bg-background/60 rounded p-2 border">{buildRoute(r)}</pre>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
                {!loading && filtered.length === 0 && (
                  <tr><td colSpan={7} className="pa-empty">{L(lang, "Aucun poste.", "No extension.")}</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </PAPage>
  );
}
