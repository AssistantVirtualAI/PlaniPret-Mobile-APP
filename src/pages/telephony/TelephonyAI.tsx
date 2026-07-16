import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/context/OrganizationContext";
import { GlassCard } from "@/components/ui/ai/GlassCard";
import { StatTile } from "@/components/ui/ai/StatTile";
import { AIBadge } from "@/components/ui/ai/AIBadge";
import { MeshBackground } from "@/components/ui/ai/MeshBackground";
import { SectionHeader } from "@/components/ui/ai/SectionHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import {
  Brain, Sparkles, PhoneCall, Clock, AlertTriangle, TrendingUp,
  Tag, MessageSquare, Loader2, RefreshCw, Smile, Meh, Frown, Mic,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

type Period = 1 | 7 | 30;

function formatDuration(s: number) {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}m ${sec.toString().padStart(2, "0")}s`;
}

const sentimentIcon = (s?: string | null) =>
  s === "positive" ? <Smile className="h-4 w-4 text-[hsl(var(--neon-green))]" />
  : s === "negative" ? <Frown className="h-4 w-4 text-[hsl(var(--hot-pink))]" />
  : <Meh className="h-4 w-4 text-muted-foreground" />;

export default function TelephonyAI() {
  const { selectedOrg } = useOrganization();
  const orgId = selectedOrg?.id;
  const qc = useQueryClient();
  const [period, setPeriod] = useState<Period>(7);

  // Recent calls (last 50)
  const { data: calls = [], isLoading: callsLoading } = useQuery({
    queryKey: ["pbx_calls_ai", orgId, period],
    enabled: !!orgId,
    queryFn: async () => {
      const from = new Date(Date.now() - period * 86400_000).toISOString();
      const { data, error } = await supabase
        .from("pbx_call_records")
        .select("id, direction, duration_seconds, caller_name, caller_number, destination, start_at, recording_url, analyzed, missed_call")
        .eq("organization_id", orgId!)
        .gte("start_at", from)
        .order("start_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: insights = [], isLoading: insightsLoading } = useQuery({
    queryKey: ["pbx_ai_insights", orgId, period],
    enabled: !!orgId,
    queryFn: async () => {
      const from = new Date(Date.now() - period * 86400_000).toISOString();
      const { data, error } = await supabase
        .from("pbx_ai_insights")
        .select("*")
        .eq("organization_id", orgId!)
        .gte("created_at", from)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data ?? [];
    },
  });

  const insightsByCall = useMemo(
    () => new Map<string, any>(insights.map((i: any) => [i.call_record_id, i])),
    [insights]
  );

  // Period-level AI narrative
  const { data: periodInsights, isLoading: narrLoading, refetch: refetchNarrative } = useQuery({
    queryKey: ["ai-period-insights", orgId, period],
    enabled: !!orgId,
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("ai-period-insights", {
        body: { organizationId: orgId, days: period },
      });
      if (error) throw error;
      return data;
    },
  });

  const summarize = useMutation({
    mutationFn: async (callId: string) => {
      const { data, error } = await supabase.functions.invoke("ai-summarize-call", {
        body: { callId, force: false },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pbx_ai_insights", orgId] });
      toast.success("Call analyzed");
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to analyze"),
  });

  // KPIs
  const kpis = useMemo(() => {
    const total = calls.length;
    const avg = total ? Math.round(calls.reduce((s: number, c: any) => s + (c.duration_seconds || 0), 0) / total) : 0;
    const missed = calls.filter((c: any) => c.missed_call).length;
    const analyzed = insights.length;
    return { total, avg, missed, analyzed };
  }, [calls, insights]);

  const sentiments = useMemo(() => ({
    positive: insights.filter((i: any) => i.sentiment === "positive").length,
    neutral: insights.filter((i: any) => i.sentiment === "neutral").length,
    negative: insights.filter((i: any) => i.sentiment === "negative").length,
  }), [insights]);

  const topTopics = useMemo(() => {
    const m = new Map<string, number>();
    insights.forEach((i: any) => (i.topics || []).forEach((t: string) => m.set(t, (m.get(t) || 0) + 1)));
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1]).slice(0, 12);
  }, [insights]);

  return (
    <div className="relative min-h-screen p-6 space-y-6">
      <MeshBackground />

      {/* Hero */}
      <div className="relative">
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="rounded-2xl p-3 ai-border">
                <Brain className="h-7 w-7 text-primary" />
              </div>
              <div>
                <h1 className="text-4xl font-bold ai-text-gradient">AI Intelligence</h1>
                <p className="text-sm text-muted-foreground mt-1">
                  Conversation insights, call summaries and operational recommendations powered by Lovable AI.
                </p>
              </div>
              <AIBadge label="Live" />
            </div>
          </div>
          <div className="flex items-center gap-2">
            {([1, 7, 30] as Period[]).map((p) => (
              <Button
                key={p}
                size="sm"
                variant={period === p ? "default" : "outline"}
                onClick={() => setPeriod(p)}
                className={period === p ? "ai-glow" : ""}
              >
                {p === 1 ? "24h" : `${p}d`}
              </Button>
            ))}
            <Button size="sm" variant="outline" onClick={() => refetchNarrative()}>
              <RefreshCw className={`h-4 w-4 ${narrLoading ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatTile label="Total calls" value={kpis.total} icon={PhoneCall} accent="primary" hint={`Last ${period === 1 ? "24h" : period + " days"}`} />
        <StatTile label="Avg duration" value={formatDuration(kpis.avg)} icon={Clock} accent="cyan" />
        <StatTile label="Analyzed" value={kpis.analyzed} icon={Sparkles} accent="purple" hint={`${kpis.total ? Math.round((kpis.analyzed / kpis.total) * 100) : 0}% coverage`} />
        <StatTile label="Missed" value={kpis.missed} icon={AlertTriangle} accent="pink" />
      </div>

      {/* Narrative */}
      <GlassCard gradientBorder className="relative overflow-hidden">
        <SectionHeader icon={TrendingUp} title={`Executive briefing — ${period === 1 ? "24h" : period + " days"}`} subtitle="Generated narrative grounded in your call data." showBadge />
        {narrLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-5/6" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        ) : (
          <pre className="whitespace-pre-wrap text-sm leading-relaxed font-sans text-foreground/90">
            {periodInsights?.narrative || "No narrative yet — analyze a few calls below to seed insights."}
          </pre>
        )}
      </GlassCard>

      {/* Sentiment + Topics row */}
      <div className="grid lg:grid-cols-3 gap-4">
        <GlassCard gradientBorder>
          <SectionHeader icon={Smile} title="Sentiment mix" />
          <div className="space-y-3">
            {(["positive", "neutral", "negative"] as const).map((k) => {
              const pct = insights.length ? Math.round((sentiments[k] / insights.length) * 100) : 0;
              return (
                <div key={k} className="space-y-1">
                  <div className="flex items-center justify-between text-xs uppercase tracking-wider text-muted-foreground">
                    <span className="flex items-center gap-1.5">{sentimentIcon(k)} {k}</span>
                    <span>{sentiments[k]} · {pct}%</span>
                  </div>
                  <div className="h-2 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${pct}%`,
                        background: k === "positive"
                          ? "linear-gradient(90deg, hsl(var(--neon-green)), hsl(var(--cyber-cyan)))"
                          : k === "negative"
                            ? "linear-gradient(90deg, hsl(var(--hot-pink)), hsl(var(--destructive)))"
                            : "linear-gradient(90deg, hsl(var(--muted-foreground)), hsl(var(--border)))",
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </GlassCard>

        <GlassCard gradientBorder className="lg:col-span-2">
          <SectionHeader icon={Tag} title="Topics detected" subtitle="Across analyzed calls in this period" />
          {topTopics.length === 0 ? (
            <p className="text-sm text-muted-foreground">No topics yet. Run analysis on some calls below to start clustering.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {topTopics.map(([t, n]) => (
                <Badge key={t} variant="outline" className="ai-border bg-card/40">
                  {t} <span className="ml-1.5 text-[10px] opacity-60">×{n}</span>
                </Badge>
              ))}
            </div>
          )}
        </GlassCard>
      </div>

      {/* Calls feed */}
      <GlassCard gradientBorder>
        <SectionHeader
          icon={MessageSquare}
          title="Recent calls"
          subtitle="Analyze recordings to generate structured AI summaries"
          showBadge
        />
        {callsLoading || insightsLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}
          </div>
        ) : calls.length === 0 ? (
          <p className="text-sm text-muted-foreground">No calls in this period.</p>
        ) : (
          <ScrollArea className="max-h-[600px] pr-4">
            <div className="space-y-3">
              {calls.map((c: any) => {
                const ins = insightsByCall.get(c.id);
                const canAnalyze = !!c.recording_url || ins;
                return (
                  <div key={c.id} className="rounded-lg ai-border p-3 hover:bg-card/40 transition">
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={`p-2 rounded-lg ${c.direction === "inbound" ? "bg-primary/10 text-primary" : "bg-secondary/10 text-secondary"}`}>
                          <PhoneCall className="h-4 w-4" />
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm font-semibold truncate">
                            {c.caller_name || c.caller_number || "Unknown"} → {c.destination || "—"}
                          </div>
                          <div className="text-xs text-muted-foreground flex items-center gap-2 flex-wrap">
                            <Clock className="h-3 w-3" />
                            {formatDuration(c.duration_seconds || 0)}
                            <span>·</span>
                            {c.start_at && formatDistanceToNow(new Date(c.start_at), { addSuffix: true })}
                            {c.recording_url && <><span>·</span><Mic className="h-3 w-3" />recording</>}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {ins && sentimentIcon(ins.sentiment)}
                        {ins?.escalation_needed && <Badge variant="destructive" className="text-[10px]">Escalate</Badge>}
                        <Button
                          size="sm"
                          variant={ins ? "outline" : "default"}
                          disabled={!canAnalyze || (summarize.isPending && summarize.variables === c.id)}
                          onClick={() => summarize.mutate(c.id)}
                        >
                          {summarize.isPending && summarize.variables === c.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : ins ? "Re-analyze" : "Analyze"}
                        </Button>
                      </div>
                    </div>
                    {ins && (
                      <div className="mt-3 space-y-2">
                        <p className="text-sm text-foreground/90">{ins.summary}</p>
                        {ins.topics?.length > 0 && (
                          <div className="flex flex-wrap gap-1.5">
                            {ins.topics.map((t: string) => (
                              <Badge key={t} variant="secondary" className="text-[10px]">{t}</Badge>
                            ))}
                          </div>
                        )}
                        {ins.action_items?.length > 0 && (
                          <div className="text-xs text-muted-foreground">
                            <span className="font-semibold text-foreground">Actions:</span> {ins.action_items.join(" · ")}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        )}
      </GlassCard>
    </div>
  );
}
