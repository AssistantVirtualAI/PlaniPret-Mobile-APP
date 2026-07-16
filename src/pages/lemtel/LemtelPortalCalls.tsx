import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Loader2, Sparkles, Play, RefreshCw, Phone, Search, ChevronDown, ChevronUp, Download } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { usePbxCallRecords, usePbxSync, usePbxTestCdrEndpoint, LEMTEL_ORG } from '@/hooks/usePbxData';
import { usePbxAutoSync } from '@/hooks/usePbxAutoSync';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { loadPbxRecordingAudio } from '@/lib/pbxRecordingAudio';
import { runTranscribeAndAnalyze, isStubTranscript, type TranscriptStage } from '@/lib/transcriptStatus';
import { TranscriptStagePill } from '@/components/transcripts/TranscriptStagePill';


function statusBadge(c: any) {
  if (c.missed_call) return <Badge className="bg-red-500/15 text-red-600 border-red-500/30 border">Missed</Badge>;
  if (c.voicemail_message) return <Badge className="bg-purple-500/15 text-purple-600 border-purple-500/30 border">Voicemail</Badge>;
  const s = c.call_status;
  if (s === 'answered' && c.direction === 'inbound') return <Badge className="bg-green-500/15 text-green-600 border-green-500/30 border">Answered</Badge>;
  if (s === 'answered' && c.direction === 'outbound') return <Badge className="bg-blue-500/15 text-blue-600 border-blue-500/30 border">Outbound</Badge>;
  if (s === 'no_answer') return <Badge variant="outline">No Answer</Badge>;
  if (s === 'failed') return <Badge className="bg-red-500/15 text-red-600 border-red-500/30 border">Failed</Badge>;
  if (s === 'cancelled') return <Badge variant="outline">Cancelled</Badge>;
  return <Badge variant="outline">{s || c.direction || '—'}</Badge>;
}

function today() { return new Date().toISOString().slice(0, 10); }
function daysAgo(n: number) { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); }

