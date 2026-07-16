import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { ConsolePageHeader } from "@/components/console/ConsolePageHeader";
import { Phone, Smartphone, Wifi, PhoneCall, FileAudio, Voicemail } from "lucide-react";
import { Link } from "react-router-dom";

const TILES = [
  { id: "extensions", label: "Extensions", table: "pbx_extensions_safe", to: "/console/extensions", Icon: Phone },
  { id: "devices",    label: "Devices",    table: "pbx_devices",    to: "/console/devices", Icon: Smartphone },
  { id: "ivrs",       label: "IVRs",       table: "pbx_ivrs",       to: "/console/ivrs", Icon: Wifi },
  { id: "queues",     label: "Queues",     table: "pbx_call_queues",to: "/console/queues", Icon: PhoneCall },
  { id: "cdr",        label: "Calls (24h)",table: "pbx_call_records",to: "/console/cdr", Icon: FileAudio, since: true },
  { id: "voicemail",  label: "Voicemails", table: "pbx_voicemails", to: "/console/voicemail", Icon: Voicemail },
] as const;

export default function ConsoleDashboard() {
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const out: Record<string, number> = {};
      await Promise.all(TILES.map(async (t) => {
        let q = (supabase.from(t.table as any) as any).select("id", { count: "exact", head: true });
        if ((t as any).since) q = q.gte("start_at", new Date(Date.now() - 86400000).toISOString());
        const { count } = await q;
        out[t.id] = count ?? 0;
      }));
      setCounts(out);
      setLoading(false);
    })();
  }, []);

  return (
    <div>
      <ConsolePageHeader title="Command Center" description="Telephony control plane — every entity, source-tagged."
        sourceId="extensions" hasData />
      <div className="p-4 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {TILES.map(t => (
          <Link key={t.id} to={t.to}>
            <Card className="hover:bg-accent/40 transition">
              <CardHeader className="pb-1 flex flex-row items-center justify-between">
                <CardTitle className="text-xs font-medium text-muted-foreground">{t.label}</CardTitle>
                <t.Icon className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-semibold">{loading ? "…" : counts[t.id] ?? 0}</div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
