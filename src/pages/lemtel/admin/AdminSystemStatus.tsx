import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { pbxInvoke } from '@/lib/pbxInvoke';
import { useOrganization } from '@/context/OrganizationContext';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import { StatusBadge } from '@/components/admin/StatusBadge';
import { AdminSkeletonRows } from '@/components/admin/AdminSkeletonRows';
import { Activity, RefreshCw, RotateCw, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { formatDistanceToNowStrict } from 'date-fns';

type Profile = { name: string; type: string; url: string; state: string; calls: number };

export default function AdminSystemStatus() {
  const { selectedOrgId } = useOrganization();
  const [restarting, setRestarting] = useState<string | null>(null);

  const { data, isLoading, refetch, dataUpdatedAt, isFetching } = useQuery({
    queryKey: ['fpbx', 'system-status'],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('fusionpbx-proxy', {
        body: { action: 'system-status' },
      });
      if (error) throw error;
      return data?.data as {
        uptime: string | null;
        version: string | null;
        sessions: { active: number; peak: number; total: number; perSecond: number };
        sofia: Profile[];
      };
    },
    refetchInterval: 15000,
  });

  const jobs = useQuery({
    queryKey: ['pbx-sync-jobs-status'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('pbx_sync_jobs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(15);
      if (error) throw error;
      return data || [];
    },
    refetchInterval: 30000,
  });

  const restart = async (profile: string) => {
    if (!confirm(`Restart SIP profile "${profile}"? Active calls on this profile may drop.`)) return;
    setRestarting(profile);
    try {
      const { data, error } = await pbxInvoke('restart-sip-profile', { profile_name: profile }, { organizationId: selectedOrgId });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      toast.success(`Restarted ${profile}`);
      setTimeout(() => refetch(), 2000);
    } catch (e: any) {
      toast.error(e?.message || 'Restart failed');
    } finally {
      setRestarting(null);
    }
  };

  const stats = data?.sessions;

  return (
    <div className="space-y-5 w-full min-w-0">
      <AdminPageHeader
        icon={Activity}
        title="System Status"
        subtitle={data?.version ? `FreeSWITCH ${data.version}` : 'PBX runtime health.'}
        actions={
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`w-4 h-4 mr-2 ${isFetching ? 'animate-spin' : ''}`} /> Refresh
          </Button>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground font-normal">Uptime</CardTitle></CardHeader>
          <CardContent><div className="text-lg font-semibold truncate">{data?.uptime || '—'}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground font-normal">Active sessions</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">{stats?.active ?? '—'}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground font-normal">Peak</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">{stats?.peak ?? '—'}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground font-normal">Sessions / sec</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">{stats?.perSecond ?? '—'}</div></CardContent></Card>
      </div>

      <Card className="border-border/60 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">
            Sofia profiles
            {dataUpdatedAt ? (
              <span className="ml-3 text-xs text-muted-foreground font-normal">
                updated {formatDistanceToNowStrict(new Date(dataUpdatedAt))} ago
              </span>
            ) : null}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow>
              <TableHead>Profile</TableHead><TableHead>URL</TableHead>
              <TableHead>Calls</TableHead><TableHead>State</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {isLoading ? <AdminSkeletonRows rows={3} cols={5} /> :
                (data?.sofia || []).length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-6">No SIP profiles reported.</TableCell></TableRow>
                ) : data!.sofia.map(p => (
                  <TableRow key={p.name}>
                    <TableCell className="font-medium">{p.name}</TableCell>
                    <TableCell className="font-mono text-xs truncate max-w-[420px]">{p.url}</TableCell>
                    <TableCell>{p.calls}</TableCell>
                    <TableCell><StatusBadge tone={p.state === 'RUNNING' ? 'on' : 'err'}>{p.state}</StatusBadge></TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" onClick={() => restart(p.name)} disabled={restarting === p.name}>
                        {restarting === p.name ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCw className="w-3.5 h-3.5" />}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card className="border-border/60 shadow-sm">
        <CardHeader><CardTitle className="text-base">Recent sync jobs</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow>
              <TableHead>Job</TableHead><TableHead>Status</TableHead>
              <TableHead>Started</TableHead><TableHead>Error</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {(jobs.data || []).length === 0 ? (
                <TableRow><TableCell colSpan={4} className="text-center text-sm text-muted-foreground py-4">No recent jobs.</TableCell></TableRow>
              ) : jobs.data!.map((j: any) => (
                <TableRow key={j.id}>
                  <TableCell className="font-mono text-xs">{j.job_type}</TableCell>
                  <TableCell><StatusBadge tone={j.status === 'success' ? 'on' : j.status === 'failed' ? 'err' : 'info'}>{j.status}</StatusBadge></TableCell>
                  <TableCell className="text-xs text-muted-foreground">{j.started_at ? formatDistanceToNowStrict(new Date(j.started_at)) + ' ago' : '—'}</TableCell>
                  <TableCell className="text-xs text-destructive truncate max-w-[360px]">{j.error || ''}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
