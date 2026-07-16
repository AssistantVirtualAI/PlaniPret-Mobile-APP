import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Brain, Sparkles, RefreshCw, ChevronDown, ChevronUp, Clock, AlertCircle, ShieldCheck, History, CheckCircle2, XCircle, Loader2, Download, FileText } from "lucide-react";
import { useCallIntelligence, type AnalysisStatus, type AuditEntry } from "@/hooks/useCallIntelligence";
import jsPDF from "jspdf";

function exportAuditCsv(callId: string, rows: AuditEntry[]) {
  const headers = ["created_at","event","status","pipeline","ai_model","forced","duration_ms","run_id","idempotency_key","error"];
  const esc = (v: any) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const body = rows.map(r => headers.map(h => esc((r as any)[h])).join(",")).join("\n");
  const blob = new Blob([headers.join(",") + "\n" + body], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `call-intel-audit-${callId}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

function exportAuditPdf(callId: string, rows: AuditEntry[]) {
  const doc = new jsPDF();
  doc.setFontSize(14); doc.text(`Call Intelligence Audit — ${callId}`, 14, 16);
  doc.setFontSize(9);
  let y = 26;
  rows.forEach((r) => {
    if (y > 280) { doc.addPage(); y = 16; }
    const line = `${new Date(r.created_at).toLocaleString()}  [${r.event}/${r.status}]  ${r.pipeline ?? ""}  ${r.ai_model ?? ""}  ${r.duration_ms ?? ""}ms  run=${r.run_id.slice(0,8)}`;
    doc.text(line, 14, y); y += 5;
    if (r.error) { doc.setTextColor(200,0,0); doc.text(`  error: ${r.error}`, 14, y); doc.setTextColor(0,0,0); y += 5; }
  });
  doc.save(`call-intel-audit-${callId}.pdf`);
}

interface Props {
  callId: string;
  canRegenerate?: boolean;
}

function StatusIndicator({ status, lastProcessedAt }: { status: AnalysisStatus; lastProcessedAt: string | null }) {
  const map: Record<AnalysisStatus, { label: string; cls: string; Icon: typeof Clock }> = {
    queued:        { label: "Queued",        cls: "text-slate-500 border-slate-500/40 bg-slate-500/10", Icon: Clock },
    processing:    { label: "AI analysis: en cours",    cls: "text-blue-500 border-blue-500/40 bg-blue-500/10",     Icon: Loader2 },
    analyzed:      { label: "AI analysis: déjà traité",      cls: "text-emerald-500 border-emerald-500/40 bg-emerald-500/10", Icon: CheckCircle2 },
    pending_sync:  { label: "Pending sync",  cls: "text-amber-500 border-amber-500/40 bg-amber-500/10",  Icon: Clock },
    failed:        { label: "AI analysis: échec",        cls: "text-red-500 border-red-500/40 bg-red-500/10",        Icon: XCircle },
    missing:       { label: "AI analysis: non traité",  cls: "text-muted-foreground border-border bg-muted/40",     Icon: AlertCircle },
  };
  const { label, cls, Icon } = map[status];
  return (
    <div className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs ${cls}`}>
      <Icon className={`h-3 w-3 ${status === "processing" ? "animate-spin" : ""}`} />
      {label}
      {lastProcessedAt && status === "analyzed" && (
        <span className="opacity-70">· {new Date(lastProcessedAt).toLocaleString()}</span>
      )}
    </div>
  );
}

