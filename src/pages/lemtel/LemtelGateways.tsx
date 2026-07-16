import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Network, RefreshCw, Search, Loader2, Power, Play, Square, Plus, Bug, Trash2, Pencil } from 'lucide-react';
import { toast } from 'sonner';
import { FusionPbxPermissionsHelp } from '@/components/lemtel/FusionPbxPermissionsHelp';

type Gateway = {
  gateway_uuid: string;
  gateway: string;
  proxy: string | null;
  context: string | null;
  register: string | boolean | null;
  enabled: string | boolean | null;
  hostname: string | null;
  description: string | null;
};

export default function LemtelGateways() {
  const [q, setQ] = useState('');
  const [restarting, setRestarting] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [diag, setDiag] = useState<any>(null);
  const [diagOpen, setDiagOpen] = useState(false);
  const [diagLoading, setDiagLoading] = useState(false);
  const [form, setForm] = useState({ gateway: '', proxy: '', username: '', password: '', realm: '', context: 'public', register: true, enabled: true, profile: 'external', expire_seconds: '600', retry_seconds: '30' });

  const { data: rows = [], isLoading, refetch } = useQuery({
    queryKey: ['fpbx', 'gateways'],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('fusionpbx-proxy', {
        body: { action: 'list-gateways-merged' },
      });
      let arr: Gateway[] = [];
      if (!error) {
        arr = ((data?.data || []) as any[]).map((g: any) => ({
          gateway_uuid: g.gateway_uuid,
          gateway: g.gateway,
          proxy: g.proxy,
          context: g.context,
          register: g.register,
          enabled: g.enabled,
          hostname: g.hostname || g._domain_name,
          description: g.description || g._domain_name,
        }));
      }
      // Last resort: cached pbx_gateways rows
      if (!Array.isArray(arr) || arr.length === 0) {
        const { data: cached } = await (supabase as any)
          .from('pbx_gateways')
          .select('pbx_uuid,name,proxy,realm,username,context,profile,status,enabled,register,config')
          .order('name', { ascending: true });
        arr = (cached || []).map((g: any) => ({
          gateway_uuid: g.pbx_uuid,
          gateway: g.name,
          proxy: g.proxy,
          context: g.context,
          register: g.register,
          enabled: g.enabled,
          hostname: g.realm,
          description: g.config?.description || null,
        }));
      }
      return Array.isArray(arr) ? arr : [];
    },
  });

  const runDiagnostic = async () => {
    setDiagLoading(true);
    setDiagOpen(true);
    try {
      const { data, error } = await supabase.functions.invoke('fusionpbx-proxy', {
        body: { action: 'debug-raw', params: { path: 'gateways' } },
      });
      setDiag(error ? { error: error.message } : data);
    } catch (e: any) {
      setDiag({ error: e?.message || String(e) });
    } finally { setDiagLoading(false); }
  };

  const restart = async (gw: Gateway) => {
    setRestarting(gw.gateway_uuid);
    try {
      const { error } = await supabase.functions.invoke('fusionpbx-proxy', {
        body: { action: 'restart-gateway', params: { gateway_name: gw.gateway } },
      });
      if (error) throw error;
      toast.success(`Restarted ${gw.gateway}`);
    } catch (e: any) {
      toast.error('Restart failed: ' + (e?.message || ''));
    } finally { setRestarting(null); }
  };

  const sofiaCmd = async (gw: Gateway, action: 'start-gateway' | 'stop-gateway') => {
    try {
      const { error } = await supabase.functions.invoke('fusionpbx-proxy', {
        body: { action, params: { gateway_name: gw.gateway } },
      });
      if (error) throw error;
      toast.success(`${action === 'start-gateway' ? 'Started' : 'Stopped'} ${gw.gateway}`);
    } catch (e: any) { toast.error('Failed: ' + (e?.message || '')); }
  };

  const saveGateway = async () => {
    setCreating(true);
    try {
      const isEdit = !!(form as any).gateway_uuid;
      const action = isEdit ? 'update-gateways' : 'create-gateways';
      const params: any = {
        gateway: form.gateway, proxy: form.proxy, username: form.username, password: form.password,
        realm: form.realm || form.proxy, context: form.context, profile: form.profile,
        register: form.register ? 'true' : 'false', enabled: form.enabled ? 'true' : 'false',
        expire_seconds: form.expire_seconds, retry_seconds: form.retry_seconds,
      };
      if (isEdit) params.gateway_uuid = (form as any).gateway_uuid;
      const { data, error } = await supabase.functions.invoke('fusionpbx-proxy', { body: { action, params } });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      toast.success(isEdit ? 'Gateway updated' : 'Gateway created');
      setOpen(false);
      refetch();
    } catch (e: any) {
      toast.error(e?.message || 'Save failed');
    } finally { setCreating(false); }
  };
  const createGateway = saveGateway;

  const openEdit = (g: Gateway) => {
    setForm({
      gateway: g.gateway || '',
      proxy: g.proxy || '',
      username: '',
      password: '',
      realm: g.hostname || g.proxy || '',
      context: g.context || 'public',
      register: g.register === true || g.register === 'true',
      enabled: g.enabled === true || g.enabled === 'true',
      profile: 'external',
      expire_seconds: '600',
      retry_seconds: '30',
      gateway_uuid: g.gateway_uuid,
    } as any);
    setOpen(true);
  };

  const deleteGateway = async (g: Gateway) => {
    if (!confirm(`Delete gateway "${g.gateway}"? This cannot be undone.`)) return;
    try {
      const { error } = await supabase.functions.invoke('fusionpbx-proxy', {
        body: { action: 'delete-gateways', params: { gateway_uuid: g.gateway_uuid } },
      });
      if (error) throw error;
      toast.success('Gateway deleted');
      refetch();
    } catch (e: any) { toast.error(e?.message || 'Delete failed'); }
  };

  const filtered = rows.filter(g =>
    !q || `${g.gateway} ${g.proxy ?? ''} ${g.hostname ?? ''}`.toLowerCase().includes(q.toLowerCase())
  );

  return (
    <div className="space-y-4 w-full min-w-0">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2"><Network className="w-7 h-7" /> Gateways</h1>
          <p className="text-muted-foreground text-sm">SIP trunks &amp; carrier connections programmed on the PBX</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={runDiagnostic}>
            <Bug className="w-4 h-4 mr-2" /> Diagnostic
          </Button>
          <Button variant="outline" onClick={() => refetch()}>
            <RefreshCw className="w-4 h-4 mr-2" /> Refresh
          </Button>
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild><Button onClick={() => { setForm({ gateway: '', proxy: '', username: '', password: '', realm: '', context: 'public', register: true, enabled: true, profile: 'external', expire_seconds: '600', retry_seconds: '30' }); }}><Plus className="w-4 h-4 mr-2" /> Add Gateway</Button></SheetTrigger>
            <SheetContent className="space-y-3 overflow-y-auto">
              <SheetHeader><SheetTitle>{(form as any).gateway_uuid ? 'Edit' : 'New'} SIP Gateway</SheetTitle></SheetHeader>
              <div className="space-y-3">
                {[
                  ['gateway', 'Name'], ['proxy', 'Proxy (host:port)'], ['realm', 'Realm (optional)'],
                  ['username', 'Username'], ['password', 'Password'],
                  ['context', 'Context'], ['profile', 'Profile'], ['expire_seconds', 'Expire (s)'], ['retry_seconds', 'Retry (s)'],
                ].map(([k, label]) => (
                  <div key={k}>
                    <Label>{label}</Label>
                    <Input
                      type={k === 'password' ? 'password' : 'text'}
                      value={(form as any)[k]}
                      onChange={(e) => setForm({ ...form, [k]: e.target.value })}
                    />
                  </div>
                ))}
                <div className="flex items-center gap-3">
                  <Switch checked={form.register} onCheckedChange={(v) => setForm({ ...form, register: v })} />
                  <Label>Register</Label>
                </div>
                <div className="flex items-center gap-3">
                  <Switch checked={form.enabled} onCheckedChange={(v) => setForm({ ...form, enabled: v })} />
                  <Label>Enabled</Label>
                </div>
                <Button className="w-full" disabled={creating || !form.gateway || !form.proxy} onClick={saveGateway}>
                  {creating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                  {(form as any).gateway_uuid ? 'Save Changes' : 'Create'}
                </Button>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>

      <FusionPbxPermissionsHelp area="gateways" />

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <CardTitle>{filtered.length} gateway{filtered.length === 1 ? '' : 's'}</CardTitle>
            <div className="relative w-72 max-w-full">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Search gateway, proxy…" className="pl-9" />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="py-8 flex justify-center"><Loader2 className="animate-spin" /></div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Gateway</TableHead>
                  <TableHead>Proxy</TableHead>
                  <TableHead>Context</TableHead>
                  <TableHead>Register</TableHead>
                  <TableHead>Enabled</TableHead>
                  <TableHead>Hostname / Description</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8 space-y-2">
                    <div className="font-medium text-foreground">FusionPBX returned no gateways for this API user.</div>
                    <div className="text-xs max-w-2xl mx-auto">
                      The PBX GUI may show global SIP trunks (e.g. <code>skyetel</code>, <code>voipms</code>), but the REST API plugin auto-scopes queries to the API user's domain
                      (<code>WHERE domain_uuid = '...'</code>) and our API user also lacks <code>command_add</code>/<code>command_edit</code> to read them via <code>fs_cli</code>.
                      <br />Fix in FusionPBX → <b>Advanced → Group Manager</b>: add <code>gateway_view</code>, <code>gateway_all</code>, <code>command_add</code> and <code>command_edit</code> to the API user's group, then click <b>Refresh</b>.
                      Click <b>Diagnostic</b> for the raw API response.
                    </div>
                  </TableCell></TableRow>
                ) : filtered.map(g => {
                  const enabled = g.enabled === true || g.enabled === 'true';
                  const register = g.register === true || g.register === 'true';
                  return (
                    <TableRow key={g.gateway_uuid}>
                      <TableCell className="font-mono font-medium">{g.gateway}</TableCell>
                      <TableCell className="font-mono text-xs">{g.proxy || '—'}</TableCell>
                      <TableCell className="text-xs">{g.context || 'public'}</TableCell>
                      <TableCell><Badge variant={register ? 'default' : 'secondary'}>{register ? 'Yes' : 'No'}</Badge></TableCell>
                      <TableCell><Badge variant={enabled ? 'default' : 'secondary'}>{enabled ? 'On' : 'Off'}</Badge></TableCell>
                      <TableCell className="text-xs text-muted-foreground">{g.hostname || g.description || '—'}</TableCell>
                      <TableCell className="text-right space-x-1">
                        <Button variant="ghost" size="sm" onClick={() => openEdit(g)} title="Edit"><Pencil className="w-3.5 h-3.5" /></Button>
                        <Button variant="ghost" size="sm" onClick={() => sofiaCmd(g, 'start-gateway')} title="Start"><Play className="w-3.5 h-3.5" /></Button>
                        <Button variant="ghost" size="sm" onClick={() => sofiaCmd(g, 'stop-gateway')} title="Stop"><Square className="w-3.5 h-3.5" /></Button>
                        <Button variant="ghost" size="sm" disabled={restarting === g.gateway_uuid} onClick={() => restart(g)} title="Restart">
                          {restarting === g.gateway_uuid ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Power className="w-3.5 h-3.5" />}
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => deleteGateway(g)} title="Delete"><Trash2 className="w-3.5 h-3.5" /></Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={diagOpen} onOpenChange={setDiagOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader><DialogTitle>FusionPBX /gateways raw response</DialogTitle></DialogHeader>
          {diagLoading ? (
            <div className="py-8 flex justify-center"><Loader2 className="animate-spin" /></div>
          ) : (
            <pre className="text-xs bg-muted p-3 rounded max-h-[60vh] overflow-auto">{JSON.stringify(diag, null, 2)}</pre>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
