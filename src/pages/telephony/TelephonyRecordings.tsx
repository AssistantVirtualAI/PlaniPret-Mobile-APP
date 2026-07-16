import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Disc, Loader2, ChevronDown, Sparkles } from 'lucide-react';
import { usePbxCallRecords, LEMTEL_ORG } from '@/hooks/usePbxData';
import { usePbxRealtime } from '@/hooks/usePbxRealtime';
import { SyncEverythingButton } from '@/components/lemtel/SyncEverythingButton';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { runTranscribeAndAnalyze, estimateQuality, isStubTranscript, type TranscriptStage } from '@/lib/transcriptStatus';
import { TranscriptStagePill } from '@/components/transcripts/TranscriptStagePill';
import { PendingSyncMetricsCard } from '@/components/transcripts/PendingSyncMetricsCard';
import { CallIntelligencePanel } from '@/components/calls/CallIntelligencePanel';


const isRecordingListChange = (payload: any) => {
  if (payload.eventType === 'INSERT' || payload.eventType === 'DELETE') return true;
  const oldRow = payload.old || {};
  const newRow = payload.new || {};
  const hasComparableOldRow = Object.prototype.hasOwnProperty.call(oldRow, 'has_recording')
    || Object.prototype.hasOwnProperty.call(oldRow, 'recording_url')
    || Object.prototype.hasOwnProperty.call(oldRow, 'recording_path')
    || Object.prototype.hasOwnProperty.call(oldRow, 'recording_name');
  if (!hasComparableOldRow) return false;
  return oldRow.has_recording !== newRow.has_recording
    || oldRow.recording_url !== newRow.recording_url
    || oldRow.recording_path !== newRow.recording_path
    || oldRow.recording_name !== newRow.recording_name;
};

function sentimentBadge(s?: string) {
  if (!s) return null;
  const v = s.toLowerCase();
  if (v.includes('positive')) return <Badge className="bg-green-500/15 text-green-700 dark:text-green-400">🟢 Positive</Badge>;
  if (v.includes('negative')) return <Badge className="bg-red-500/15 text-red-700 dark:text-red-400">🔴 Negative</Badge>;
  return <Badge className="bg-yellow-500/15 text-yellow-700 dark:text-yellow-400">🟡 Neutral</Badge>;
}

