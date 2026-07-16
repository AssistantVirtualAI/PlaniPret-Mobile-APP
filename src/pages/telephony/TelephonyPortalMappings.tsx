import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, RefreshCw, Link2, Unlink, CheckCircle2, AlertTriangle, History } from 'lucide-react';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';

const LEMTEL_ORG = '71755d33-ed64-4ad5-a828-61c9d2029eb7';

type LinkRow = {
  id: string;
  organization_id: string;
  extension: string;
  display_name: string | null;
  sip_domain: string | null;
  portal_user_id: string | null;
  portal_email: string | null;
  portal_full_name: string | null;
  link_status: 'ok' | 'unlinked' | 'mismatched';
};

type AuditRow = {
  id: string;
  extension: string;
  old_portal_user_id: string | null;
  new_portal_user_id: string | null;
  action: string;
  actor_email: string | null;
  source: string | null;
  created_at: string;
};

export default function TelephonyPortalMappings() {
  const qc = useQueryClient();
  const [editRow, setEditRow] = useState<LinkRow | null>(null);
  const [emailInput, setEmailInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');

  const { data: rows, isLoading, refetch } = useQuery({
    queryKey: ['pbx-link-status', LEMTEL_ORG],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('pbx_softphone_link_status' as any)
        .select('*')
        .eq('organization_id', LEMTEL_ORG)
        .order('extension');
      if (error) throw error;
      return (data ?? []) as unknown as LinkRow[];
    },
  });

  const { data: audit } = useQuery({
    queryKey: ['pbx-portal-audit', LEMTEL_ORG],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('pbx_softphone_portal_audit' as any)
        .select('id,extension,old_portal_user_id,new_portal_user_id,action,actor_email,source,created_at')
        .eq('organization_id', LEMTEL_ORG)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as unknown as AuditRow[];
    },
  });

  const filtered = (rows ?? []).filter((r) => {
    const q = search.toLowerCase().trim();
    if (!q) return true;
    return (
      r.extension.toLowerCase().includes(q) ||
      (r.display_name ?? '').toLowerCase().includes(q) ||
      (r.portal_email ?? '').toLowerCase().includes(q)
    );
  });

  const counts = {
    ok: (rows ?? []).filter((r) => r.link_status === 'ok').length,
    unlinked: (rows ?? []).filter((r) => r.link_status === 'unlinked').length,
    mismatched: (rows ?? []).filter((r) => r.link_status === 'mismatched').length,
  };

  const openEdit = (r: LinkRow) => {
    setEditRow(r);
    setEmailInput(r.portal_email ?? '');
  };

  const save = async () => {
    if (!editRow) return;
    setSaving(true);
    try {
      const { error } = await supabase.rpc('admin_link_softphone_by_email' as any, {
        _softphone_id: editRow.id,
        _email: emailInput.trim() || null,
      });
      if (error) throw error;
      toast.success('Mapping updated');
      setEditRow(null);
      qc.invalidateQueries({ queryKey: ['pbx-link-status', LEMTEL_ORG] });
      qc.invalidateQueries({ queryKey: ['pbx-portal-audit', LEMTEL_ORG] });
    } catch (e: any) {
      toast.error(e.message ?? 'Failed to update mapping');
    } finally {
      setSaving(false);
    }
  };

  const badge = (s: LinkRow['link_status']) => {
    if (s === 'ok') return <Badge className="bg-emerald-600">OK</Badge>;
    if (s === 'unlinked') return <Badge variant="secondary">Unlinked</Badge>;
    return <Badge variant="destructive">Mismatched</Badge>;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Portal user mappings</h1>
          <p className="text-sm text-muted-foreground">
            View and edit the link between extensions and portal (auth) users.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <RefreshCw className="w-4 h-4 mr-2" /> Refresh
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Card><CardContent className="p-4 flex items-center gap-3">
          <CheckCircle2 className="w-5 h-5 text-emerald-600" />
          <div><div className="text-xs text-muted-foreground">Linked</div><div className="text-xl font-semibold">{counts.ok}</div></div>
        </CardContent></Card>
        <Card><CardContent className="p-4 flex items-center gap-3">
          <Unlink className="w-5 h-5 text-muted-foreground" />
          <div><div className="text-xs text-muted-foreground">Unlinked</div><div className="text-xl font-semibold">{counts.unlinked}</div></div>
        </CardContent></Card>
        <Card><CardContent className="p-4 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-destructive" />
          <div><div className="text-xs text-muted-foreground">Mismatched</div><div className="text-xl font-semibold">{counts.mismatched}</div></div>
        </CardContent></Card>
      </div>

      {counts.mismatched > 0 && (
        <Alert variant="destructive">
          <AlertTriangle className="w-4 h-4" />
          <AlertDescription>
            Some extensions reference a portal user that no longer exists. Re-link them below.
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <div>
            <CardTitle>Extensions</CardTitle>
            <CardDescription>Click an extension to edit its mapped portal user.</CardDescription>
          </div>
          <Input
            placeholder="Search extension, name, email"
            className="max-w-xs"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-10"><Loader2 className="w-5 h-5 animate-spin" /></div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ext</TableHead>
                  <TableHead>Display name</TableHead>
                  <TableHead>SIP domain</TableHead>
                  <TableHead>Portal user</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-mono">{r.extension}</TableCell>
                    <TableCell>{r.display_name ?? '—'}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">{r.sip_domain ?? '—'}</TableCell>
                    <TableCell>
                      {r.portal_email ? (
                        <div>
                          <div className="text-sm">{r.portal_full_name ?? r.portal_email}</div>
                          <div className="text-xs text-muted-foreground">{r.portal_email}</div>
                        </div>
                      ) : r.portal_user_id ? (
                        <span className="text-xs text-destructive font-mono">{r.portal_user_id}</span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>{badge(r.link_status)}</TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="outline" onClick={() => openEdit(r)}>
                        <Link2 className="w-3.5 h-3.5 mr-1" /> Edit
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {filtered.length === 0 && (
                  <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6">No extensions</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><History className="w-4 h-4" /> Recent mapping changes</CardTitle>
          <CardDescription>Audit log of portal user assignments (latest 50).</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>Ext</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>From → To</TableHead>
                <TableHead>Actor</TableHead>
                <TableHead>Source</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(audit ?? []).map((a) => (
                <TableRow key={a.id}>
                  <TableCell className="text-xs text-muted-foreground">{formatDistanceToNow(new Date(a.created_at), { addSuffix: true })}</TableCell>
                  <TableCell className="font-mono">{a.extension}</TableCell>
                  <TableCell><Badge variant="outline">{a.action}</Badge></TableCell>
                  <TableCell className="text-xs font-mono">
                    {(a.old_portal_user_id ?? '∅').slice(0, 8)} → {(a.new_portal_user_id ?? '∅').slice(0, 8)}
                  </TableCell>
                  <TableCell className="text-xs">{a.actor_email ?? '—'}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{a.source ?? '—'}</TableCell>
                </TableRow>
              ))}
              {(audit ?? []).length === 0 && (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6">No changes yet</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={!!editRow} onOpenChange={(o) => !o && setEditRow(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit mapping — Ext {editRow?.extension}</DialogTitle>
            <DialogDescription>
              Enter the email of the portal (auth) user to link. Leave empty to unlink. The email must exist in the user directory.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Input
              placeholder="user@example.com"
              value={emailInput}
              onChange={(e) => setEmailInput(e.target.value)}
              autoFocus
            />
            {editRow?.sip_domain && (
              <p className="text-xs text-muted-foreground">SIP domain: {editRow.sip_domain}</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditRow(null)}>Cancel</Button>
            <Button onClick={save} disabled={saving}>
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
