import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Bot, Plus, Loader2, Pencil, Trash2, Phone, Users, Sparkles, CheckCircle2, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { usePbxAgents, usePbxClients, usePbxPhoneNumbers, LEMTEL_ORG } from '@/hooks/usePbxData';
import { usePbxRealtime } from '@/hooks/usePbxRealtime';
import { CreateAgentWizard } from '@/components/agents/CreateAgentWizard';

type Agent = any;

const PLATFORMS = ['elevenlabs', 'vapi', 'retell'] as const;

export default function LemtelVoiceAgents() {
  const qc = useQueryClient();
  const { data: agents = [], isLoading } = usePbxAgents();
  const { data: clients = [] } = usePbxClients();
  const { data: numbers = [] } = usePbxPhoneNumbers();
  usePbxRealtime(['agents', 'pbx_phone_number_assignments'], ['pbx']);

  const { data: assignments = [] } = useQuery({
    queryKey: ['pbx', 'pbx_phone_number_assignments_all'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('pbx_phone_number_assignments' as any)
        .select('*')
        .eq('organization_id', LEMTEL_ORG);
      if (error) throw error;
      return data || [];
    },
  });

  const voice = useMemo(
    () => (agents as Agent[]).filter(a => PLATFORMS.includes((a.platform || '').toLowerCase())),
    [agents],
  );

  const [open, setOpen] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [editing, setEditing] = useState<Agent | null>(null);
  const [form, setForm] = useState<any>({
    name: '', platform: 'elevenlabs', description: '',
    platform_agent_id: '', client_id: '', phone_number_id: '',
  });

  const hasElevenLabs = useMemo(
    () => (voice as any[]).some(a => a.platform === 'elevenlabs' && a.platform_api_key),
    [voice],
  );
  function openEdit(a: Agent) {
    const pnAssign = (assignments as any[]).find(x => x.voice_agent_id === a.id);
    setEditing(a);
    setForm({
      name: a.name || '',
      platform: a.platform || 'elevenlabs',
      description: a.description || '',
      platform_agent_id: a.platform_agent_id || '',
      client_id: a.client_id || '',
      phone_number_id: pnAssign?.phone_number_id || '',
    });
    setOpen(true);
  }

  const saveMut = useMutation({
    mutationFn: async () => {
      if (!form.name.trim()) throw new Error('Name is required');
      let agentId = editing?.id as string | undefined;
      const payload: any = {
        name: form.name.trim(),
        platform: form.platform,
        description: form.description || null,
        platform_agent_id: form.platform_agent_id || null,
        client_id: form.client_id || null,
        is_external: true,
        organization_id: LEMTEL_ORG,
      };
      if (agentId) {
        const { error } = await supabase.from('agents').update(payload).eq('id', agentId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from('agents').insert(payload).select('id').single();
        if (error) throw error;
        agentId = data.id;
      }
      // Phone number assignment
      if (form.phone_number_id) {
        const existing = (assignments as any[]).find(x => x.phone_number_id === form.phone_number_id);
        const row = {
          organization_id: LEMTEL_ORG,
          phone_number_id: form.phone_number_id,
          voice_agent_id: agentId,
          client_id: form.client_id || null,
          destination_type: 'voice_agent',
          destination_id: agentId,
          ai_enabled: true,
        };
        if (existing) {
          const { error } = await supabase.from('pbx_phone_number_assignments' as any).update(row).eq('id', existing.id);
          if (error) throw error;
        } else {
          const { error } = await supabase.from('pbx_phone_number_assignments' as any).insert(row);
          if (error) throw error;
        }
        // Best-effort PBX dialplan sync
        try {
          await supabase.functions.invoke('pbx-write', {
            body: {
              organizationId: LEMTEL_ORG,
              clientId: form.client_id || undefined,
              action: 'route-did-to-agent',
              params: { phone_number_id: form.phone_number_id, agent_id: agentId, platform: form.platform },
              objectType: 'voice_agent',
              objectPbxUuid: agentId,
            },
          });
        } catch (e) {
          console.warn('pbx-write route-did-to-agent failed (non-fatal)', e);
        }
      }
      return agentId;
    },
    onSuccess: () => {
      toast.success(editing ? 'Voice agent updated' : 'Voice agent created');
      setOpen(false);
      qc.invalidateQueries({ queryKey: ['pbx'] });
    },
    onError: (e: any) => toast.error(e?.message || 'Save failed'),
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      await supabase.from('pbx_phone_number_assignments' as any).delete().eq('voice_agent_id', id);
      const { error } = await supabase.from('agents').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success('Voice agent deleted'); qc.invalidateQueries({ queryKey: ['pbx'] }); },
    onError: (e: any) => toast.error(e?.message || 'Delete failed'),
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="text-3xl font-bold flex items-center gap-2"><Bot className="w-7 h-7 shrink-0" /> <span>Voice AI Agents</span></h1>
          <p className="text-muted-foreground mt-1">Program per-customer AI receptionists and route DIDs to them. Synced live with PBX.</p>
        </div>
        <div className="flex flex-wrap gap-2 shrink-0">
          <Button variant="outline" onClick={() => { setEditing(null); setForm({ name:'',platform:'elevenlabs',description:'',platform_agent_id:'',client_id:'',phone_number_id:'' }); setOpen(true); }}>
            <Phone className="w-4 h-4 mr-2" /> Lier un agent existant
          </Button>
          <Button onClick={() => setWizardOpen(true)}>
            <Sparkles className="w-4 h-4 mr-2" /> Nouvel agent (étape par étape)
          </Button>
        </div>
      </div>

      {/* ElevenLabs connection status */}
      <Card className={hasElevenLabs ? 'border-green-500/30' : 'border-amber-500/30'}>
        <CardContent className="flex items-center justify-between py-4">
          <div className="flex items-center gap-3">
            {hasElevenLabs ? <CheckCircle2 className="w-5 h-5 text-green-500" /> : <AlertCircle className="w-5 h-5 text-amber-500" />}
            <div>
              <div className="font-medium">Système téléphonique ↔ ElevenLabs</div>
              <div className="text-sm text-muted-foreground">
                {hasElevenLabs
                  ? 'Connecté — vous pouvez router des DID vers vos agents ElevenLabs.'
                  : 'Aucun agent ElevenLabs avec clé API détecté. Créez un agent avec l’assistant pour connecter ElevenLabs au PBX.'}
              </div>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={() => setWizardOpen(true)}>Configurer</Button>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Total Agents</CardTitle></CardHeader><CardContent><div className="text-3xl font-bold">{voice.length}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Platforms</CardTitle></CardHeader><CardContent><div className="text-3xl font-bold">{new Set(voice.map(a => a.platform)).size}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Customers</CardTitle></CardHeader><CardContent><div className="text-3xl font-bold">{new Set(voice.map(a => a.client_id).filter(Boolean)).size}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Routed DIDs</CardTitle></CardHeader><CardContent><div className="text-3xl font-bold">{(assignments as any[]).filter(x => x.voice_agent_id).length}</div></CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Voice Agents</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="animate-spin" /></div>
          ) : (
            <Table>
              <TableHeader><TableRow>
                <TableHead>Agent</TableHead><TableHead>Platform</TableHead>
                <TableHead>Customer</TableHead><TableHead>Phone</TableHead>
                <TableHead>Description</TableHead><TableHead className="w-32 text-right">Actions</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {voice.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No voice agents yet. Click “New Voice Agent”.</TableCell></TableRow>
                ) : voice.map((a: any) => {
                  const c = (clients as any[]).find(x => x.id === a.client_id);
                  const pn = (assignments as any[]).find(x => x.voice_agent_id === a.id);
                  const num = (numbers as any[]).find(x => x.id === pn?.phone_number_id);
                  return (
                    <TableRow key={a.id}>
                      <TableCell className="font-medium">{a.name}</TableCell>
                      <TableCell><Badge variant="outline">{a.platform}</Badge></TableCell>
                      <TableCell className="text-sm">{c ? (<span className="inline-flex items-center gap-1"><Users className="w-3 h-3" />{c.name}</span>) : <span className="text-muted-foreground">—</span>}</TableCell>
                      <TableCell className="font-mono text-sm">{num ? (<span className="inline-flex items-center gap-1"><Phone className="w-3 h-3" />{num.phone_number}</span>) : <span className="text-muted-foreground">—</span>}</TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-xs truncate">{a.description || '—'}</TableCell>
                      <TableCell className="text-right">
                        <Button size="icon" variant="ghost" onClick={() => openEdit(a)}><Pencil className="w-4 h-4" /></Button>
                        <Button size="icon" variant="ghost" onClick={() => { if (confirm(`Delete ${a.name}?`)) deleteMut.mutate(a.id); }}><Trash2 className="w-4 h-4" /></Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editing ? 'Edit Voice Agent' : 'New Voice Agent'}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Name *</Label>
              <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. Acme Reception" />
            </div>
            <div>
              <Label>Platform</Label>
              <Select value={form.platform} onValueChange={(v) => setForm({ ...form, platform: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PLATFORMS.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Platform Agent ID</Label>
              <Input value={form.platform_agent_id} onChange={e => setForm({ ...form, platform_agent_id: e.target.value })} placeholder="External provider agent id" />
            </div>
            <div>
              <Label>Customer</Label>
              <Select value={form.client_id || 'none'} onValueChange={(v) => setForm({ ...form, client_id: v === 'none' ? '' : v })}>
                <SelectTrigger><SelectValue placeholder="No customer" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No customer</SelectItem>
                  {(clients as any[]).map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Phone Number (route DID to this agent)</Label>
              <Select value={form.phone_number_id || 'none'} onValueChange={(v) => setForm({ ...form, phone_number_id: v === 'none' ? '' : v })}>
                <SelectTrigger><SelectValue placeholder="No phone number" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No phone number</SelectItem>
                  {(numbers as any[]).map(n => <SelectItem key={n.id} value={n.id}>{n.phone_number} {n.friendly_name ? `(${n.friendly_name})` : ''}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Description</Label>
              <Textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={() => saveMut.mutate()} disabled={saveMut.isPending}>
              {saveMut.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              {editing ? 'Save changes' : 'Create agent'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <CreateAgentWizard
        open={wizardOpen}
        onOpenChange={(o) => {
          setWizardOpen(o);
          if (!o) qc.invalidateQueries({ queryKey: ['pbx'] });
        }}
      />
    </div>
  );
}
