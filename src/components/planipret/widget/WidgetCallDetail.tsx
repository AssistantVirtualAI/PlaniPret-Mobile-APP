import { useEffect } from "react";
import { useCallAnalysis } from "@/hooks/useCallAnalysis";
import { Loader2, Sparkles, CheckCircle2, AlertCircle, RefreshCw } from "lucide-react";

interface Props {
  callId: string | null;
  compact?: boolean;
}

/**
 * Compact post-call view for the softphone widget (SIP device).
 * Uses shared useCallAnalysis hook → same data as admin & mobile.
 * Auto-triggers analysis when transcript is ready.
 */
export function WidgetCallDetail({ callId, compact = true }: Props) {
  const {
    call, analyzing, locked, error, analyze,
    transcript, transcriptSegments, coaching,
    coachingScore, aiSummary, nextActions,
    isAnalyzed, hasTranscript,
  } = useCallAnalysis(callId);

  // Auto-analyze once transcript arrives
  useEffect(() => {
    if (hasTranscript && !isAnalyzed && !analyzing && !locked) {
      analyze();
    }
  }, [hasTranscript, isAnalyzed, analyzing, locked, analyze]);

  if (!callId) return null;

  if (!call) {
    return (
      <div className="flex items-center gap-2 p-3 text-xs text-muted-foreground">
        <Loader2 className="w-3 h-3 animate-spin" /> Chargement…
      </div>
    );
  }

  const score = coachingScore ?? coaching?.overall_score ?? null;
  const scoreColor = score == null ? "#64748b" : score >= 80 ? "#00D4AA" : score >= 60 ? "#F5A623" : "#E84C4C";

  return (
    <div className={`flex flex-col gap-2 ${compact ? "p-2 text-xs" : "p-4 text-sm"}`}>
      {/* Status bar */}
      {analyzing && (
        <div className="flex items-center gap-2 rounded-md bg-primary/10 px-2 py-1.5 text-primary">
          <Sparkles className="w-3.5 h-3.5 animate-pulse" />
          <span className="font-medium">AVA analyse l'appel…</span>
        </div>
      )}
      {locked && !analyzing && (
        <div className="flex items-center gap-2 rounded-md bg-amber-500/10 px-2 py-1.5 text-amber-700 dark:text-amber-400">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          <span>Analyse en cours sur un autre appareil</span>
        </div>
      )}
      {error && !analyzing && (
        <div className="flex items-center justify-between gap-2 rounded-md bg-red-500/10 px-2 py-1.5 text-red-600">
          <div className="flex items-center gap-1.5">
            <AlertCircle className="w-3.5 h-3.5" /> {error}
          </div>
          <button onClick={() => analyze(true)} className="flex items-center gap-1 hover:underline">
            <RefreshCw className="w-3 h-3" /> Réessayer
          </button>
        </div>
      )}
      {isAnalyzed && !analyzing && (
        <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
          <CheckCircle2 className="w-3.5 h-3.5" />
          <span className="font-medium">Analysé</span>
          {score != null && (
            <span className="ml-auto font-bold" style={{ color: scoreColor }}>
              {score}/100
            </span>
          )}
        </div>
      )}

      {/* Summary */}
      {aiSummary && (
        <div className="rounded-md border border-border/60 bg-muted/40 p-2">
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Résumé</div>
          <p className="leading-relaxed">{aiSummary}</p>
        </div>
      )}

      {/* Coaching */}
      {coaching && (
        <>
          {coaching.strengths?.length > 0 && (
            <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 p-2">
              <div className="mb-1 text-[10px] font-semibold uppercase text-emerald-600 dark:text-emerald-400">✅ Points forts</div>
              <ul className="space-y-0.5">
                {coaching.strengths.slice(0, 3).map((s: string, i: number) => (
                  <li key={i} className="leading-snug">• {s}</li>
                ))}
              </ul>
            </div>
          )}
          {coaching.improvements?.length > 0 && (
            <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-2">
              <div className="mb-1 text-[10px] font-semibold uppercase text-amber-600 dark:text-amber-400">⚠️ À améliorer</div>
              <ul className="space-y-0.5">
                {coaching.improvements.slice(0, 3).map((s: string, i: number) => (
                  <li key={i} className="leading-snug">• {s}</li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}

      {/* Next actions */}
      {Array.isArray(nextActions) && nextActions.length > 0 && (
        <div className="rounded-md border border-primary/30 bg-primary/5 p-2">
          <div className="mb-1 text-[10px] font-semibold uppercase text-primary">⚡ Prochaines actions</div>
          <ul className="space-y-0.5">
            {nextActions.slice(0, 4).map((a: any, i: number) => (
              <li key={i} className="leading-snug">
                • {typeof a === "string" ? a : a.action || a.title || JSON.stringify(a)}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Transcript */}
      {hasTranscript && (transcriptSegments?.length > 0 || transcript) && (
        <details className="rounded-md border border-border/60 bg-background">
          <summary className="cursor-pointer px-2 py-1.5 text-[10px] font-semibold uppercase text-muted-foreground">
            📝 Transcription
          </summary>
          <div className="max-h-64 overflow-y-auto p-2 space-y-1">
            {Array.isArray(transcriptSegments) && transcriptSegments.length > 0
              ? transcriptSegments.map((seg: any, i: number) => (
                  <div key={i} className="leading-snug">
                    <span className="font-semibold text-primary">{seg.speaker || "?"}:</span>{" "}
                    <span>{seg.text}</span>
                  </div>
                ))
              : <p className="leading-relaxed whitespace-pre-wrap">{transcript}</p>}
          </div>
        </details>
      )}

      {!hasTranscript && !analyzing && (
        <div className="text-center text-muted-foreground py-2">
          Transcription non disponible pour cet appel
        </div>
      )}
    </div>
  );
}
