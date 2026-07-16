import { useEffect, useState } from 'react';
import { Loader2, CheckCircle2, AlertTriangle, XCircle, Mic2, Brain, Download, Clock, RotateCw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { TranscriptStage } from '@/lib/transcriptStatus';
import { STAGE_LABEL } from '@/lib/transcriptStatus';

const STAGE_ICON: Record<TranscriptStage, React.ComponentType<{ className?: string }>> = {
  idle: Mic2,
  downloading: Download,
  transcribing: Mic2,
  analyzing: Brain,
  pending_sync: Clock,
  complete: CheckCircle2,
  unavailable: AlertTriangle,
  failed: XCircle,
};

const STAGE_TONE: Record<TranscriptStage, string> = {
  idle: 'bg-muted text-muted-foreground border-border',
  downloading: 'bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/30',
  transcribing: 'bg-cyan-500/10 text-cyan-700 dark:text-cyan-300 border-cyan-500/30',
  analyzing: 'bg-violet-500/10 text-violet-700 dark:text-violet-300 border-violet-500/30',
  pending_sync: 'bg-amber-400/10 text-amber-700 dark:text-amber-300 border-amber-400/30',
  complete: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30',
  unavailable: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/40',
  failed: 'bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/40',
};

interface Props {
  stage: TranscriptStage;
  detail?: string;
  compact?: boolean;
  /** When stage='pending_sync', current retry attempt (1-based). */
  pendingAttempt?: number;
  pendingTotal?: number;
  pendingNextRetryAt?: number; // epoch ms
  onRetryNow?: () => void;
}

export function TranscriptStagePill({ stage, detail, compact, pendingAttempt, pendingTotal, pendingNextRetryAt, onRetryNow }: Props) {
  const Icon = STAGE_ICON[stage];
  const isLoading = stage === 'downloading' || stage === 'transcribing' || stage === 'analyzing' || stage === 'pending_sync';
  const label = STAGE_LABEL[stage];
  const showPending = stage === 'pending_sync' && (pendingAttempt || pendingNextRetryAt);

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!showPending) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [showPending]);

  const secondsLeft = pendingNextRetryAt ? Math.max(0, Math.ceil((pendingNextRetryAt - now) / 1000)) : null;

  return (
    <span className="inline-flex items-center gap-1.5 flex-wrap">
      <Badge variant="outline" className={`inline-flex items-center gap-1.5 border ${STAGE_TONE[stage]}`}>
        {isLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Icon className="w-3 h-3" />}
        <span className={compact ? 'text-[10px]' : 'text-xs'}>{label}</span>
        {showPending && pendingAttempt && pendingTotal && (
          <span className="opacity-80 text-[10px]">· {pendingAttempt}/{pendingTotal}</span>
        )}
        {showPending && secondsLeft !== null && (
          <span className="opacity-80 text-[10px] tabular-nums">· {secondsLeft}s</span>
        )}
        {detail && !compact && !showPending && <span className="opacity-70">· {detail}</span>}
      </Badge>
      {stage === 'pending_sync' && onRetryNow && (
        <Button size="sm" variant="ghost" className="h-6 px-2 text-[10px]" onClick={onRetryNow}>
          <RotateCw className="w-3 h-3 mr-1" /> Retry now
        </Button>
      )}
    </span>
  );
}
