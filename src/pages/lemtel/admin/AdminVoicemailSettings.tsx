import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Voicemail, RefreshCw, Loader2, Save } from 'lucide-react';
import { toast } from 'sonner';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import { AdminSkeletonRows, AdminEmptyState } from '@/components/admin/AdminSkeletonRows';

export default function AdminVoicemailSettings() {
  const [edits, setEdits] = useState<Record<string, any>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  const { data: rows = [], isLoading, refetch } = useQuery({
    queryKey: ['pbx-voicemail-settings-admin'],
    queryFn: async () => {
      const { data, error } = await supabase.from('pbx_voicemail_settings').select('user_id,greeting_type,greeting_storage_path,greeting_tts_text,transcription_enabled,notify_email,notify_sms,notify_push,attach_audio_email,notify_email_address,notify_sms_number,updated_at,greeting_voice_id,greeting_voice_name,ai_summary_enabled,greeting_audio_url,greeting_updated_at');
      if (error) throw error;
      return data || [];
    },
  });

  const key = (r: any) => r.user_id || r.id;
  const val = (r: any, k: string) => edits[key(r)]?.[k] ?? r[k];
  const setVal = (id: string, k: string, v: any) => setEdits(e => ({ ...e, [id]: { ...e[id], [k]: v } }));

  const save = async (r: any) => {
    const id = key(r);
    setSavingId(id);
    try {
      const q: any = supabase.from('pbx_voicemail_settings').update(edits[id] as any);
      const { error } = r.user_id ? await q.eq('user_id', r.user_id) : await q.eq('id', r.id);
      if (error) throw error;
      toast.success('Saved');
      setEdits(e => { const n = { ...e }; delete n[id]; return n; });
      refetch();
    } catch (e: any) { toast.error(e?.message || 'Save failed'); }
    finally { setSavingId(null); }
  };

  return (
    <div className="space-y-4 w-full min-w-0">
      <AdminPageHeader
        icon={Voicemail}
        title="Voicemail Settings"
        subtitle="Per-user voicemail PIN, email-to-vm, transcription, retention."
        actions={<Button variant="outline" onClick={() => refetch()}><RefreshCw className="w-4 h-4 mr-2" /> Refresh</Button>}
      />

      <Card>
        <CardHeader><CardTitle>{rows.length} configuration{rows.length === 1 ? '' : 's'}</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader><TableRow>
              <TableHead>User</TableHead>
              <TableHead>Email to VM</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Transcription</TableHead>
              <TableHead>Attach audio</TableHead>
              <TableHead>Delete after email</TableHead>
              <TableHead>Retention (days)</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {isLoading ? <AdminSkeletonRows rows={5} cols={8} /> :
                rows.length === 0 ? <TableRow><TableCell colSpan={8}><AdminEmptyState title="No voicemail settings" hint="No per-user voicemail policies set." /></TableCell></TableRow> :
                rows.map((r: any) => (
                  <TableRow key={key(r)} className="hover:bg-muted/40">
                    <TableCell className="font-mono text-xs">{(r.user_id || r.id || '').slice(0, 8)}…</TableCell>
                    <TableCell><Switch checked={!!val(r, 'email_enabled')} onCheckedChange={v => setVal(key(r), 'email_enabled', v)} /></TableCell>
                    <TableCell><Input className="w-48" value={val(r, 'email_address') || ''} onChange={e => setVal(key(r), 'email_address', e.target.value)} /></TableCell>
                    <TableCell><Switch checked={!!val(r, 'transcription_enabled')} onCheckedChange={v => setVal(key(r), 'transcription_enabled', v)} /></TableCell>
                    <TableCell><Switch checked={!!val(r, 'attach_audio')} onCheckedChange={v => setVal(key(r), 'attach_audio', v)} /></TableCell>
                    <TableCell><Switch checked={!!val(r, 'delete_after_email')} onCheckedChange={v => setVal(key(r), 'delete_after_email', v)} /></TableCell>
                    <TableCell><Input type="number" className="w-24" value={val(r, 'retention_days') ?? ''} onChange={e => setVal(key(r), 'retention_days', e.target.value ? parseInt(e.target.value) : null)} /></TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" disabled={!edits[key(r)] || savingId === key(r)} onClick={() => save(r)}>
                        {savingId === key(r) ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
