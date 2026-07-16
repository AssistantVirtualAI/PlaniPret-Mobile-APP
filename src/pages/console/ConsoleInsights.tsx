import { useEffect, useState } from "react";
import { ConsolePageHeader } from "@/components/console/ConsolePageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { Progress } from "@/components/ui/progress";

export default function ConsoleInsights() {
  const [stats, setStats] = useState({ total: 0, transcribed: 0, analyzed: 0, recorded: 0 });
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    (async () => {
      const [{ count: total }, { count: transcribed }, { count: analyzed }, { count: recorded }] = await Promise.all([
        supabase.from("pbx_call_records").select("id", { count: "exact", head: true }),
        supabase.from("pbx_call_records").select("id", { count: "exact", head: true }).eq("transcribed", true),
        supabase.from("pbx_call_records").select("id", { count: "exact", head: true }).eq("analyzed", true),
        supabase.from("pbx_call_records").select("id", { count: "exact", head: true }).eq("has_recording", true),
      ]);
      setStats({ total: total ?? 0, transcribed: transcribed ?? 0, analyzed: analyzed ?? 0, recorded: recorded ?? 0 });
      setLoading(false);
    })();
  }, []);

  const pct = (n: number) => stats.total ? Math.round((n / stats.total) * 100) : 0;
  const items = [
    { label: "Recorded", value: stats.recorded },
    { label: "Transcribed", value: stats.transcribed },
    { label: "AI-analyzed", value: stats.analyzed },
  ];

  return (
    <div>
      <ConsolePageHeader title="AI Insights" description="Coverage and quality of AI analysis across calls." sourceId="cdr" hasData />
      <div className="p-4 grid grid-cols-1 md:grid-cols-3 gap-3">
        {items.map(i => (
          <Card key={i.label}>
            <CardHeader className="pb-1"><CardTitle className="text-sm text-muted-foreground">{i.label}</CardTitle></CardHeader>
            <CardContent>
              <div className="text-3xl font-semibold">{loading ? "…" : pct(i.value)}%</div>
              <div className="text-xs text-muted-foreground mb-2">{i.value} of {stats.total} calls</div>
              <Progress value={pct(i.value)} />
            </CardContent>
          </Card>
        ))}
      </div>
      {!loading && stats.total === 0 && (
        <div className="px-4 text-sm text-muted-foreground">No calls in CDR yet. Sync CDR from the Live → CDR & Recordings page.</div>
      )}
    </div>
  );
}