export default function TelephonyRecordings({ scope = 'org' }: { scope?: 'org' | 'mine' }) {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [extFilter, setExtFilter] = useState('');
  const [rangeDays, setRangeDays] = useState<7 | 30>(7);
  usePbxRealtime(['pbx_call_records', 'pbx_call_recordings'], ['pbx'], {
    throttleMs: 30_000,
    shouldInvalidate: isRecordingListChange,
  });
  const { data: myExt } = useQuery({
    queryKey: ['recordings-my-extension'],
    enabled: scope === 'mine',
    queryFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return null;
      const { data } = await (supabase as any).from('pbx_softphone_users')
        .select('extension').eq('portal_user_id', auth.user.id).maybeSingle();
      return data?.extension ?? null;
    },
  });
  const queryExt = scope === 'mine' ? myExt : (extFilter.trim() || undefined);
  const { data: cdrs = [], isLoading } = usePbxCallRecords(500, {
    extension: queryExt,
    rangeDays,
    enabled: scope !== 'mine' || !!myExt,
  });
  const allRecordings = (cdrs as any[]).filter(c => c.has_recording || c.recording_url);
  const recordings = allRecordings.filter((c) => {
    if (!search.trim()) return true;
    const s = search.trim().toLowerCase();
    return [c.caller_number, c.caller_name, c.destination_number, c.extension, c.raw_data?.transcript_text, c.ai_summary]
      .some((v) => String(v ?? '').toLowerCase().includes(s));
  });
  const [expanded, setExpanded] = useState<string | null>(null);
  const [playing, setPlaying] = useState<string | null>(null);
  const [working, setWorking] = useState<string | null>(null);
  const [stages, setStages] = useState<Record<string, { stage: TranscriptStage; detail?: string }>>({});
  const [inlineErrors, setInlineErrors] = useState<Record<string, string | null>>({});
  const [pendingSync, setPendingSync] = useState<Record<string, { attempt: number; total: number; nextRetryAt: number } | null>>({});
  const retryNowRefs = (window as any).__retryRefs ||= {} as Record<string, { current: (() => void) | null }>;

  const transcribeAndAnalyze = async (id: string) => {
    setWorking(id);
    setInlineErrors((m) => ({ ...m, [id]: null }));
    setStages((s) => ({ ...s, [id]: { stage: 'downloading' } }));
    retryNowRefs[id] = { current: null };
    const result = await runTranscribeAndAnalyze({
      invoke: async (name, body) => await supabase.functions.invoke(name, { body }),
      callRecordId: id,
      organizationId: LEMTEL_ORG,
      retryNowRef: retryNowRefs[id],
      onStage: (stage, detail) => setStages((s) => ({ ...s, [id]: { stage, detail } })),
      onPendingSync: (p) => setPendingSync((m) => ({ ...m, [id]: p ? { attempt: p.attempt, total: p.total, nextRetryAt: p.nextRetryAt } : null })),
    });
    if (result.stage === 'failed') {
      const msg = result.reason || 'Échec de la transcription/scoring';
      setInlineErrors((m) => ({ ...m, [id]: msg }));
      toast.error('Transcription/scoring failed', { description: msg, action: { label: 'Voir erreur', onClick: () => { setExpanded(id); setTimeout(() => document.getElementById(`ai-error-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 80); } } });
    } else if (result.stage === 'unavailable') toast.message('Enregistrement indisponible', { description: result.reason || 'Audio non récupérable' });
    else if (result.stage === 'pending_sync') toast.message('En attente de la synchro PBX', { description: `Abandonné après ${result.pendingSyncAttempts} tentatives` });
    else toast.success('AI analysis: déjà traité et mis en cache');

    qc.setQueriesData({ queryKey: ['pbx'] }, (old: any) => {
      if (!Array.isArray(old)) return old;
      return old.map((row) => row?.id === id ? {
        ...row,
        transcribed: result.stage === 'complete',
        analyzed: result.stage === 'complete' && !result.insightStub,
        ai_summary: result.data?.summary ?? row.ai_summary,
        raw_data: {
          ...(row.raw_data || {}),
          transcript_text: result.data?.transcript_text || result.data?.transcript || row.raw_data?.transcript_text,
          transcript_provider: result.data?.transcript_provider || row.raw_data?.transcript_provider,
          ai: result.data?.insights || result.data?.analysis || result.data,
        },
      } : row);
    });
    setWorking(null);
    setPendingSync((m) => ({ ...m, [id]: null }));
  };



  if (isLoading) return <div className="flex justify-center py-8"><Loader2 className="animate-spin" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2"><Disc className="w-7 h-7" /> Recordings</h1>
          <p className="text-muted-foreground">Call recordings with AI transcription and analysis</p>
        </div>
        <SyncEverythingButton />
      </div>

      <Card>
        <CardContent className="py-3 flex flex-wrap gap-2 items-center">
          <Input
            placeholder="Search by name, number, transcript…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-sm"
          />
          {scope !== 'mine' && (
            <Input
              placeholder="Filter by extension #"
              value={extFilter}
              onChange={(e) => setExtFilter(e.target.value.replace(/[^0-9*]/g, ''))}
              inputMode="numeric"
              className="max-w-[180px] font-mono"
            />
          )}
          <div className="flex rounded-md border border-border overflow-hidden">
            {([7, 30] as const).map((days) => (
              <Button key={days} type="button" size="sm" variant={rangeDays === days ? 'default' : 'ghost'} className="rounded-none" onClick={() => setRangeDays(days)}>
                {days} days
              </Button>
            ))}
          </div>
          <span className="text-xs text-muted-foreground ml-auto">
            {recordings.length} of {allRecordings.length} recordings
          </span>
        </CardContent>
      </Card>

      <PendingSyncMetricsCard organizationId={LEMTEL_ORG} />

      {recordings.length === 0 ? (
        <Card><CardContent className="py-16 text-center text-muted-foreground">No recordings yet.</CardContent></Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {recordings.map((c: any) => (
            <Card key={c.id} className="flex flex-col">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <CardTitle className="text-base font-mono">{c.caller_number || c.caller_name || '—'}</CardTitle>
                    <p className="text-xs text-muted-foreground mt-1">{c.start_at ? new Date(c.start_at).toLocaleString() : ''}</p>
                  </div>
                  <Badge variant="outline">{c.duration_seconds || 0}s</Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3 flex-1 flex flex-col">
                {c.recording_url ? (
                  <audio
                    controls
                    src={c.recording_url}
                    className="w-full"
                    onPlay={() => setPlaying(c.id)}
                    onPause={() => setPlaying(null)}
                    onEnded={() => {
                      // Auto-analyze once playback finishes so coaching notes
                      // and scores show up without a manual second tap. The
                      // ai-analyze-call edge function is idempotent — cached
                      // results return instantly and no tokens are re-burned.
                      if (!c.transcribed && working !== c.id) transcribeAndAnalyze(c.id);
                    }}
                  />
                ) : (
                  <div className="text-xs text-muted-foreground text-center py-2 border rounded">Recording URL not available</div>
                )}
                {(() => {
                  const live = stages[c.id];
                  const transcript = { provider: c.raw_data?.transcript_provider, transcript_text: c.raw_data?.transcript_text };
                  const insight = { ai_model: c.raw_data?.ai?.ai_model, summary: c.raw_data?.ai?.summary || c.raw_data?.summary, quality_score: c.raw_data?.ai?.quality_score };
                  const stubT = isStubTranscript(transcript);
                  const q = estimateQuality(transcript, insight, c.duration_seconds);
                  const stage: TranscriptStage = live?.stage
                    ?? (working === c.id ? 'transcribing'
                      : c.transcribed && !stubT ? 'complete'
                      : c.transcribed && stubT ? 'unavailable'
                      : 'idle');
                  return (
                    <>
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <TranscriptStagePill
                          stage={stage}
                          detail={live?.detail}
                          compact
                          pendingAttempt={pendingSync[c.id]?.attempt}
                          pendingTotal={pendingSync[c.id]?.total}
                          pendingNextRetryAt={pendingSync[c.id]?.nextRetryAt}
                          onRetryNow={() => retryNowRefs[c.id]?.current?.()}
                        />
                        {sentimentBadge(c.raw_data?.sentiment)}
                        {!stubT && c.transcribed && (
                          <Badge variant="outline" className="text-[10px]">Quality {q.total}/100</Badge>
                        )}
                        <Badge variant="outline" className={stage === 'complete' ? 'text-emerald-600' : stage === 'failed' ? 'text-red-600' : 'text-muted-foreground'}>
                          {stage === 'complete' ? 'AI analysis: déjà traité' : stage === 'failed' ? 'AI analysis: échec' : working === c.id ? 'AI analysis: en cours' : 'AI analysis: non traité'}
                        </Badge>
                      </div>
                      <div className="flex items-center justify-end">
                        <Button size="sm" variant={c.transcribed ? 'ghost' : 'outline'} onClick={() => transcribeAndAnalyze(c.id)} disabled={working === c.id}>
                          {working === c.id ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Sparkles className="w-3 h-3 mr-1" />}
                          {c.transcribed ? 'Retry' : 'Transcribe & Analyze'}
                        </Button>
                      </div>
                      {c.transcribed && (
                        <Button variant="ghost" size="sm" className="self-start" onClick={() => setExpanded(expanded === c.id ? null : c.id)}>
                          <ChevronDown className={`w-4 h-4 mr-1 transition-transform ${expanded === c.id ? 'rotate-180' : ''}`} /> Details
                        </Button>
                      )}
                      {expanded === c.id && (
                        <div className="space-y-2 text-sm border-t pt-3">
                          {inlineErrors[c.id] && (
                            <div id={`ai-error-${c.id}`} className="rounded-md border border-red-500/40 bg-red-500/10 p-2 text-xs text-red-600 dark:text-red-300">
                              <div className="font-semibold">Erreur transcription/scoring exacte</div>
                              <div className="mt-1 break-words">{inlineErrors[c.id]}</div>
                            </div>
                          )}
                          {stubT ? (
                            <div className="text-amber-600 dark:text-amber-300 text-xs">Transcript not yet available — the recording could not be retrieved. Use Retry once it has synced.</div>
                          ) : (
                            <>
                              <div><span className="font-semibold">Summary:</span> <p className="text-muted-foreground mt-1">{insight.summary || '—'}</p></div>
                              {c.raw_data?.topics && <div className="flex flex-wrap gap-1">{(c.raw_data.topics as string[]).map(t => <Badge key={t} variant="outline" className="text-xs">{t}</Badge>)}</div>}
                              <div className="grid grid-cols-2 gap-2 text-[11px] text-muted-foreground pt-2">
                                <div>Transcript length: {q.parts.transcriptLength}/40</div>
                                <div>Speaker segments: {q.parts.speakerSegments}/25</div>
                                <div>Silence ratio: {q.parts.silenceRatio}/15</div>
                                <div>AI summary: {q.parts.aiSummary}/20</div>
                              </div>
                            </>
                          )}
                          <CallIntelligencePanel callId={c.id} canRegenerate />
                        </div>
                      )}
                    </>
                  );
                })()}
              </CardContent>

            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
