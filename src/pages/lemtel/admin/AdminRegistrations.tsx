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
import { Wifi, RefreshCw, Search, PhoneForwarded, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
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
  const [repairing, setRepairing] = useState(false);

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

  // Group by extension/user to see multi-device ring readiness
  const perUser = useMemo(() => {
    const map = new Map<string, Reg[]>();
    for (const r of rows) {
      const key = String(r.user || r.extension || '').split('@')[0];
      if (!key) continue;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(r);
    }
    return Array.from(map.entries())
      .map(([user, regs]) => ({ user, regs, count: regs.length }))
      .sort((a, b) => b.count - a.count);
  }, [rows]);

  const configureFork = async () => {
    setRepairing(true);
    try {
      const { data, error } = await supabase.functions.invoke('fusionpbx-proxy', {
        body: { action: 'repair-all-extensions-verto' },
      });
      if (error) throw error;
      const fixed = (data as any)?.fixed ?? 0;
      const failed = (data as any)?.failed ?? 0;
      toast.success(`Multi-device ring activé — ${fixed} extension(s) mises à jour${failed ? `, ${failed} échec(s)` : ''}`);
      refetch();
    } catch (e: any) {
      toast.error(e?.message || 'Échec de la configuration');
    } finally {
      setRepairing(false);
    }
  };

  return (
    <div className="space-y-5 w-full min-w-0">
      <AdminPageHeader
        icon={Wifi}
        title="SIP Registrations"
        subtitle="Currently registered endpoints. Auto-refresh every 10s."
        actions={
          <div className="flex gap-2 flex-wrap">
            <Button variant="default" size="sm" onClick={configureFork} disabled={repairing}>
              {repairing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <PhoneForwarded className="w-4 h-4 mr-2" />}
              Activer sonnerie multi-appareils
            </Button>
            <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
              <RefreshCw className={`w-4 h-4 mr-2 ${isFetching ? 'animate-spin' : ''}`} /> Refresh
            </Button>
          </div>
        }
      />

      {perUser.length > 0 && (
        <Card className="border-border/60 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Appareils enregistrés par poste (fork simultané)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {perUser.map(({ user, count }) => (
                <div key={user} className={`px-3 py-1.5 rounded-md text-xs border ${count > 1 ? 'border-green-500/40 bg-green-500/10 text-green-700 dark:text-green-300' : 'border-border bg-muted/40'}`}>
                  <span className="font-mono font-semibold">{user}</span>
                  <span className="ml-2 opacity-70">{count} appareil{count > 1 ? 's' : ''}</span>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground mt-3">
              Les postes avec plusieurs appareils sonneront simultanément sur mobile + desktop. Si un poste n'a qu'un seul appareil, cliquez sur "Activer sonnerie multi-appareils" pour réparer la configuration.
            </p>
          </CardContent>
        </Card>
      )}

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