export function CallIntelligencePanel({ callId, canRegenerate = false }: Props) {
  const { data, isLoading, isPending, regenerate, isRegenerating } = useCallIntelligence(callId);
  const [showTranscript, setShowTranscript] = useState(false);
  const [showAudit, setShowAudit] = useState(false);

  if (isLoading) {
    return (
      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><Brain className="h-4 w-4" /> AI Call Intelligence</CardTitle></CardHeader>
        <CardContent className="space-y-2"><Skeleton className="h-4 w-3/4" /><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-2/3" /></CardContent>
      </Card>
    );
  }

  const sentimentColor =
    data.sentiment === "positive" ? "text-emerald-500" :
    data.sentiment === "negative" ? "text-red-500" : "text-muted-foreground";

  const isCached = data.status === "cached";
  const isProcessingState = data.status === "processing";

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 gap-2">
        <CardTitle className="text-base flex items-center gap-2 flex-wrap">
          <Brain className="h-4 w-4" /> AI Call Intelligence
          <StatusIndicator status={data.analysisStatus} lastProcessedAt={data.last_processed_at} />
        </CardTitle>
        {canRegenerate && (
          <Button variant="ghost" size="sm" onClick={() => regenerate()} disabled={isRegenerating}>
            <RefreshCw className={`h-3.5 w-3.5 mr-1 ${isRegenerating ? "animate-spin" : ""}`} /> Re-analyze
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        {isProcessingState && (
          <div className="flex items-center gap-2 text-sm text-blue-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Another app is already running this analysis. Result will appear shortly.
          </div>
        )}

        {(isPending || data.status === "pending_sync") && (
          <div className="flex items-center gap-2 text-sm text-amber-500">
            <Clock className="h-4 w-4" /> Recording is syncing from the PBX. Analysis will run automatically.
          </div>
        )}

        {isCached && data.skipped_reason && (
          <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 p-3 text-xs space-y-2">
            <div className="flex items-center gap-2 text-emerald-600 font-medium">
              <ShieldCheck className="h-4 w-4" /> AI analysis: déjà traité — cache réutilisé
            </div>
            <p className="text-muted-foreground">{data.skipped_reason}</p>
            <div className="flex gap-2">
              <Badge variant="outline" className={data.outputs_present.transcript ? "text-emerald-600" : ""}>
                Transcript: {data.outputs_present.transcript ? "✓ present" : "—"}
              </Badge>
              <Badge variant="outline" className={data.outputs_present.insight ? "text-emerald-600" : ""}>
                Insight: {data.outputs_present.insight ? "✓ present" : "—"}
              </Badge>
            </div>
          </div>
        )}

        {!data.summary && data.status !== "cached" && !isProcessingState && !(isPending || data.status === "pending_sync") && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <AlertCircle className="h-4 w-4" /> No analysis yet for this call.
          </div>
        )}

        {data.summary && (
          <div>
            <div className="text-xs font-medium uppercase text-muted-foreground mb-1">Summary</div>
            <p>{data.summary}</p>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          {data.sentiment && <Badge variant="outline" className={sentimentColor}>Sentiment: {data.sentiment}</Badge>}
          {data.satisfaction_score != null && <Badge variant="outline">Satisfaction: {data.satisfaction_score}/5</Badge>}
          {data.quality_score != null && <Badge variant="outline">Quality: {data.quality_score}/5</Badge>}
          {data.coaching_score != null && <Badge variant="outline">Coaching: {data.coaching_score}/5</Badge>}
          {data.escalation_needed && <Badge variant="destructive">Escalation needed</Badge>}
        </div>

        {data.action_items.length > 0 && (
          <div>
            <div className="text-xs font-medium uppercase text-muted-foreground mb-1">Action items</div>
            <ul className="list-disc pl-5 space-y-1">{data.action_items.map((a, i) => <li key={i}>{a}</li>)}</ul>
          </div>
        )}

        {data.coaching_notes.length > 0 && (
          <div>
            <div className="text-xs font-medium uppercase text-muted-foreground mb-1 flex items-center gap-1">
              <Sparkles className="h-3 w-3" /> Coaching notes
            </div>
            <ul className="list-disc pl-5 space-y-1">{data.coaching_notes.map((c, i) => <li key={i}>{c}</li>)}</ul>
          </div>
        )}

        {data.topics.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {data.topics.map((t, i) => <Badge key={i} variant="secondary" className="text-xs">{t}</Badge>)}
          </div>
        )}

        {data.transcript && (
          <div>
            <Button variant="ghost" size="sm" onClick={() => setShowTranscript((s) => !s)} className="px-0">
              {showTranscript ? <ChevronUp className="h-4 w-4 mr-1" /> : <ChevronDown className="h-4 w-4 mr-1" />}
              Transcript
            </Button>
            {showTranscript && (
              <pre className="mt-2 whitespace-pre-wrap text-xs bg-muted/50 p-3 rounded-md max-h-80 overflow-auto">
                {data.transcript}
              </pre>
            )}
          </div>
        )}

        {/* Audit trail */}
        <div className="border-t pt-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <Button variant="ghost" size="sm" onClick={() => setShowAudit((s) => !s)} className="px-0">
              <History className="h-3.5 w-3.5 mr-1" />
              Audit trail ({data.audit.length})
              {showAudit ? <ChevronUp className="h-4 w-4 ml-1" /> : <ChevronDown className="h-4 w-4 ml-1" />}
            </Button>
            <div className="flex gap-1">
              <Button variant="outline" size="sm" disabled={data.audit.length === 0} onClick={() => exportAuditCsv(callId, data.audit)}>
                <Download className="h-3.5 w-3.5 mr-1" /> CSV
              </Button>
              <Button variant="outline" size="sm" disabled={data.audit.length === 0} onClick={() => exportAuditPdf(callId, data.audit)}>
                <FileText className="h-3.5 w-3.5 mr-1" /> PDF
              </Button>
            </div>
          </div>
          {showAudit && (
            <div className="mt-2 space-y-1 max-h-72 overflow-auto">
              {data.audit.length === 0 && <p className="text-xs text-muted-foreground">No processing runs recorded yet.</p>}
              {data.audit.map((a) => (
                <div key={a.id} className="text-xs flex flex-wrap items-center gap-2 border rounded-md p-2">
                  <Badge variant="outline" className="text-[10px]">{a.event}</Badge>
                  <span className="font-mono opacity-60">run {a.run_id.slice(0, 8)}</span>
                  {a.pipeline && <span className="opacity-70">{a.pipeline}</span>}
                  {a.ai_model && <span className="opacity-70">{a.ai_model}</span>}
                  {a.forced && <Badge variant="secondary" className="text-[10px]">forced</Badge>}
                  {a.duration_ms != null && <span className="opacity-60">{a.duration_ms}ms</span>}
                  <span className="ml-auto opacity-60">{new Date(a.created_at).toLocaleString()}</span>
                  {a.error && <div className="basis-full text-red-500">{a.error}</div>}
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
