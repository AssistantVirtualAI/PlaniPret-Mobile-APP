import { AlertTriangle, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { transcriptDiagnosticLabel, type TranscriptDiagnostic } from "@/lib/planipret/transcriptDiagnostic";

export function TranscriptDiagnosticNotice({ diagnostic, lang, busy = false, onRetry }: {
  diagnostic: TranscriptDiagnostic; lang: string; busy?: boolean; onRetry: () => void;
}) {
  return (
    <div className="pp-card p-4 space-y-3" role="status" aria-live="polite" data-transcript-diagnostic={diagnostic.code}>
      <div className="flex items-start gap-2 text-xs text-foreground">
        {busy ? <Loader2 className="w-4 h-4 shrink-0 animate-spin text-primary" /> : <AlertTriangle className="w-4 h-4 shrink-0 text-muted-foreground" />}
        <span>{transcriptDiagnosticLabel(diagnostic.code, lang)}</span>
      </div>
      {diagnostic.retryable && (
        <Button variant="outline" size="sm" className="w-full" disabled={busy} onClick={onRetry}>
          <RefreshCw className="w-3.5 h-3.5 mr-1" /> {lang === "en" ? "Retry" : "Réessayer"}
        </Button>
      )}
    </div>
  );
}