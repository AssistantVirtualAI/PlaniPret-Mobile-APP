import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Plug, Plus, Loader2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

const LEMTEL_ORG = '71755d33-ed64-4ad5-a828-61c9d2029eb7';

export default function LemtelVoiceGateways() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ pbxGatewayUuid: '', did: '', agentId: '', direction: 'both' });

  const { data: routes = [], isLoading } = useQuery({
    queryKey: ['voice-agent-routes', LEMTEL_ORG],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('elevenlabs-phone-numbers', {
        body: { action: 'list_routes', organizationId: LEMTEL_ORG },
      });
      if (error) throw error;
      return data?.routes || [];
    },
  });

  const { data: gateways = [] } = useQuery({
    queryKey: ['pbx-gateways-select'],
    queryFn: async () => {
      const { data } = await (supabase as any).from('pbx_gateways').select('pbx_uuid,name,proxy').order('name');
      return data || [];
    },
  });

  const { data: agents = [] } = useQuery({
    queryKey: ['agents-select', LEMTEL_ORG],
    queryFn: async () => {
      const { data } = await supabase.from('agents').select('id,name,platform_agent_id,platform').eq('organization_id', LEMTEL_ORG).eq('platform', 'elevenlabs');
      return data || [];
    },
  });

  const createMut = useMutation({
    mutationFn: async () => {
      const agent = agents.find((a: any) => a.id === form.agentId);
      const { data, error } = await supabase.functions.invoke('elevenlabs-phone-numbers', {
        body: {
          action: 'create_sip_trunk_via_pbx',
          organizationId: LEMTEL_ORG,
          pbxGatewayUuid: form.pbxGatewayUuid,
          did: form.did,
          agentId: agent?.platform_agent_id,
          direction: form.direction,
        },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      return data;
    },
    onSuccess: () => {
      toast.success('SIP trunk created');
      setOpen(false);
      qc.invalidateQueries({ queryKey: ['voice-agent-routes'] });
    },
    onError: (e: any) => toast.error(e?.message || 'Failed'),
  });

  const overrideMut = useMutation({
    mutationFn: async ({ phoneNumberId, agentId }: { phoneNumberId: string; agentId: string }) => {
      const agent = agents.find((a: any) => a.id === agentId);
      const { data, error } = await supabase.functions.invoke('elevenlabs-phone-numbers', {
        body: { action: 'assign_agent', phoneNumberId, agentId: agent?.platform_agent_id, organizationId: LEMTEL_ORG },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success('Agent re-bound');
      qc.invalidateQueries({ queryKey: ['voice-agent-routes'] });
    },
    onError: (e: any) => toast.error(e?.message || 'Failed'),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2"><Plug className="w-7 h-7" /> Voice Gateways</h1>
          <p className="text-sm text-muted-foreground">Bind ElevenLabs voice agents to FusionPBX SIP gateways.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => qc.invalidateQueries({ queryKey: ['voice-agent-routes'] })}>
            <RefreshCw className="w-4 h-4 mr-2" /> Refresh
          </Button>
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild><Button><Plus className="w-4 h-4 mr-2" /> Create SIP Trunk</Button></SheetTrigger>
            <SheetContent className="space-y-4">
              <SheetHeader><SheetTitle>Provision ElevenLabs SIP trunk</SheetTitle></SheetHeader>
              <div className="space-y-3">
                <div>
                  <Label>FusionPBX Gateway</Label>
                  <Select value={form.pbxGatewayUuid} onValueChange={(v) => setForm({ ...form, pbxGatewayUuid: v })}>
                    <SelectTrigger><SelectValue placeholder="Select gateway" /></SelectTrigger>
                    <SelectContent>
                      {gateways.map((g: any) => (
                        <SelectItem key={g.pbx_uuid} value={g.pbx_uuid}>{g.name} — {g.proxy}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>DID (E.164)</Label>
                  <Input value={form.did} onChange={(e) => setForm({ ...form, did: e.target.value })} placeholder="+15145551234" />
                </div>
                <div>
                  <Label>Voice Agent</Label>
                  <Select value={form.agentId} onValueChange={(v) => setForm({ ...form, agentId: v })}>
                    <SelectTrigger><SelectValue placeholder="Select agent" /></SelectTrigger>
                    <SelectContent>
                      {agents.map((a: any) => (
                        <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Direction</Label>
                  <Select value={form.direction} onValueChange={(v) => setForm({ ...form, direction: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="inbound">Inbound</SelectItem>
                      <SelectItem value="outbound">Outbound</SelectItem>
                      <SelectItem value="both">Both</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button disabled={createMut.isPending || !form.pbxGatewayUuid || !form.did || !form.agentId} onClick={() => createMut.mutate()} className="w-full">
                  {createMut.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                  Provision
                </Button>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>

      <Card>
        <CardHeader><CardTitle>{routes.length} active route{routes.length === 1 ? '' : 's'}</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="py-8 flex justify-center"><Loader2 className="animate-spin" /></div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>DID</TableHead>
                  <TableHead>Gateway</TableHead>
                  <TableHead>Agent</TableHead>
                  <TableHead>Direction</TableHead>
                  <TableHead>Binding</TableHead>
                  <TableHead className="text-right">Override</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {routes.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No voice gateway routes yet. Create one above.</TableCell></TableRow>
                ) : routes.map((r: any) => {
                  const gw = gateways.find((g: any) => g.pbx_uuid === r.pbx_gateway_uuid);
                  const agent = agents.find((a: any) => a.id === r.agent_id);
                  return (
                    <TableRow key={r.id}>
                      <TableCell className="font-mono">{r.did_e164}</TableCell>
                      <TableCell>{gw?.name || '—'}</TableCell>
                      <TableCell>{agent?.name || r.agent_id || '—'}</TableCell>
                      <TableCell><Badge variant="outline">{r.direction}</Badge></TableCell>
                      <TableCell>
                        {r.manual_override
                          ? <Badge variant="secondary">Manual</Badge>
                          : <Badge>Auto</Badge>}
                      </TableCell>
                      <TableCell className="text-right">
                        <Select onValueChange={(v) => overrideMut.mutate({ phoneNumberId: r.elevenlabs_phone_id, agentId: v })}>
                          <SelectTrigger className="w-40 ml-auto"><SelectValue placeholder="Re-bind agent" /></SelectTrigger>
                          <SelectContent>
                            {agents.map((a: any) => (
                              <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
