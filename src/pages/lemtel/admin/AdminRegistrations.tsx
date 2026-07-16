import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import { AdminSkeletonRows, AdminEmptyState } from '@/components/admin/AdminSkeletonRows';
import { StatusBadge } from '@/components/admin/StatusBadge';
import { Wifi, RefreshCw, Search } from 'lucide-react';
import { formatDistanceToNowStrict } from 'date-fns';

type Reg = {
  extension?: string;
  user?: string;
  contact?: string;
  agent?: string;
  user_agent?: string;
  hostname?: string;
  network_ip?: string;
  network_port?: string;
  expires?: string;
  status?: string;
  sip_profile?: string;
};

export default function AdminRegistrations() {
  const [q, setQ] = useState('');

  const { data, isLoading, refetch, dataUpdatedAt, isFetching } = useQuery({
    queryKey: ['fpbx', 'registrations-live'],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('fusionpbx-proxy', {
        body: { action: 'get-registrations-live' },
      });
      if (error) throw error;
      return {
        rows: ((data as any)?.data || []) as Reg[],
        count: (data as any)?.count ?? 0,
        registered: (data as any)?.registered ?? 0,
        cached: !!(data as any)?.cached,
      };
    },
    refetchInterval: 15000,
  });

  const rows = data?.rows || [];
  const filtered = useMemo(() => rows.filter(r =>
    !q || `${r.extension ?? ''} ${r.user ?? ''} ${r.contact ?? ''} ${r.agent ?? ''} ${r.user_agent ?? ''} ${r.network_ip ?? ''} ${r.hostname ?? ''}`.toLowerCase().includes(q.toLowerCase())
  ), [rows, q]);

  return (
    <div className="space-y-5 w-full min-w-0">
      <AdminPageHeader
        icon={Wifi}
        title="SIP Registrations"
        subtitle="Currently registered endpoints. Auto-refresh every 10s."
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
              {filtered.length} registration{filtered.length === 1 ? '' : 's'}
              {dataUpdatedAt ? (
                <span className="ml-3 text-xs text-muted-foreground font-normal">
                  updated {formatDistanceToNowStrict(new Date(dataUpdatedAt))} ago
                </span>
              ) : null}
            </CardTitle>
            <div className="relative w-72 max-w-full">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Search user, IP, agent…" className="pl-9" />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Profile</TableHead>
                <TableHead>Agent</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Network</TableHead>
                <TableHead>Expires</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? <AdminSkeletonRows rows={5} cols={7} /> :
                filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={7}>
                    <AdminEmptyState title="No registered endpoints" hint="Devices appear here when they register against the PBX." />
                  </TableCell></TableRow>
                ) : filtered.map((r, i) => (
                  <TableRow key={`${r.user}-${r.contact}-${i}`} className="hover:bg-muted/40 transition-colors">
                    <TableCell className="font-mono text-xs">{r.user || '—'}</TableCell>
                    <TableCell className="text-xs">{r.sip_profile || 'internal'}</TableCell>
                    <TableCell className="text-xs truncate max-w-[220px]">{r.agent || '—'}</TableCell>
                    <TableCell className="font-mono text-xs truncate max-w-[260px]">{r.contact || '—'}</TableCell>
                    <TableCell className="font-mono text-xs">{r.network_ip ? `${r.network_ip}${r.network_port ? ':' + r.network_port : ''}` : '—'}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{r.expires || '—'}</TableCell>
                    <TableCell><StatusBadge tone="on">{r.status || 'registered'}</StatusBadge></TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