export default function LemtelPortalCalls({ scope = 'org' }: { scope?: 'org' | 'mine' }) {
  // Live pull from FusionPBX on mount + polling; scoped end-users still get their extension filter.
  usePbxAutoSync(['cdrs', 'recordings', 'voicemails']);
  const { toast } = useToast();
  const qc = useQueryClient();
  const [analyzing, setAnalyzing] = useState<string | null>(null);
  const [stages, setStages] = useState<Record<string, { stage: TranscriptStage; detail?: string }>>({});
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);

  const sync = usePbxSync();
  const test = usePbxTestCdrEndpoint();
  const [diagOpen, setDiagOpen] = useState(false);
  const [lastJob, setLastJob] = useState<any>(null);
  const [rangeOpen, setRangeOpen] = useState(false);
  const [fromDate, setFromDate] = useState(daysAgo(30));
  const [toDate, setToDate] = useState(today());
  const [extFilter, setExtFilter] = useState('');
  const { data: myExt } = useQuery({
    queryKey: ['portal-calls-my-extension'],
    enabled: scope === 'mine',
    queryFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return null;
      const { data } = await (supabase as any).from('pbx_softphone_users')
        .select('extension').eq('portal_user_id', auth.user.id).maybeSingle();
      return data?.extension ?? null;
    },
  });
  const { data: cdrs = [], isLoading } = usePbxCallRecords(100, {
    extension: scope === 'mine' ? myExt : undefined,
    enabled: scope !== 'mine' || !!myExt,
  });

  const analyze = async (call: any) => {
    const call_record_id = call.id;
    setAnalyzing(call_record_id);
    setStages((s) => ({ ...s, [call_record_id]: { stage: 'downloading' } }));
    const result = await runTranscribeAndAnalyze({
      invoke: async (name, body) => await supabase.functions.invoke(name, { body }),
      callRecordId: call_record_id,
      organizationId: LEMTEL_ORG,
      recordingUrl: call.recording_url || null,
      onStage: (stage, detail) => setStages((s) => ({ ...s, [call_record_id]: { stage, detail } })),
    });
    if (result.stage === 'failed') toast({ title: 'Analysis failed', description: result.reason, variant: 'destructive' });
    else if (result.stage === 'unavailable') toast({ title: 'Recording unavailable', description: result.reason || 'Audio could not be retrieved' });
    else toast({ title: 'Analyzed' });
    qc.invalidateQueries({ queryKey: ['pbx', 'pbx_call_records'] });
    setAnalyzing(null);
  };


  const playRecording = async (c: any) => {
    setPlayingId(c.id); setAudioUrl(null);
    try {
      const url = await loadPbxRecordingAudio(c, LEMTEL_ORG);
      setAudioUrl(url);
    } catch (e: any) {
      toast({ title: 'Playback failed', description: e?.message, variant: 'destructive' });
      setPlayingId(null); return;
    }
  };

  const openDiagnose = async () => {
    setDiagOpen(true);
    test.mutate();
    const { data } = await (supabase as any).from('pbx_sync_jobs')
      .select('*').eq('organization_id', LEMTEL_ORG).eq('job_type', 'sync-cdrs')
      .order('created_at', { ascending: false }).limit(1).maybeSingle();
    setLastJob(data);
  };

  const fetchRange = () => {
    sync.mutate({ kind: 'cdr', start_date: fromDate, end_date: toDate, extension: extFilter || undefined });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-3xl font-bold">Call History</h1><p className="text-muted-foreground">{cdrs.length} calls</p></div>
        {scope === 'org' && <Button onClick={() => sync.mutate('cdr')} disabled={sync.isPending} variant="outline">
          {sync.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
          Sync CDRs
        </Button>}
      </div>

      {audioUrl && (
        <Card className="p-3">
          <audio src={audioUrl} controls autoPlay onEnded={() => { setPlayingId(null); setAudioUrl(null); }} className="w-full" />
        </Card>
      )}

      {/* Date range fetcher */}
      {scope === 'org' && <Card className="p-3">
        <Button variant="ghost" size="sm" className="w-full justify-between" onClick={() => setRangeOpen(o => !o)}>
          <span>📅 Fetch CDRs by date range</span>
          {rangeOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </Button>
        {rangeOpen && (
          <div className="mt-3 grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
            <div><Label className="text-xs">From</Label><Input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} /></div>
            <div><Label className="text-xs">To</Label><Input type="date" value={toDate} onChange={e => setToDate(e.target.value)} /></div>
            <div><Label className="text-xs">Extension (optional)</Label><Input placeholder="All" value={extFilter} onChange={e => setExtFilter(e.target.value)} /></div>
            <Button onClick={fetchRange} disabled={sync.isPending}>
              {sync.isPending ? <Loader2 className="w-3 h-3 mr-2 animate-spin" /> : <Download className="w-3 h-3 mr-2" />}
              Fetch Records
            </Button>
          </div>
        )}
      </Card>}

      <Card className="overflow-hidden">
        {isLoading ? (
          <div className="p-4 space-y-2">{Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-10 bg-muted/40 rounded animate-pulse" />
          ))}</div>
        ) : cdrs.length === 0 ? (
          <div className="p-12 flex flex-col items-center text-center gap-4">
            <Phone className="w-16 h-16 text-muted-foreground" />
            <div>
              <div className="text-xl font-semibold">No call records yet</div>
              <p className="text-muted-foreground mt-1 max-w-md">
                Call history syncs automatically every 5 minutes from FusionPBX. First sync may take a moment.
              </p>
            </div>
            <div className="flex gap-2">
              <Button onClick={() => sync.mutate('cdr')} disabled={sync.isPending}>
                {sync.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
                Sync CDRs Now
              </Button>
              <Button variant="outline" onClick={openDiagnose}><Search className="w-4 h-4 mr-2" /> Diagnose Sync</Button>
            </div>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted text-xs uppercase text-muted-foreground">
              <tr>
                <th className="text-left p-3">Status</th>
                <th className="text-left p-3">Time</th>
                <th className="text-left p-3">From</th>
                <th className="text-left p-3">To</th>
                <th className="text-left p-3">Duration</th>
                <th className="text-left p-3">Recording</th>
                <th className="text-left p-3">AI</th>
              </tr>
            </thead>
            <tbody>
              {(cdrs as any[]).map((c: any) => (
                <tr key={c.id} className="border-t hover:bg-muted/30">
                  <td className="p-3">{statusBadge(c)}</td>
                  <td className="p-3">{c.start_at ? format(new Date(c.start_at), 'PP HH:mm') : '-'}</td>
                  <td className="p-3">{c.caller_number || '-'}</td>
                  <td className="p-3">{c.destination_number || c.destination || '-'}</td>
                  <td className="p-3">{Math.floor((c.duration_seconds || 0) / 60)}:{String((c.duration_seconds || 0) % 60).padStart(2, '0')}</td>
                  <td className="p-3">
                    {c.has_recording ? (
                      <Button size="sm" variant="ghost" disabled={playingId === c.id && !audioUrl} onClick={() => playRecording(c)}>
                        {playingId === c.id && !audioUrl ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
                      </Button>
                    ) : '-'}
                  </td>
                  <td className="p-3">
                    {(() => {
                      const live = stages[c.id];
                      const transcript = { provider: c.raw_data?.transcript_provider, transcript_text: c.raw_data?.transcript_text };
                      const stubT = isStubTranscript(transcript);
                      const stage: TranscriptStage = live?.stage
                        ?? (analyzing === c.id ? 'transcribing'
                          : c.analyzed && !stubT ? 'complete'
                          : c.transcribed && stubT ? 'unavailable'
                          : 'idle');
                      return (
                        <div className="flex items-center gap-2">
                          <TranscriptStagePill stage={stage} detail={live?.detail} compact />
                          {stage !== 'complete' && (
                            <Button size="sm" variant="ghost" onClick={() => analyze(c)} disabled={analyzing === c.id}>
                              {analyzing === c.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                            </Button>
                          )}
                        </div>
                      );
                    })()}
                  </td>

                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Dialog open={diagOpen} onOpenChange={setDiagOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>CDR Sync Diagnostics</DialogTitle></DialogHeader>
          <div className="space-y-3 text-sm">
            <div>
              <div className="font-semibold mb-1">Endpoint test</div>
              {test.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : test.data ? (
                <div className="space-y-1 font-mono text-xs">
                  <div>Endpoint: <span className={test.data.endpoint ? 'text-green-600' : 'text-red-600'}>{test.data.endpoint ?? 'none'}</span></div>
                  <div>Records: {test.data.record_count}</div>
                  {(test.data.attempts ?? []).map((a: any, i: number) => (
                    <div key={i} className="text-muted-foreground">{a.endpoint} → {a.status}{a.error ? ` (${a.error})` : ''}</div>
                  ))}
                </div>
              ) : <span className="text-muted-foreground">Click Diagnose to test</span>}
            </div>
            <div>
              <div className="font-semibold mb-1">Last sync-cdrs job</div>
              {lastJob ? (
                <div className="text-xs font-mono space-y-1">
                  <div>Status: {lastJob.status}</div>
                  <div>At: {lastJob.completed_at || lastJob.created_at}</div>
                  {lastJob.error && <div className="text-red-600 whitespace-pre-wrap">{lastJob.error}</div>}
                  {lastJob.stats && <div>Stats: {JSON.stringify(lastJob.stats)}</div>}
                </div>
              ) : <span className="text-muted-foreground">No jobs found</span>}
            </div>
            <div className="text-xs text-muted-foreground">
              {test.data && !test.data.endpoint && 'Suggested fix: Check FUSIONPBX_API_URL secret and that the CDR module is enabled.'}
              {lastJob?.error?.includes('AUTH') && 'Suggested fix: Re-check API key in Settings.'}
              {lastJob?.error?.includes('UNREACHABLE') && 'Suggested fix: Verify server connectivity.'}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
