import { useEffect, useState, useCallback, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { loadPbxRecordingAudio } from '@/lib/pbxRecordingAudio';
import { Trash2, PhoneCall, RefreshCw, Play, Download, Eye, EyeOff, Search } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';

const LEMTEL_ORG_ID = '71755d33-ed64-4ad5-a828-61c9d2029eb7';
const PAGE_SIZE = 50;

type VM = {
  id: string;
  extension: string | null;
  caller_number: string | null;
  caller_name: string | null;
  duration_seconds: number | null;
  transcript: string | null;
  read_at: string | null;
  received_at: string;
  pbx_record_path: string | null;
  pbx_record_name: string | null;
  audio_storage_path: string | null;
  fusionpbx_uuid: string | null;
  folder: string;
};

export default function AdminVoicemail({ scope = 'org' }: { scope?: 'org' | 'mine' }) {
  const [rows, setRows] = useState<VM[]>([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState('');
  const [audioUrls, setAudioUrls] = useState<Record<string, string>>({});
  const [loadingAudio, setLoadingAudio] = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    setLoading(true);
    const from = page * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;
    let q = (supabase as any).from('pbx_voicemails')
      .select(
        'id,extension,caller_number,caller_name,duration_seconds,transcript,read_at,received_at,pbx_record_path,pbx_record_name,audio_storage_path,fusionpbx_uuid,folder',
        { count: 'exact' },
      )
      .eq('organization_id', LEMTEL_ORG_ID)
      .neq('folder', 'trash')
      .order('received_at', { ascending: false })
      .range(from, to);

    if (scope === 'mine') {
      const { data: auth } = await supabase.auth.getUser();
      const { data: spu } = await (supabase as any).from('pbx_softphone_users')
        .select('extension').eq('portal_user_id', auth.user?.id).maybeSingle();
      if (spu?.extension) q = q.eq('extension', spu.extension);
    }
    if (search.trim()) {
      const s = `%${search.trim()}%`;
      q = q.or(`caller_number.ilike.${s},caller_name.ilike.${s},extension.ilike.${s}`);
    }

    const { data, count: c } = await q;
    setRows((data ?? []) as VM[]);
    setCount(c ?? 0);
    setLoading(false);
  }, [page, scope, search]);

  useEffect(() => { load(); }, [load]);

  const syncFromPbx = async () => {
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke('fusionpbx-proxy', {
        body: { action: 'sync-voicemail-messages', organization_id: LEMTEL_ORG_ID, params: {} },
      });
      if (error) throw error;
      toast.success(`Synced ${(data as any)?.voicemails ?? 0} voicemails from PBX`);
      setPage(0);
      await load();
    } catch (e: any) {
      toast.error(e?.message || 'Sync failed');
    } finally {
      setSyncing(false);
    }
  };

  const markRead = async (id: string, read: boolean) => {
    if (read) {
      await (supabase as any).from('pbx_voicemails').update({ read_at: null }).eq('id', id);
    } else {
      await supabase.rpc('mark_voicemail_read', { _id: id });
    }
    load();
  };

  const remove = async (vm: VM) => {
    if (!confirm('Delete this voicemail from the PBX?')) return;
    try {
      if (vm.fusionpbx_uuid) {
        await supabase.functions.invoke('pbx-write', {
          body: {
            organizationId: LEMTEL_ORG_ID,
            action: 'delete-voicemail',
            params: { voicemail_message_uuid: vm.fusionpbx_uuid },
            objectType: 'voicemail',
            objectPbxUuid: vm.fusionpbx_uuid,
          },
        });
      }
      await (supabase as any).from('pbx_voicemails')
        .update({ folder: 'trash', deleted_at: new Date().toISOString() })
        .eq('id', vm.id);
      toast.success('Voicemail deleted');
      load();
    } catch (e: any) {
      toast.error(e?.message || 'Delete failed');
    }
  };

  const play = async (vm: VM) => {
    if (audioUrls[vm.id]) return;
    setLoadingAudio((s) => ({ ...s, [vm.id]: true }));
    try {
      // Prefer Storage path if downloaded; else stream via fusionpbx-proxy get-recording
      if (vm.audio_storage_path) {
        const { data } = await supabase.storage.from('voicemail-audio')
          .createSignedUrl(vm.audio_storage_path, 3600);
        if (data?.signedUrl) {
          setAudioUrls((u) => ({ ...u, [vm.id]: data.signedUrl }));
          markRead(vm.id, false);
          return;
        }
      }
      const url = await loadPbxRecordingAudio({
        pbx_uuid: vm.fusionpbx_uuid,
        record_path: vm.pbx_record_path,
        record_name: vm.pbx_record_name,
        organization_id: LEMTEL_ORG_ID,
      }, LEMTEL_ORG_ID);
      setAudioUrls((u) => ({ ...u, [vm.id]: url }));
      markRead(vm.id, false);
    } catch (e: any) {
      toast.error(e?.message || 'Could not load voicemail audio');
    } finally {
      setLoadingAudio((s) => ({ ...s, [vm.id]: false }));
    }
  };

  const totalPages = Math.max(1, Math.ceil(count / PAGE_SIZE));
  const unread = useMemo(() => rows.filter((r) => !r.read_at).length, [rows]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">{scope === 'mine' ? 'My Voicemail' : 'Voicemail Management'}</h1>
          <p className="text-sm text-muted-foreground">
            {count} total · {unread} unread on this page
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-8 w-64"
              placeholder="Search caller, extension…"
              value={search}
              onChange={(e) => { setPage(0); setSearch(e.target.value); }}
            />
          </div>
          <Button variant="outline" onClick={syncFromPbx} disabled={syncing}>
            <RefreshCw className={`h-4 w-4 mr-2 ${syncing ? 'animate-spin' : ''}`} />
            Sync from PBX
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Messages</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {loading && <p className="text-sm text-muted-foreground">Loading…</p>}
          {!loading && rows.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No voicemails. Click "Sync from PBX" to pull historical messages.
            </p>
          )}
          {rows.map((v) => (
            <div key={v.id} className={`border rounded p-3 space-y-2 ${!v.read_at ? 'bg-muted/40' : ''}`}>
              <div className="flex justify-between flex-wrap gap-2 text-sm">
                <div className="flex items-center gap-2">
                  <Badge variant="outline">Ext {v.extension}</Badge>
                  <strong>{v.caller_name || v.caller_number || 'Unknown'}</strong>
                  {v.caller_name && v.caller_number && (
                    <span className="text-muted-foreground">{v.caller_number}</span>
                  )}
                  <span className="text-muted-foreground">
                    · {Math.round(v.duration_seconds ?? 0)}s · {formatDistanceToNow(new Date(v.received_at), { addSuffix: true })}
                  </span>
                  {!v.read_at && <Badge>New</Badge>}
                </div>
                <div className="flex gap-1">
                  <Button size="sm" variant="outline" onClick={() => play(v)} disabled={!!loadingAudio[v.id]}>
                    {loadingAudio[v.id]
                      ? <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                      : <Play className="h-3.5 w-3.5" />}
                  </Button>
                  {audioUrls[v.id] && (
                    <Button size="sm" variant="outline" asChild>
                      <a href={audioUrls[v.id]} download={`voicemail-${v.id}.wav`}>
                        <Download className="h-3.5 w-3.5" />
                      </a>
                    </Button>
                  )}
                  <Button size="sm" variant="outline" onClick={() => markRead(v.id, !!v.read_at)}>
                    {v.read_at ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  </Button>
                  {v.caller_number && (
                    <Button size="sm" variant="outline" title="Call back">
                      <PhoneCall className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  <Button size="sm" variant="outline" onClick={() => remove(v)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
              {audioUrls[v.id] && <audio controls src={audioUrls[v.id]} className="w-full h-10" />}
              {v.transcript && <p className="text-xs text-muted-foreground italic">"{v.transcript}"</p>}
            </div>
          ))}

          {count > PAGE_SIZE && (
            <div className="flex items-center justify-between pt-2">
              <span className="text-xs text-muted-foreground">Page {page + 1} / {totalPages}</span>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Prev</Button>
                <Button size="sm" variant="outline" disabled={page + 1 >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
