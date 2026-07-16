import { useEffect, useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { supabase } from '@/integrations/supabase/client';
import { RecordingWavePlayer } from '@/components/portal/RecordingWavePlayer';
import { Download, RefreshCw, ChevronDown, Trash2, FileDown, FileText, Sparkles, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { loadPbxRecordingAudio } from '@/lib/pbxRecordingAudio';
import { useLemtelAiRealtime } from '@/hooks/useLemtelAiRealtime';
import { usePbxAutoSync } from '@/hooks/usePbxAutoSync';

const LEMTEL_ORG_ID = '71755d33-ed64-4ad5-a828-61c9d2029eb7';
const PAGE_SIZE = 100;

type Rec = {
  id: string; start_at: string; duration_seconds: number | null;
  caller_name: string | null; caller_number: string | null;
  destination: string | null; destination_number: string | null;
  extension: string | null; direction: string | null;
  recording_path: string | null; recording_name: string | null;
  has_recording: boolean | null;
  pbx_uuid: string | null; domain_uuid: string | null; domain_name: string | null;
  recording_id?: string | null;
  transcribed?: boolean | null; analyzed?: boolean | null;
  sentiment?: string | null; summary?: string | null;
};

type RecMeta = {
  recording_id: string;
  transcript: string | null;
  summary: string | null;
  sentiment: string | null;
  language: string | null;
  transcript_status: string | null;
  summary_status: string | null;
};

export default function AdminRecordings({ scope = 'org' }: { scope?: 'org' | 'mine' }) {
  // Pull latest recordings + CDRs from FusionPBX on mount so the grid is live.
  usePbxAutoSync(['recordings', 'cdrs'], { orgId: LEMTEL_ORG_ID });
  const [rows, setRows] = useState<Rec[]>([]);
  const [q, setQ] = useState('');
  const [direction, setDirection] = useState<string>('all');
  const [fromDate, setFromDate] = useState<string>('');
  const [toDate, setToDate] = useState<string>('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [loadingRow, setLoadingRow] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [total, setTotal] = useState<number | null>(null);
  const [metaById, setMetaById] = useState<Record<string, RecMeta>>({});
  const [aiBusy, setAiBusy] = useState<string | null>(null);
  const [transcribeLang, setTranscribeLang] = useState<'fr' | 'en'>(() => {
    try { return (localStorage.getItem('lemtel.transcribe.lang') as 'fr' | 'en') || 'fr'; } catch { return 'fr'; }
  });
  useEffect(() => { try { localStorage.setItem('lemtel.transcribe.lang', transcribeLang); } catch {} }, [transcribeLang]);
  const loadPage = useCallback(async (pageNum: number, reset = false) => {
    setLoading(true);
    try {
      const from = pageNum * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      let query = (supabase as any).from('pbx_call_records')
        .select('id,start_at,duration_seconds,caller_name,caller_number,destination,destination_number,extension,direction,recording_path,recording_name,has_recording,pbx_uuid,domain_uuid,domain_name,recording_id,transcribed,analyzed,sentiment,summary:ai_summary', { count: 'exact' })
        .eq('organization_id', LEMTEL_ORG_ID)
        .eq('has_recording', true)
        .order('start_at', { ascending: false })
        .range(from, to);
      if (direction !== 'all') query = query.eq('direction', direction);
      if (fromDate) query = query.gte('start_at', new Date(fromDate).toISOString());
      if (toDate) {
        const end = new Date(toDate); end.setDate(end.getDate() + 1);
        query = query.lt('start_at', end.toISOString());
      }
      if (scope === 'mine') {
        const { data: auth } = await supabase.auth.getUser();
        const { data: spu } = await (supabase as any).from('pbx_softphone_users')
          .select('extension').eq('portal_user_id', auth.user?.id).maybeSingle();
        if (!spu?.extension) {
          setRows([]); setTotal(0); setHasMore(false); setPage(pageNum);
          return;
        }
        query = query.eq('extension', spu.extension);
      }
      const { data, count, error } = await query;
      if (error) throw error;
      const newRows = (data ?? []) as Rec[];
      setRows(prev => reset ? newRows : [...prev, ...newRows]);
      setTotal(count ?? null);
      setHasMore(newRows.length === PAGE_SIZE);
      setPage(pageNum);
    } catch (e: any) {
      toast.error('Failed to load: ' + (e?.message || 'unknown'));
    } finally {
      setLoading(false);
    }
  }, [scope, direction, fromDate, toDate]);

  const reloadCurrentPage = useCallback(() => { loadPage(0, true); }, [loadPage]);
  useLemtelAiRealtime(LEMTEL_ORG_ID, reloadCurrentPage);

  useEffect(() => { loadPage(0, true); }, [loadPage]);

  const syncFromPbx = async () => {
    setSyncing(true);
    try {
      toast.info('Backfilling recordings from PBX… this can take a minute.');
      const { data, error } = await (supabase as any).functions.invoke('fusionpbx-proxy', {
        body: { action: 'backfill-cdrs', organization_id: LEMTEL_ORG_ID, page_size: 500, max_pages: 50 },
      });
      if (error) throw error;
      toast.success(`Synced ${data?.stats?.cdrs ?? 0} CDR rows (${data?.stats?.pages ?? 0} pages).`);
      await loadPage(0, true);
    } catch (e: any) {
      toast.error('Sync failed: ' + (e?.message || 'unknown'));
    } finally {
      setSyncing(false);
    }
  };

  const fetchRecording = async (r: Rec): Promise<string | null> => {
    if (urls[r.id]) return urls[r.id];
    if (!r.pbx_uuid && !(r.recording_path && r.recording_name)) {
      toast.error('Missing recording metadata');
      return null;
    }
    setLoadingRow(r.id);
    try {
      const url = await loadPbxRecordingAudio(r, LEMTEL_ORG_ID);
      setUrls(s => ({ ...s, [r.id]: url }));
      return url;
    } catch (e: any) {
      toast.error('Could not load recording: ' + (e?.message || 'unknown'));
      return null;
    } finally {
      setLoadingRow(null);
    }
  };

  const deleteRecording = async (r: Rec) => {
    setDeleting(r.id);
    try {
      const { error } = await (supabase as any).functions.invoke('pbx-write', {
        body: {
          organizationId: LEMTEL_ORG_ID,
          action: 'delete-recording',
          params: {
            call_recording_uuid: r.pbx_uuid,
            record_path: r.recording_path,
            record_name: r.recording_name,
          },
          objectType: 'recording',
          objectPbxUuid: r.pbx_uuid,
        },
      });
      if (error) throw error;
      // clear has_recording locally so it disappears
      await (supabase as any).from('pbx_call_records')
        .update({ has_recording: false, recording_path: null, recording_name: null })
        .eq('id', r.id);
      setRows(prev => prev.filter(x => x.id !== r.id));
      toast.success('Recording deleted.');
    } catch (e: any) {
      toast.error('Delete failed: ' + (e?.message || 'unknown'));
    } finally {
      setDeleting(null);
    }
  };

  // Ensure a pbx_call_recordings row exists for this CDR; returns its id.
  const ensureRecordingRow = async (r: Rec): Promise<string | null> => {
    if (r.recording_id) return r.recording_id;
    if (!r.pbx_uuid && !(r.recording_path && r.recording_name)) {
      toast.error('Missing recording UUID — this CDR has no recording metadata on the PBX.');
      return null;
    }
    let existing: any = null;
    if (r.pbx_uuid) {
      const res = await (supabase as any).from('pbx_call_recordings')
        .select('id').eq('organization_id', LEMTEL_ORG_ID).eq('pbx_uuid', r.pbx_uuid).maybeSingle();
      existing = res.data;
    }
    if (existing?.id) return existing.id;
    const { data: ins, error } = await (supabase as any).from('pbx_call_recordings').insert({
      organization_id: LEMTEL_ORG_ID, pbx_uuid: r.pbx_uuid, call_record_id: r.id,
      recording_name: r.recording_name, recording_path: r.recording_path,
      recording_seconds: r.duration_seconds, available: true,
    }).select('id').maybeSingle();
    if (error) { toast.error('Cannot prepare recording row: ' + error.message); return null; }
    return ins?.id ?? null;
  };

  const loadMeta = async (r: Rec) => {
    const recId = await ensureRecordingRow(r);
    if (!recId) return;
    const [{ data: rec }, { data: tr }, { data: insight }] = await Promise.all([
      (supabase as any).from('pbx_call_recordings')
        .select('summary,sentiment,language,transcript_status,summary_status').eq('id', recId).maybeSingle(),
      (supabase as any).from('pbx_call_transcripts')
        .select('transcript_text,language').eq('call_record_id', r.id).maybeSingle(),
      (supabase as any).from('pbx_ai_insights')
        .select('summary,sentiment').eq('call_record_id', r.id).maybeSingle(),
    ]);
    setMetaById(s => ({ ...s, [r.id]: {
      recording_id: recId,
      transcript: tr?.transcript_text ?? null,
      summary: insight?.summary ?? rec?.summary ?? null,
      sentiment: insight?.sentiment ?? rec?.sentiment ?? null,
      language: rec?.language ?? tr?.language ?? null,
      transcript_status: rec?.transcript_status ?? null,
      summary_status: rec?.summary_status ?? null,
    }}));
  };

  const transcribe = async (r: Rec) => {
    const recId = await ensureRecordingRow(r);
    if (!recId) return;
    setAiBusy(r.id);
    try {
      const { data: existing } = await (supabase as any).from('pbx_call_transcripts')
        .select('transcript_text,provider').eq('call_record_id', r.id).maybeSingle();
      if (existing?.transcript_text && !String(existing.provider || '').startsWith('stub')) {
        toast.success('Transcript already exists — reused cached voice-to-text');
        await loadMeta(r);
        setRows(prev => prev.map(x => x.id === r.id ? { ...x, transcribed: true } : x));
        return;
      }
      const { data, error } = await supabase.functions.invoke('ai-transcribe-call', {
        body: { organization_id: LEMTEL_ORG_ID, call_record_id: r.id, language: transcribeLang },
      });
      if (error || (data as any)?.error) throw new Error((data as any)?.message || error?.message || 'failed');
      toast.success('Transcript ready');
      await loadMeta(r);
      setRows(prev => prev.map(x => x.id === r.id ? { ...x, transcribed: true } : x));
    } catch (e: any) {
      toast.error('Transcription failed: ' + (e?.message || 'unknown'));
    } finally { setAiBusy(null); }
  };

  const analyze = async (r: Rec) => {
    const recId = await ensureRecordingRow(r);
    if (!recId) return;
    setAiBusy(r.id);
    try {
      const { data: existing } = await (supabase as any).from('pbx_ai_insights')
        .select('summary,sentiment').eq('call_record_id', r.id).maybeSingle();
      if (existing?.summary) {
        toast.success('AI insights already exist — reused cached analysis');
        await loadMeta(r);
        setRows(prev => prev.map(x => x.id === r.id ? { ...x, analyzed: true, sentiment: existing.sentiment ?? x.sentiment, summary: existing.summary ?? x.summary } : x));
        return;
      }
      const { data, error } = await supabase.functions.invoke('process-call-recording', {
        body: { callId: r.id, force: false },
      });
      if (error || (data as any)?.error) throw new Error((data as any)?.message || error?.message || 'failed');
      toast.success('AI insights ready');
      await loadMeta(r);
      setRows(prev => prev.map(x => x.id === r.id ? { ...x, analyzed: true, sentiment: (data as any)?.sentiment ?? x.sentiment, summary: (data as any)?.summary ?? x.summary } : x));
    } catch (e: any) {
      toast.error('Analysis failed: ' + (e?.message || 'unknown'));
    } finally { setAiBusy(null); }
  };



  const exportCsv = () => {
    const headers = ['date','direction','extension','caller_name','caller_number','destination','duration_seconds'];
    const csv = [headers.join(',')].concat(
      filtered.map(r => [
        r.start_at,
        r.direction ?? '',
        r.extension ?? '',
        (r.caller_name ?? '').replace(/,/g, ' '),
        r.caller_number ?? '',
        r.destination_number ?? r.destination ?? '',
        r.duration_seconds ?? 0,
      ].join(','))
    ).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `recordings-${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const filtered = rows.filter(r =>
    !q || `${r.caller_name ?? ''} ${r.caller_number ?? ''} ${r.destination_number ?? ''} ${r.destination ?? ''} ${r.extension ?? ''}`
      .toLowerCase().includes(q.toLowerCase())
  );

  const fmtDur = (s: number | null) => {
    const n = s ?? 0;
    const h = Math.floor(n / 3600), m = Math.floor((n % 3600) / 60), sec = n % 60;
    return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  };

  return (
    <div className="space-y-4 w-full min-w-0">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-bold">{scope === 'mine' ? 'My Recordings' : 'Call Recordings'}</h1>
        <div className="flex items-center gap-2 flex-wrap">
          <Input placeholder="Search caller, number, extension…" value={q} onChange={e => setQ(e.target.value)} className="max-w-xs" />
          <Select value={direction} onValueChange={setDirection}>
            <SelectTrigger className="w-[130px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All directions</SelectItem>
              <SelectItem value="inbound">Inbound</SelectItem>
              <SelectItem value="outbound">Outbound</SelectItem>
              <SelectItem value="local">Local</SelectItem>
            </SelectContent>
          </Select>
          <Input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} className="w-[150px]" />
          <Input type="date" value={toDate} onChange={e => setToDate(e.target.value)} className="w-[150px]" />
          <Select value={transcribeLang} onValueChange={(v) => setTranscribeLang(v as 'fr' | 'en')}>
            <SelectTrigger className="w-[140px]" title="Transcription language for coaching/transcripts">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="fr">🇫🇷 Français</SelectItem>
              <SelectItem value="en">🇬🇧 English</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={exportCsv} disabled={filtered.length === 0}>
            <FileDown className="h-4 w-4 mr-2" />CSV
          </Button>
          {scope === 'org' && (
            <Button variant="outline" size="sm" disabled={syncing} onClick={syncFromPbx}>
              <RefreshCw className={`h-4 w-4 mr-2 ${syncing ? 'animate-spin' : ''}`} />
              {syncing ? 'Syncing…' : 'Sync from PBX'}
            </Button>
          )}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>
            {filtered.length} shown {total !== null ? `· ${total} total` : ''}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {filtered.length === 0 && !loading && (
            <p className="text-sm text-muted-foreground">
              {scope === 'mine'
                ? 'No recordings found for your extension yet. Recordings appear here once your calls are recorded by the PBX.'
                : 'No recordings yet. Click "Sync from PBX" to pull historical data.'}
            </p>
          )}
          {filtered.map(r => (
            <div key={r.id} className="border rounded-lg p-3 space-y-2">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="text-sm min-w-0">
                  <div className="font-medium truncate">
                    {r.caller_name ? `${r.caller_name} · ` : ''}{r.caller_number ?? '—'} → {r.destination_number ?? r.destination ?? '—'}
                  </div>
                  <div className="text-muted-foreground text-xs">
                    Ext {r.extension ?? '—'} · {fmtDur(r.duration_seconds)} · {format(new Date(r.start_at), 'dd MMM yyyy hh:mm:ss a')} · {r.direction ?? '—'}
                  </div>
                </div>
                <div className="flex gap-2 flex-wrap">
                  <Badge variant="outline">{r.recording_name?.split('.').pop() ?? 'wav'}</Badge>
                  {r.sentiment && (
                    <Badge variant="outline" className={
                      r.sentiment === 'positive' ? 'bg-green-500/15 text-green-600 border-green-500/30' :
                      r.sentiment === 'negative' ? 'bg-red-500/15 text-red-600 border-red-500/30' :
                      'bg-blue-500/15 text-blue-600 border-blue-500/30'
                    }>{r.sentiment}</Badge>
                  )}
                  {r.transcribed && <Badge variant="outline" className="bg-purple-500/15 text-purple-600 border-purple-500/30">Transcribed</Badge>}
                  <Button size="sm" variant="outline" disabled={loadingRow === r.id} onClick={async () => {
                    const u = await fetchRecording(r);
                    if (u) { setExpandedId(expandedId === r.id ? null : r.id); if (!metaById[r.id]) loadMeta(r); }
                  }}>{loadingRow === r.id ? 'Loading…' : expandedId === r.id ? 'Hide' : 'Play'}</Button>
                  <Button size="sm" variant="outline" disabled={aiBusy === r.id}
                    onClick={() => transcribe(r)}>
                    {aiBusy === r.id ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <FileText className="h-4 w-4 mr-1" />}
                    {r.transcribed ? 'Re-transcribe' : 'Transcribe'}
                  </Button>
                  <Button size="sm" variant="outline" disabled={aiBusy === r.id}
                    onClick={() => analyze(r)}>
                    {aiBusy === r.id ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Sparkles className="h-4 w-4 mr-1" />}
                    {r.analyzed ? 'Re-analyze' : 'AI Insights'}
                  </Button>
                  {urls[r.id] && (
                    <Button size="icon" variant="outline" asChild>
                      <a href={urls[r.id]} download={r.recording_name ?? `${r.id}.wav`}><Download className="h-4 w-4" /></a>
                    </Button>
                  )}
                  {scope === 'org' && (
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button size="icon" variant="outline" disabled={deleting === r.id}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete this recording?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This will permanently remove the recording from the PBX server. The CDR row stays.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={() => deleteRecording(r)}>Delete</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  )}
                </div>
              </div>
              {expandedId === r.id && urls[r.id] && <RecordingWavePlayer url={urls[r.id]} />}
              {(metaById[r.id]?.summary || r.summary || metaById[r.id]?.transcript) && (
                <div className="rounded-md border bg-muted/20 p-3 space-y-2 text-sm">
                  {(metaById[r.id]?.summary || r.summary) && (
                    <div>
                      <div className="font-semibold flex items-center gap-1"><Sparkles className="h-3.5 w-3.5" /> Summary{metaById[r.id]?.language ? ` · ${metaById[r.id].language}` : ''}</div>
                      <div className="text-muted-foreground whitespace-pre-wrap">{metaById[r.id]?.summary || r.summary}</div>
                    </div>
                  )}
                  {metaById[r.id]?.transcript && (
                    <details>
                      <summary className="cursor-pointer text-xs font-semibold">Transcript</summary>
                      <div className="text-xs text-muted-foreground whitespace-pre-wrap mt-1 max-h-64 overflow-y-auto">{metaById[r.id].transcript}</div>
                    </details>
                  )}
                </div>
              )}
            </div>
          ))}
          {hasMore && !q && (
            <div className="flex justify-center pt-2">
              <Button variant="ghost" disabled={loading} onClick={() => loadPage(page + 1, false)}>
                <ChevronDown className="h-4 w-4 mr-2" />
                {loading ? 'Loading…' : `Load more (${PAGE_SIZE})`}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
