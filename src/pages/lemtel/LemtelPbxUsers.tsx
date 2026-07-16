import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Users, RefreshCw, ShieldCheck, ShieldOff, Link as LinkIcon } from 'lucide-react';
import { usePbxDomainUsers, LEMTEL_ORG } from '@/hooks/usePbxData';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import { Link } from 'react-router-dom';

export default function LemtelPbxUsers() {
  const { data: users = [], isLoading, refetch } = usePbxDomainUsers();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [syncing, setSyncing] = useState(false);
  const [search, setSearch] = useState('');
  const all = users as any[];

  const runSync = async () => {
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke('fusionpbx-proxy', {
        body: { action: 'sync-users', organization_id: LEMTEL_ORG },
      });
      if (error) throw error;
      toast({ title: 'Sync complete', description: `Fetched ${(data as any)?.fetched ?? 0}, upserted ${(data as any)?.upserted ?? 0}` });
      queryClient.invalidateQueries({ queryKey: ['pbx'] });
      refetch();
    } catch (e: any) {
      toast({ title: 'Sync failed', description: e?.message || String(e), variant: 'destructive' });
    } finally { setSyncing(false); }
  };

  useEffect(() => {
    if (!isLoading && all.length === 0 && !syncing) {
      runSync();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, all.length]);

  const lastSync = useMemo(() => {
    const ds = all.map(u => u.last_synced_at).filter(Boolean).sort().reverse();
    return ds[0] ? formatDistanceToNow(new Date(ds[0]), { addSuffix: true }) : null;
  }, [all]);

  const rows = all.filter(u => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (u.username || '').toLowerCase().includes(s)
      || (u.email || '').toLowerCase().includes(s)
      || (u.user_status || '').toLowerCase().includes(s);
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2"><Users className="w-7 h-7" /> PBX Users</h1>
          <p className="text-muted-foreground">
            Domain administrators and operators synced from FusionPBX. Last sync {lastSync ?? 'never'}.
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline"><Link to="/org/lemtel/admin/extensions">Extensions</Link></Button>
          <Button onClick={runSync} disabled={syncing}>
            <RefreshCw className={`w-4 h-4 mr-2 ${syncing ? 'animate-spin' : ''}`} /> Resync from PBX
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader><CardTitle>{rows.length} users</CardTitle></CardHeader>
        <CardContent>
          <Input className="mb-4 max-w-sm" placeholder="Search username, email..." value={search} onChange={e => setSearch(e.target.value)} />
          {isLoading ? (
            <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-10 bg-muted/40 rounded animate-pulse" />
            ))}</div>
          ) : rows.length === 0 ? (
            <div className="py-10 text-center text-muted-foreground text-sm">
              No PBX users yet. Click <strong>Resync from PBX</strong> to pull them from FusionPBX.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Username</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Groups</TableHead>
                  <TableHead>Enabled</TableHead>
                  <TableHead>Last login</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((u: any) => (
                  <TableRow key={u.id}>
                    <TableCell className="font-medium">{u.username}</TableCell>
                    <TableCell>{u.email || <span className="text-muted-foreground">—</span>}</TableCell>
                    <TableCell><Badge variant="secondary">{u.user_status || 'active'}</Badge></TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {(Array.isArray(u.groups) ? u.groups : []).slice(0, 4).map((g: any, i: number) => (
                          <Badge key={i} variant="outline" className="text-xs">{typeof g === 'string' ? g : g?.group_name || g?.name || 'group'}</Badge>
                        ))}
                        {(!u.groups || u.groups.length === 0) && <span className="text-muted-foreground text-xs">—</span>}
                      </div>
                    </TableCell>
                    <TableCell>
                      {u.user_enabled
                        ? <span className="inline-flex items-center gap-1 text-green-600 text-sm"><ShieldCheck className="w-4 h-4" /> Enabled</span>
                        : <span className="inline-flex items-center gap-1 text-muted-foreground text-sm"><ShieldOff className="w-4 h-4" /> Disabled</span>}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {u.last_login_at ? formatDistanceToNow(new Date(u.last_login_at), { addSuffix: true }) : '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
