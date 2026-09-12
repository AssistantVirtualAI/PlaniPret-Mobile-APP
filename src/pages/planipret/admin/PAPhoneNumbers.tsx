import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, RefreshCw, PhoneOff, PhoneForwarded, RotateCw, CheckCircle2, AlertTriangle, Phone } from "lucide-react";
import { PAPageHeader } from "@/components/planipret/admin/PAPageShell";
import { toast } from "sonner";
import DidReclaimPanel from "@/components/planipret/admin/DidReclaimPanel";
import DidDuplicateAlert from "@/components/planipret/admin/DidDuplicateAlert";


type Did = {
  e164: string;
  pretty: string;
  extension: string | null;
  status: "assigned" | "available" | "reserved";
  display_name: string | null;
};
type Broker = { extension: string; full_name: string | null; email: string | null };

export default function PAPhoneNumbers() {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [tab, setTab] = useState<"all" | "available" | "assigned">("available");
  const [pick, setPick] = useState<Record<string, string>>({});
  const [routing, setRouting] = useState<Record<string, { ok: boolean; diagnostic: string }>>({});
  const [busy, setBusy] = useState<string | null>(null);

  /**
   * Re-synchronise le routage d'UN numéro : recharge la config depuis le PBX
   * après réassignation dans NetSapiens et vérifie que la destination pointe
   * bien vers le bon `user_XXXX`.
   */
  const resync = async (e164: string, extension: string | null) => {
    setBusy(e164);
    try {
      const { data, error } = await supabase.functions.invoke("pp-did-assign", {
        body: { action: "verify", e164, extension, domain: "planipret.ca" },
      });
      if (error) throw error;
      const r = data?.results?.[0];
      const ok = !!r?.matches;
      const diagnostic = r?.diagnostic || data?.summary || "Réponse inattendue du PBX.";
      setRouting((p) => ({ ...p, [e164]: { ok, diagnostic } }));
      ok ? toast.success(diagnostic) : toast.error(diagnostic);
      qc.invalidateQueries({ queryKey: ["pa-phone-numbers"] });
    } catch (e: any) {
      const diagnostic = e?.message || "Échec de la re-synchronisation.";
      setRouting((p) => ({ ...p, [e164]: { ok: false, diagnostic } }));
      toast.error(diagnostic);
    } finally {
      setBusy(null);
    }
  };

  const { data, isFetching, refetch } = useQuery({
    queryKey: ["pa-phone-numbers"],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("pp-admin-did-assignments", {
        body: { action: "list_with_brokers", domain: "planipret.ca" },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || "Erreur");
      return data as { numbers: Did[]; brokers: Broker[] };
    },
  });

  const numbers = data?.numbers ?? [];
  const brokers = data?.brokers ?? [];

  const mutate = useMutation({
    mutationFn: async (payload: { action: "assign" | "release"; e164: string; extension?: string }) => {
      // L'assignation écrit réellement le routage dans le PBX (destination
      // user_XXXX) puis relit la config; la libération reste côté portail.
      const fn = payload.action === "assign" ? "pp-did-assign" : "pp-admin-did-assignments";
      const { data, error } = await supabase.functions.invoke(fn, {
        body: { ...payload, domain: "planipret.ca" },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.diagnostic || data?.error || "Erreur");
      return data;
    },
    onSuccess: (d: any, v) => {
      if (v.action === "assign" && d?.diagnostic) {
        setRouting((p) => ({ ...p, [v.e164]: { ok: true, diagnostic: d.diagnostic } }));
      }
      toast.success(v.action === "assign" ? (d?.diagnostic || "Numéro assigné") : "Numéro libéré");
      qc.invalidateQueries({ queryKey: ["pa-phone-numbers"] });
    },
    onError: (e: any) => toast.error(e.message || "Erreur"),
  });

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return numbers.filter((n) => {
      if (tab !== "all" && n.status !== tab) return false;
      if (!term) return true;
      return [n.pretty, n.e164, n.extension, n.display_name]
        .some((v) => (v || "").toLowerCase().includes(term));
    });
  }, [numbers, q, tab]);

  const counts = useMemo(() => ({
    total: numbers.length,
    available: numbers.filter((n) => n.status === "available").length,
    assigned: numbers.filter((n) => n.status === "assigned").length,
  }), [numbers]);

  return (
    <div className="pa-page">
      <PAPageHeader
        icon={<Phone className="h-[18px] w-[18px]" />}
        title="Numéros de téléphone"
        subtitle="Inventaire des DID Planiprêt. Les numéros sans courtier réel sont marqués disponibles et peuvent être assignés ici."
        actions={
          <Button variant="outline" className="gap-2" onClick={() => refetch()} disabled={isFetching}>
            {isFetching ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            Rafraîchir
          </Button>
        }
      />

      <DidDuplicateAlert numbers={numbers} />

      <DidReclaimPanel />

      <div className="flex flex-wrap gap-2">

        {(["available", "assigned", "all"] as const).map((k) => (
          <Button key={k} size="sm" variant={tab === k ? "default" : "outline"} onClick={() => setTab(k)}>
            {k === "available" ? `Disponibles (${counts.available})`
              : k === "assigned" ? `Assignés (${counts.assigned})`
              : `Tous (${counts.total})`}
          </Button>
        ))}
      </div>

      <Input
        placeholder="Rechercher un numéro, un poste ou un courtier…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        className="max-w-md"
      />

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{filtered.length} numéro(s)</CardTitle>
          <CardDescription>
            L'assignation est enregistrée dans le portail. Le routage carrier reste géré dans le portail NetSapiens.
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left border-b">
                <th className="py-2 pr-3">Numéro</th>
                <th className="py-2 pr-3">Poste</th>
                <th className="py-2 pr-3">Courtier</th>
                <th className="py-2 pr-3">Statut</th>
                <th className="py-2 pr-3 w-[320px]">Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((n) => (
                <tr key={n.e164} className="border-b last:border-0">
                  <td className="py-2 pr-3 font-mono">{n.pretty}</td>
                  <td className="py-2 pr-3">{n.extension || "—"}</td>
                  <td className="py-2 pr-3 text-muted-foreground">{n.display_name || "—"}</td>
                  <td className="py-2 pr-3">
                    <Badge variant={n.status === "assigned" ? "default" : "secondary"}>
                      {n.status === "assigned" ? "Assigné" : "Disponible"}
                    </Badge>
                  </td>
                  <td className="py-2 pr-3">
                    {n.status === "assigned" ? (
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2">
                          <Button size="sm" variant="outline" className="gap-2"
                            disabled={busy === n.e164}
                            onClick={() => resync(n.e164, n.extension)}>
                            {busy === n.e164
                              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              : <RotateCw className="w-3.5 h-3.5" />}
                            Re-synchroniser DID
                          </Button>
                          <Button size="sm" variant="outline" className="gap-2"
                            disabled={mutate.isPending}
                            onClick={() => mutate.mutate({ action: "release", e164: n.e164 })}>
                            <PhoneOff className="w-3.5 h-3.5" /> Libérer
                          </Button>
                        </div>
                        {routing[n.e164] && (
                          <p className={`flex items-start gap-1 text-xs ${routing[n.e164].ok ? "text-muted-foreground" : "text-destructive"}`}>
                            {routing[n.e164].ok
                              ? <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                              : <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />}
                            <span>{routing[n.e164].diagnostic}</span>
                          </p>
                        )}
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <Select value={pick[n.e164] ?? ""} onValueChange={(v) => setPick((p) => ({ ...p, [n.e164]: v }))}>
                          <SelectTrigger className="h-8 w-[200px]"><SelectValue placeholder="Choisir un courtier" /></SelectTrigger>
                          <SelectContent className="max-h-72">
                            {brokers.map((b) => (
                              <SelectItem key={b.extension} value={b.extension}>
                                {b.extension} — {b.full_name || b.email || "Sans nom"}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button size="sm" className="gap-2"
                          disabled={!pick[n.e164] || mutate.isPending}
                          onClick={() => mutate.mutate({ action: "assign", e164: n.e164, extension: pick[n.e164] })}>
                          <PhoneForwarded className="w-3.5 h-3.5" /> Assigner
                        </Button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={5} className="py-6 text-center text-muted-foreground">Aucun numéro.</td></tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
