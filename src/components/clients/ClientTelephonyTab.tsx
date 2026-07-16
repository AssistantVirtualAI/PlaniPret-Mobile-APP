import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Phone, Voicemail, Bot, Plus, Trash2, Loader2, RefreshCw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useQuery, useQueryClient } from '@tanstack/react-query';

interface Props {
  clientId: string;
  organizationId: string;
}

export function ClientTelephonyTab({ clientId, organizationId }: Props) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [newExt, setNewExt] = useState('');
  const [newName, setNewName] = useState('');

  // Owned objects for this client
  const { data: owners = [] } = useQuery({
    queryKey: ['pbx_object_owner', clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('pbx_object_owner')
        .select('*')
        .eq('client_id', clientId);
      if (error) throw error;
      return data || [];
    },
  });

  const extUuids = useMemo(
    () => owners.filter((o: any) => o.object_type === 'extension').map((o: any) => o.object_pbx_uuid),
    [owners]
  );
  const bindingIds = useMemo(
    () => owners.filter((o: any) => o.object_type === 'voice_agent_binding').map((o: any) => o.object_pbx_uuid),
    [owners]
  );

  const { data: extensions = [], isLoading: extLoading, refetch: refetchExt } = useQuery({
    queryKey: ['client_extensions', clientId, extUuids.length],
    queryFn: async () => {
      if (extUuids.length === 0) return [];
      const { data, error } = await supabase
        .from('pbx_extensions')
        .select('id, pbx_uuid, extension, effective_cid_name, description, enabled')
        .in('pbx_uuid', extUuids);
      if (error) throw error;
      return data || [];
    },
    enabled: extUuids.length > 0,
  });

  const exts = extensions.map((e: any) => String(e.extension));
  const { data: voicemails = [] } = useQuery({
    queryKey: ['client_voicemails', clientId, exts.join(',')],
    queryFn: async () => {
      if (exts.length === 0) return [];
      const { data, error } = await supabase
        .from('pbx_voicemails')
        .select('id, extension, caller_id_number, duration_seconds, read_at, created_at')
        .eq('organization_id', organizationId)
        .in('extension', exts)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return data || [];
    },
    enabled: exts.length > 0,
  });

  const { data: bindings = [], refetch: refetchBindings } = useQuery({
    queryKey: ['voice_agent_bindings', clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('voice_agent_bindings')
        .select('*')
        .eq('client_id', clientId);
      if (error) throw error;
      return data || [];
    },
  });

  const handleCreateExtension = async () => {
    if (!newExt) return;
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke('pbx-write', {
        body: {
          organizationId,
          clientId,
          action: 'create-extension',
          params: {
            extension: newExt,
            password: crypto.randomUUID().slice(0, 12),
            effective_caller_id_name: newName || `Ext ${newExt}`,
          },
          objectType: 'extension',
        },
      });
      if (error) throw error;
      const pbxUuid = (data as any)?.proxy?.body?.extension?.extension_uuid
        || (data as any)?.proxy?.body?.extension_uuid;
      if (pbxUuid) {
        await supabase.from('pbx_object_owner').insert({
          organization_id: organizationId,
          client_id: clientId,
          object_type: 'extension',
          object_pbx_uuid: pbxUuid,
        });
      }
      toast({ title: 'Extension créée', description: `${newExt} liée au client` });
      setNewExt(''); setNewName('');
      qc.invalidateQueries({ queryKey: ['pbx_object_owner', clientId] });
      qc.invalidateQueries({ queryKey: ['pbx_extensions'] });
      refetchExt();
    } catch (e: any) {
      toast({ title: 'Échec création', description: e?.message || String(e), variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteExtension = async (ext: any) => {
    if (!confirm(`Supprimer l'extension ${ext.extension} ?`)) return;
    setBusy(true);
    try {
      const { error } = await supabase.functions.invoke('pbx-write', {
        body: {
          organizationId,
          clientId,
          action: 'delete-extension',
          params: { extension_uuid: ext.pbx_uuid, extension: ext.extension },
        },
      });
      if (error) throw error;
      await supabase.from('pbx_object_owner').delete()
        .eq('client_id', clientId)
        .eq('object_pbx_uuid', ext.pbx_uuid);
      toast({ title: 'Extension supprimée' });
      qc.invalidateQueries({ queryKey: ['pbx_object_owner', clientId] });
      refetchExt();
    } catch (e: any) {
      toast({ title: 'Échec suppression', description: e?.message || String(e), variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  // Realtime sync
  useEffect(() => {
    const ch = supabase.channel(`client-tel-${clientId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pbx_object_owner', filter: `client_id=eq.${clientId}` },
        () => qc.invalidateQueries({ queryKey: ['pbx_object_owner', clientId] }))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'voice_agent_bindings', filter: `client_id=eq.${clientId}` },
        () => refetchBindings())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [clientId, qc, refetchBindings]);

  return (
    <Tabs defaultValue="extensions" className="space-y-4">
      <TabsList>
        <TabsTrigger value="extensions"><Phone className="h-4 w-4 mr-2" />Extensions</TabsTrigger>
        <TabsTrigger value="voicemail"><Voicemail className="h-4 w-4 mr-2" />Messagerie</TabsTrigger>
        <TabsTrigger value="agents"><Bot className="h-4 w-4 mr-2" />Agents IA</TabsTrigger>
      </TabsList>

      <TabsContent value="extensions">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Extensions SIP du client</CardTitle>
            <Button size="sm" variant="outline" onClick={() => refetchExt()}>
              <RefreshCw className="h-4 w-4 mr-2" />Actualiser
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2 items-end">
              <div className="flex-1">
                <label className="text-xs text-muted-foreground">Numéro</label>
                <Input value={newExt} onChange={(e) => setNewExt(e.target.value)} placeholder="2001" />
              </div>
              <div className="flex-1">
                <label className="text-xs text-muted-foreground">Nom affiché</label>
                <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="John Doe" />
              </div>
              <Button onClick={handleCreateExtension} disabled={busy || !newExt}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
                Créer
              </Button>
            </div>

            {extLoading ? (
              <div className="text-sm text-muted-foreground">Chargement…</div>
            ) : extensions.length === 0 ? (
              <div className="text-sm text-muted-foreground">Aucune extension liée à ce client.</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Extension</TableHead>
                    <TableHead>Nom</TableHead>
                    <TableHead>Statut</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {extensions.map((e: any) => (
                    <TableRow key={e.id}>
                      <TableCell className="font-mono">{e.extension}</TableCell>
                      <TableCell>{e.effective_cid_name || e.description || '—'}</TableCell>
                      <TableCell>
                        <Badge variant={e.enabled ? 'default' : 'secondary'}>
                          {e.enabled ? 'Actif' : 'Désactivé'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" variant="ghost" onClick={() => handleDeleteExtension(e)} disabled={busy}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="voicemail">
        <Card>
          <CardHeader><CardTitle>Messages vocaux</CardTitle></CardHeader>
          <CardContent>
            {voicemails.length === 0 ? (
              <div className="text-sm text-muted-foreground">Aucun message vocal.</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Extension</TableHead>
                    <TableHead>De</TableHead>
                    <TableHead>Durée</TableHead>
                    <TableHead>État</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {voicemails.map((v: any) => (
                    <TableRow key={v.id}>
                      <TableCell>{new Date(v.created_at).toLocaleString()}</TableCell>
                      <TableCell className="font-mono">{v.extension}</TableCell>
                      <TableCell>{v.caller_id_number || '—'}</TableCell>
                      <TableCell>{v.duration_seconds || 0}s</TableCell>
                      <TableCell>
                        <Badge variant={v.read_at ? 'secondary' : 'default'}>
                          {v.read_at ? 'Lu' : 'Non lu'}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="agents">
        <Card>
          <CardHeader><CardTitle>Liaisons d'agents IA</CardTitle></CardHeader>
          <CardContent>
            {bindings.length === 0 ? (
              <div className="text-sm text-muted-foreground">
                Aucune liaison. Créez un agent puis liez-le à un DID, une extension, une option IVR ou un overflow de file.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Type</TableHead>
                    <TableHead>Cible</TableHead>
                    <TableHead>Agent</TableHead>
                    <TableHead>Priorité</TableHead>
                    <TableHead>Actif</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {bindings.map((b: any) => (
                    <TableRow key={b.id}>
                      <TableCell>{b.binding_type}</TableCell>
                      <TableCell className="font-mono">{b.target_ref}</TableCell>
                      <TableCell className="font-mono text-xs">{b.agent_id?.slice(0, 8)}…</TableCell>
                      <TableCell>{b.priority || 0}</TableCell>
                      <TableCell>
                        <Badge variant={b.is_active ? 'default' : 'secondary'}>
                          {b.is_active ? 'Oui' : 'Non'}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  );
}
