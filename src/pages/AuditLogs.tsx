import { useMemo, useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { PortalPageHeader } from '@/components/portal/PortalPageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollText, RefreshCw, Search, ChevronLeft, ChevronRight } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from '@/context/OrganizationContext';
import { TableSkeleton } from '@/components/LoadingSkeleton';
import { formatDistanceToNow } from 'date-fns';

const PAGE_SIZE = 25;

const RESOURCE_OPTIONS = [
  { value: 'all', label: 'All resources' },
  { value: 'agents', label: 'Agents' },
  { value: 'clients', label: 'Clients' },
  { value: 'conversations', label: 'Conversations' },
  { value: 'pbx', label: 'PBX / Lemtel' },
  { value: 'phone_numbers', label: 'Phone Numbers' },
  { value: 'organizations', label: 'Organizations' },
];

const ACTION_OPTIONS = [
  { value: 'all', label: 'All actions' },
  { value: 'list', label: 'List' },
  { value: 'create', label: 'Create' },
  { value: 'view', label: 'View' },
  { value: 'update', label: 'Update' },
  { value: 'delete', label: 'Delete' },
  { value: 'fusionpbx_proxy', label: 'PBX proxy (ok)' },
  { value: 'fusionpbx_proxy_error', label: 'PBX proxy (error)' },
];

export default function AuditLogs() {
  const { selectedOrgId, organizations } = useOrganization() as any;
  const [orgFilter, setOrgFilter] = useState<string>('current');
  const [resourceFilter, setResourceFilter] = useState<string>('all');
  const [actionFilter, setActionFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);

  const effectiveOrgId = orgFilter === 'current' ? selectedOrgId : orgFilter;

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['audit-logs', effectiveOrgId, resourceFilter, actionFilter, page],
    enabled: !!effectiveOrgId,
    queryFn: async () => {
      let q = supabase
        .from('audit_logs')
        .select('id, created_at, action, resource_type, resource_id, user_id, organization_id, metadata, ip_address, user_agent', { count: 'exact' })
        .eq('organization_id', effectiveOrgId)
        .order('created_at', { ascending: false })
        .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
      if (resourceFilter !== 'all') q = q.eq('resource_type', resourceFilter);
      if (actionFilter !== 'all') q = q.eq('action', actionFilter);
      const { data, error, count } = await q;
      if (error) throw error;
      return { rows: data || [], count: count ?? 0 };
    },
  });

  const total = data?.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const filtered = useMemo(() => {
    const rows = data?.rows || [];
    if (!search) return rows;
    const s = search.toLowerCase();
    return rows.filter(r => JSON.stringify(r).toLowerCase().includes(s));
  }, [data, search]);

  const resetPageAnd = (fn: (v: string) => void) => (v: string) => { setPage(0); fn(v); };

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <PortalPageHeader
            title="Audit Logs"
            description="Track who listed, created, fetched, or modified resources per organization."
            icon={ScrollText}
          />
          <Button variant="outline" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`mr-2 h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>

        <Card>
          <CardContent className="p-4 grid grid-cols-1 md:grid-cols-4 gap-3">
            <Select value={orgFilter} onValueChange={resetPageAnd(setOrgFilter)}>
              <SelectTrigger><SelectValue placeholder="Organization" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="current">Current org</SelectItem>
                {(organizations || []).map((o: any) => (
                  <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={resourceFilter} onValueChange={resetPageAnd(setResourceFilter)}>
              <SelectTrigger><SelectValue placeholder="Resource" /></SelectTrigger>
              <SelectContent>
                {RESOURCE_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={actionFilter} onValueChange={resetPageAnd(setActionFilter)}>
              <SelectTrigger><SelectValue placeholder="Action" /></SelectTrigger>
              <SelectContent>
                {ACTION_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search metadata on this page…" value={search} onChange={e => setSearch(e.target.value)} className="pl-10" />
            </div>
          </CardContent>
        </Card>

        {isLoading ? (
          <TableSkeleton rows={8} />
        ) : (
          <Card>
            <CardContent className="p-0 overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-left">
                  <tr>
                    <th className="px-4 py-3">When</th>
                    <th className="px-4 py-3">Action</th>
                    <th className="px-4 py-3">Resource</th>
                    <th className="px-4 py-3">User</th>
                    <th className="px-4 py-3">Metadata</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">No audit log entries.</td></tr>
                  ) : filtered.map(row => {
                    const isError = (row.action || '').endsWith('_error');
                    return (
                      <tr key={row.id} className="border-t border-border">
                        <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">
                          {row.created_at ? formatDistanceToNow(new Date(row.created_at), { addSuffix: true }) : '—'}
                        </td>
                        <td className="px-4 py-3"><Badge variant={isError ? 'destructive' : 'outline'}>{row.action}</Badge></td>
                        <td className="px-4 py-3">
                          <div className="font-medium">{row.resource_type}</div>
                          {row.resource_id && <div className="text-xs text-muted-foreground font-mono">{row.resource_id}</div>}
                        </td>
                        <td className="px-4 py-3 text-xs font-mono">{row.user_id || '—'}</td>
                        <td className="px-4 py-3 max-w-md">
                          <pre className="text-xs whitespace-pre-wrap break-all text-muted-foreground">
                            {row.metadata ? JSON.stringify(row.metadata, null, 0) : '—'}
                          </pre>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </CardContent>
          </Card>
        )}

        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <div>{total.toLocaleString()} entries · page {page + 1} of {totalPages}</div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" disabled={page === 0 || isFetching} onClick={() => setPage(p => Math.max(0, p - 1))}>
              <ChevronLeft className="w-4 h-4 mr-1" /> Previous
            </Button>
            <Button variant="outline" size="sm" disabled={page + 1 >= totalPages || isFetching} onClick={() => setPage(p => p + 1)}>
              Next <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
