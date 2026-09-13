import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PAPage, PAPageHeader } from "@/components/planipret/admin/PAPageShell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Loader2, PhoneOutgoing, RefreshCw, Save, Search } from "lucide-react";
import { toast } from "sonner";
import { useMplanipretLang } from "@/hooks/useMplanipretLang";

const L = (lang: string, fr: string, en: string) => (lang === "en" ? en : fr);

type Profile = { user_id: string; full_name: string | null; email: string | null; extension: string | null };
type Settings = {
  user_id: string;
  extension: string | null;
  caller_id_number: string | null;
  caller_id_name: string | null;
  client_type: string;
  outbound_enabled: boolean;
};

export default function PAOutboundCalls() {
  const { lang } = useMplanipretLang();
  const [loading, setLoading] = useState(true);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [settings, setSettings] = useState<Record<string, Settings>>({});
  const [dids, setDids] = useState<Record<string, string[]>>({});
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [dest, setDest] = useState("");
  const [calling, setCalling] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: p }, { data: s }, { data: d }] = await Promise.all([
      supabase.from("planipret_profiles").select("user_id, full_name, email, extension").not("extension", "is", null).order("extension"),
      supabase.from("planipret_outbound_settings").select("user_id, extension, caller_id_number, caller_id_name, client_type, outbound_enabled"),
      supabase.from("planipret_did_assignments").select("extension, phone_number_e164"),
    ]);
    setProfiles((p as Profile[]) ?? []);
    const map: Record<string, Settings> = {};
    for (const row of (s as Settings[]) ?? []) map[row.user_id] = row;
    setSettings(map);
    const dmap: Record<string, string[]> = {};
    for (const row of (d as { extension: string | null; phone_number_e164: string | null }[]) ?? []) {
      const ext = String(row.extension ?? "");
      if (!ext || !row.phone_number_e164) continue;
      (dmap[ext] ||= []).push(row.phone_number_e164);
    }
    setDids(dmap);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return profiles;
    return profiles.filter((p) =>
      [p.full_name, p.email, p.extension].some((v) => String(v ?? "").toLowerCase().includes(needle)));
  }, [profiles, q]);

  const get = (p: Profile): Settings =>
    settings[p.user_id] ?? {
      user_id: p.user_id,
      extension: p.extension,
      caller_id_number: dids[String(p.extension)]?.[0] ?? null,
      caller_id_name: p.full_name,
      client_type: "mobile",
      outbound_enabled: true,
    };

  const patch = (p: Profile, next: Partial<Settings>) =>
    setSettings((prev) => ({ ...prev, [p.user_id]: { ...get(p), ...next } }));

  const save = async (p: Profile) => {
    setSavingId(p.user_id);
    const row = get(p);
    const { error } = await supabase.from("planipret_outbound_settings").upsert({
      user_id: p.user_id,
      extension: p.extension,
      caller_id_number: row.caller_id_number,
      caller_id_name: row.caller_id_name,
      client_type: row.client_type === "web" ? "web" : "mobile",
      outbound_enabled: row.outbound_enabled,
    }, { onConflict: "user_id" });
    setSavingId(null);
    if (error) toast.error(error.message);
    else toast.success(L(lang, "Configuration enregistrée", "Settings saved"));
  };

  const call = async (p: Profile) => {
    if (!dest.trim()) { toast.error(L(lang, "Entrez un numéro à appeler", "Enter a number to call")); return; }
    setCalling(true);
    setSelected(p.user_id);
    const { data, error } = await supabase.functions.invoke("pp-admin-sip-ops", {
      body: { action: "call", broker_id: p.user_id, to_number: dest.trim() },
    });
    setCalling(false);
    if (error) { toast.error(error.message); return; }
    const res = data as { success?: boolean; error?: string; device_registered?: boolean };
    if (res?.success) {
      toast.success(
        L(lang, "Appel lancé — le téléphone du courtier sonne", "Call started — the broker's phone is ringing"),
        { description: res.device_registered ? undefined : L(lang, "Aucun appareil inscrit : l'app doit être ouverte", "No registered device: the app must be open") },
      );
    } else {
      toast.error(L(lang, "Appel refusé", "Call refused"), { description: res?.error });
    }
  };

  return (
    <PAPage>
      <PAPageHeader
        accent="#10B981"
        icon={<PhoneOutgoing className="w-5 h-5" />}
        title={L(lang, "Appels sortants par courtier", "Outbound calls by broker")}
        subtitle={L(lang, "Numéro affiché, appareil utilisé et appel direct depuis l'app.", "Caller ID, device used and direct call from the app.")}
        actions={
          <Button variant="outline" onClick={() => void load()} disabled={loading} className="gap-2">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            {L(lang, "Actualiser", "Refresh")}
          </Button>
        }
      />

      <Card className="pa-card">
        <CardHeader className="pa-card-head">
          <CardTitle className="pa-card-title">{L(lang, "Numéro à appeler", "Number to call")}</CardTitle>
          <CardDescription className="pa-card-sub">
            {L(lang, "Le courtier est appelé en premier, puis le client.", "The broker rings first, then the client.")}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2 items-center">
          <Input
            value={dest}
            onChange={(e) => setDest(e.target.value)}
            placeholder="+1 514 555 0199"
            className="max-w-xs font-mono"
          />
          <div className="relative">
            <Search className="w-4 h-4 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={L(lang, "Rechercher un courtier", "Search a broker")} className="pl-8 w-64" />
          </div>
        </CardContent>
      </Card>

      <Card className="pa-card">
        <CardHeader className="pa-card-head">
          <CardTitle className="pa-card-title">{L(lang, "Courtiers", "Brokers")}</CardTitle>
          <CardDescription className="pa-card-sub">{rows.length}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="pa-scroll overflow-x-auto">
            <table className="pa-table w-full text-sm">
              <thead>
                <tr>
                  <th>{L(lang, "Courtier", "Broker")}</th>
                  <th>{L(lang, "Poste", "Ext.")}</th>
                  <th>{L(lang, "Numéro affiché", "Caller ID")}</th>
                  <th>{L(lang, "Appareil", "Device")}</th>
                  <th>{L(lang, "Sortants", "Outbound")}</th>
                  <th className="text-right">{L(lang, "Actions", "Actions")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => {
                  const s = get(p);
                  return (
                    <tr key={p.user_id}>
                      <td>
                        <div className="font-medium">{p.full_name ?? p.email ?? "—"}</div>
                        <div className="text-xs text-muted-foreground">{p.email}</div>
                      </td>
                      <td className="font-mono">{p.extension}</td>
                      <td>
                        <Input
                          value={s.caller_id_number ?? ""}
                          onChange={(e) => patch(p, { caller_id_number: e.target.value })}
                          placeholder={dids[String(p.extension)]?.[0] ?? "+1…"}
                          className="h-8 w-40 font-mono"
                        />
                      </td>
                      <td>
                        <div className="flex gap-1">
                          {(["mobile", "web"] as const).map((t) => (
                            <Badge
                              key={t}
                              variant={s.client_type === t ? "default" : "outline"}
                              className="cursor-pointer"
                              onClick={() => patch(p, { client_type: t })}
                            >
                              {t === "mobile" ? L(lang, "Mobile", "Mobile") : L(lang, "Web", "Web")}
                            </Badge>
                          ))}
                        </div>
                      </td>
                      <td>
                        <Switch
                          checked={s.outbound_enabled}
                          onCheckedChange={(v) => patch(p, { outbound_enabled: v })}
                        />
                      </td>
                      <td className="text-right whitespace-nowrap">
                        <Button size="sm" variant="outline" className="gap-1 mr-2" onClick={() => void save(p)} disabled={savingId === p.user_id}>
                          {savingId === p.user_id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                          {L(lang, "Enregistrer", "Save")}
                        </Button>
                        <Button size="sm" className="gap-1" onClick={() => void call(p)} disabled={calling || !s.outbound_enabled}>
                          {calling && selected === p.user_id ? <Loader2 className="w-3 h-3 animate-spin" /> : <PhoneOutgoing className="w-3 h-3" />}
                          {L(lang, "Appeler", "Call")}
                        </Button>
                      </td>
                    </tr>
                  );
                })}
                {!loading && rows.length === 0 && (
                  <tr><td colSpan={6} className="pa-empty">{L(lang, "Aucun courtier avec un poste.", "No broker with an extension.")}</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </PAPage>
  );
}
