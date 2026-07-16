import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { pbxInvoke } from '@/lib/pbxInvoke';
import { useOrganization } from '@/context/OrganizationContext';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import { AdminSkeletonRows, AdminEmptyState } from '@/components/admin/AdminSkeletonRows';
import { StatusBadge } from '@/components/admin/StatusBadge';
import { PhoneCall, RefreshCw, Search, PhoneOff, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { formatDistanceToNowStrict } from 'date-fns';

type Channel = {
  uuid: string;
  name?: string;
  cid_name?: string;
  cid_num?: string;
  dest?: string;
  application?: string;
  read_codec?: string;
  secure?: string;
  hostname?: string;
  created?: string;
  presence_id?: string;
  callstate?: string;
};

export default function AdminActiveCalls() {
  const { selectedOrgId } = useOrganization();
  const [q, setQ] = useState('');
  const [killing, setKilling] = useState<string | null>(null);

  const { data, isLoading, refetch, dataUpdatedAt, isFetching } = useQuery({
    queryKey: ['fpbx', 'active-calls'],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('fusionpbx-proxy', {
        body: { action: 'list-active-calls' },
      });
      if (error) throw error;
      return (data?.data || []) as Channel[];
    },
    refetchInterval: 5000,
  });

  const rows = data || [];
  const filtered = useMemo(() => rows.filter(c =>
    !q || `${c.cid_name ?? ''} ${c.cid_num ?? ''} ${c.dest ?? ''} ${c.uuid ?? ''} ${c.name ?? ''}`.toLowerCase().includes(q.toLowerCase())
  ), [rows, q]);

  const kill = async (uuid: string) => {
    if (!confirm(`Hang up call ${uuid.slice(0, 8)}…?`)) return;
    setKilling(uuid);
    try {
      const { data, error } = await pbxInvoke('kill-active-call', { uuid }, { organizationId: selectedOrgId });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      toast.success('Call ended');
      refetch();
    } catch (e: any) {
      toast.error(e?.message || 'Hang up failed');
    } finally {
      setKilling(null);
    }
  };

  return (
    <div className="space-y-5 w-full min-w-0">
      <AdminPageHeader
        icon={PhoneCall}
        title="Active Calls"
        subtitle="Live FreeSWITCH channels. Auto-refresh every 5s."
        actions={
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`w-4 h-4 mr-2 ${isFetching ? 'animate-spin' : ''}`} /> Refresh
          </Button>
        }
      />

      <Card className="border-border/60 shadow-sm">
        <CardHeader>
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <CardTitle className="text-base">
              {filtered.length} active call{filtered.length === 1 ? '' : 's'}
              {dataUpdatedAt ? (
                <span className="ml-3 text-xs text-muted-foreground font-normal">
                  updated {formatDistanceToNowStrict(new Date(dataUpdatedAt))} ago
                </span>
              ) : null}
            </CardTitle>
            <div className="relative w-72 max-w-full">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Search caller, destination…" className="pl-9" />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>UUID</TableHead>
                <TableHead>Caller</TableHead>
                <TableHead>Destination</TableHead>
                <TableHead>App</TableHead>
                <TableHead>Codec</TableHead>
                <TableHead>State</TableHead>
                <TableHead>Started</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? <AdminSkeletonRows rows={5} cols={8} /> :
                filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={8}>
                    <AdminEmptyState title="No active calls" hint="Live channels appear here in real time." />
                  </TableCell></TableRow>
                ) : filtered.map(c => (
                  <TableRow key={c.uuid} className="hover:bg-muted/40 transition-colors">
                    <TableCell className="font-mono text-xs">{c.uuid?.slice(0, 8)}…</TableCell>
                    <TableCell className="text-sm">
                      <div className="font-medium">{c.cid_name || '—'}</div>
                      <div className="font-mono text-xs text-muted-foreground">{c.cid_num || ''}</div>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{c.dest || '—'}</TableCell>
                    <TableCell className="text-xs">{c.application || '—'}</TableCell>
                    <TableCell className="text-xs">{c.read_codec || '—'}</TableCell>
                    <TableCell>
                      <StatusBadge tone={c.callstate === 'ACTIVE' ? 'on' : 'info'}>{c.callstate || 'ACTIVE'}</StatusBadge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {c.created ? formatDistanceToNowStrict(new Date(c.created)) + ' ago' : '—'}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" onClick={() => kill(c.uuid)} disabled={killing === c.uuid}>
                        {killing === c.uuid ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <PhoneOff className="w-3.5 h-3.5" />}
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
