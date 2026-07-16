import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Disc, RefreshCw, Loader2, Save } from 'lucide-react';
import { toast } from 'sonner';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import { AdminSkeletonRows, AdminEmptyState } from '@/components/admin/AdminSkeletonRows';

export default function AdminRecordingRules() {
  const [edits, setEdits] = useState<Record<string, any>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  const { data: rows = [], isLoading, refetch } = useQuery({
    queryKey: ['pbx-call-recording-rules'],
    queryFn: async () => {
      const { data, error } = await supabase.from('pbx_call_recording_rules').select('*');
      if (error) throw error;
      return data || [];
    },
  });

  const val = (r: any, k: string) => edits[r.user_id]?.[k] ?? r[k];
  const setVal = (id: string, k: string, v: any) => setEdits(e => ({ ...e, [id]: { ...e[id], [k]: v } }));

  const save = async (r: any) => {
    setSavingId(r.user_id);
    try {
      const { error } = await supabase.from('pbx_call_recording_rules').update(edits[r.user_id]).eq('user_id', r.user_id);
      if (error) throw error;
      toast.success('Saved');
      setEdits(e => { const n = { ...e }; delete n[r.user_id]; return n; });
      refetch();
    } catch (e: any) { toast.error(e?.message || 'Save failed'); }
    finally { setSavingId(null); }
  };

  return (
    <div className="space-y-4 w-full min-w-0">
      <AdminPageHeader
        icon={Disc}
        title="Recording Rules"
        subtitle="Per-user call recording policy and retention."
        actions={<Button variant="outline" onClick={() => refetch()}><RefreshCw className="w-4 h-4 mr-2" /> Refresh</Button>}
      />

      <Card>
        <CardHeader><CardTitle>{rows.length} rule{rows.length === 1 ? '' : 's'}</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow>
              <TableHead>User</TableHead><TableHead>All</TableHead><TableHead>Inbound</TableHead>
              <TableHead>Outbound</TableHead><TableHead>Announce</TableHead>
              <TableHead>Retention (days)</TableHead><TableHead className="text-right">Action</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {isLoading ? <AdminSkeletonRows rows={5} cols={7} /> :
                rows.length === 0 ? <TableRow><TableCell colSpan={7}><AdminEmptyState title="No recording rules" hint="No per-user recording rules configured." /></TableCell></TableRow> :
                rows.map((r: any) => (
                  <TableRow key={r.user_id} className="hover:bg-muted/40">
                    <TableCell className="font-mono text-xs">{r.user_id.slice(0, 8)}…</TableCell>
                    <TableCell><Switch checked={!!val(r, 'record_all')} onCheckedChange={v => setVal(r.user_id, 'record_all', v)} /></TableCell>
                    <TableCell><Switch checked={!!val(r, 'record_inbound')} onCheckedChange={v => setVal(r.user_id, 'record_inbound', v)} /></TableCell>
                    <TableCell><Switch checked={!!val(r, 'record_outbound')} onCheckedChange={v => setVal(r.user_id, 'record_outbound', v)} /></TableCell>
                    <TableCell><Switch checked={!!val(r, 'announce')} onCheckedChange={v => setVal(r.user_id, 'announce', v)} /></TableCell>
                    <TableCell><Input type="number" className="w-24" value={val(r, 'retention_days') ?? ''} onChange={e => setVal(r.user_id, 'retention_days', e.target.value ? parseInt(e.target.value) : null)} /></TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" disabled={!edits[r.user_id] || savingId === r.user_id} onClick={() => save(r)}>
                        {savingId === r.user_id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
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
