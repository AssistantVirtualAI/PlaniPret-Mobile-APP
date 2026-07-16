import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Plus, Trash2, Loader2, PhoneForwarded, FileText, CheckCircle2, AlertCircle, Phone, PhoneCall, Hash, ListTree, Users } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

const fmtE164 = (n: string) => {
  if (!n) return n;
  const d = n.replace(/[^\d+]/g, '');
  if (d.startsWith('+1') && d.length === 12) return `+1 (${d.slice(2, 5)}) ${d.slice(5, 8)}-${d.slice(8)}`;
  return d;
};

const statusBadge = (status?: string) => {
  const s = (status || 'active').toLowerCase();
  if (s === 'available') return <Badge variant="secondary" className="gap-1"><CheckCircle2 className="w-3 h-3" />Available</Badge>;
  if (s === 'active' || s === 'assigned') return <Badge className="gap-1 bg-emerald-600 hover:bg-emerald-600/90"><PhoneCall className="w-3 h-3" />Assigned</Badge>;
  if (s === 'porting' || s === 'pending') return <Badge variant="outline" className="gap-1 text-amber-600 border-amber-600"><AlertCircle className="w-3 h-3" />{s}</Badge>;
  return <Badge variant="outline">{s}</Badge>;
};

const destIcon = (t?: string) => {
  if (t === 'extension') return <Phone className="w-3 h-3" />;
  if (t === 'ivr') return <ListTree className="w-3 h-3" />;
  if (t === 'ringgroup') return <Users className="w-3 h-3" />;
  return <Hash className="w-3 h-3" />;
};

export function PhoneNumbersTab({
  domainUuid, domainName, organizationId, extensions, ivrs, ringGroups,
}: {
  domainUuid: string; domainName: string; organizationId?: string;
  extensions: any[]; ivrs: any[]; ringGroups: any[];
}) {
  const qc = useQueryClient();
  const [assignOpen, setAssignOpen] = useState(false);
  const [portOpen, setPortOpen] = useState(false);

  const { data: assigned = [] } = useQuery({
    queryKey: ['phone_numbers', organizationId],
    enabled: !!organizationId,
    queryFn: async () => {
      const { data } = await (supabase as any).from('phone_numbers')
        .select('id,phone_number,friendly_name,status,metadata')
        .eq('organization_id', organizationId)
        .order('phone_number');
      return data || [];
    },
  });

  const { data: pool = [] } = useQuery({
    queryKey: ['phone_numbers', 'pool'],
    queryFn: async () => {
      const { data } = await (supabase as any).from('phone_numbers')
        .select('id,phone_number')
        .is('organization_id', null)
        .order('phone_number');
      return data || [];
    },
  });

  // Assign
  const [poolId, setPoolId] = useState('');
  const [destType, setDestType] = useState<'extension' | 'ivr' | 'ringgroup'>('extension');
  const [destValue, setDestValue] = useState('');
  const [assigning, setAssigning] = useState(false);

  const doAssign = async () => {
    const num = pool.find((p: any) => p.id === poolId);
    if (!num || !destValue) { toast.error('Select number + destination'); return; }
    setAssigning(true);
    try {
      const dialString = destType === 'extension'
        ? `${destValue} XML ${domainName}`
        : destType === 'ivr'
          ? `${destValue} XML ${domainName}`
          : `${destValue} XML ${domainName}`;
      const app = destType === 'ivr' ? 'menu_executor' : 'transfer';
      await supabase.functions.invoke('fusionpbx-proxy', {
        body: {
          action: 'create-destination',
          domain_uuid: domainUuid,
          destination_number: num.phone_number,
          destination_type: 'inbound',
          destination_app: app,
          destination_data: dialString,
          destination_enabled: 'true',
        },
      });
      await (supabase as any).from('phone_numbers').update({
        organization_id: organizationId,
        status: 'active',
        metadata: { destination_type: destType, destination_value: destValue },
      }).eq('id', poolId);
      toast.success('Number assigned');
      qc.invalidateQueries({ queryKey: ['phone_numbers'] });
      setAssignOpen(false); setPoolId(''); setDestValue('');
    } catch (e: any) {
      toast.error(e?.message || 'Failed');
    } finally { setAssigning(false); }
  };

  const release = async (row: any) => {
    if (!confirm(`Release ${row.phone_number}?`)) return;
    try {
      await supabase.functions.invoke('fusionpbx-proxy', {
        body: { action: 'delete-destination', domain_uuid: domainUuid, destination_number: row.phone_number },
      }).catch(() => {});
      await (supabase as any).from('phone_numbers').update({ organization_id: null, status: 'available', metadata: {} }).eq('id', row.id);
      toast.success('Released');
      qc.invalidateQueries({ queryKey: ['phone_numbers'] });
    } catch (e: any) { toast.error(e?.message || 'Failed'); }
  };

  // Lookup labels for destinations
  const destLabel = (t?: string, v?: string) => {
    if (!t || !v) return null;
    if (t === 'extension') {
      const e = extensions.find((x: any) => x.extension === v);
      return e?.effective_caller_id_name ? `${v} · ${e.effective_caller_id_name}` : v;
    }
    if (t === 'ivr') {
      const i = ivrs.find((x: any) => x.ivr_menu_extension === v);
      return i?.ivr_menu_name ? `${v} · ${i.ivr_menu_name}` : v;
    }
    if (t === 'ringgroup') {
      const r = ringGroups.find((x: any) => x.ring_group_extension === v);
      return r?.ring_group_name ? `${v} · ${r.ring_group_name}` : v;
    }
    return v;
  };

  const selectedPool = pool.find((p: any) => p.id === poolId);
  const destOk = !!destValue;
  const numOk = !!poolId;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1"><PhoneCall className="w-3 h-3 text-emerald-600" /> {assigned.length} assigned</span>
          <span className="flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> {pool.length} available in pool</span>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setPortOpen(true)}><FileText className="w-3 h-3 mr-1" />Request Port</Button>
          <Button size="sm" onClick={() => setAssignOpen(true)} disabled={pool.length === 0}><Plus className="w-3 h-3 mr-1" />Assign Number</Button>
        </div>
      </div>
      <Card><CardContent className="p-0">
        {assigned.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">No numbers assigned to this customer.</div>
        ) : (
          <Table>
            <TableHeader><TableRow>
              <TableHead>Number</TableHead><TableHead>Routes to</TableHead><TableHead>Status</TableHead><TableHead></TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {assigned.map((n: any) => (
                <TableRow key={n.id}>
                  <TableCell className="font-mono">{fmtE164(n.phone_number)}</TableCell>
                  <TableCell>
                    {n.metadata?.destination_type ? (
                      <span className="inline-flex items-center gap-1.5 text-xs">
                        {destIcon(n.metadata.destination_type)}
                        <span className="text-muted-foreground capitalize">{n.metadata.destination_type}:</span>
                        <span className="font-mono">{destLabel(n.metadata.destination_type, n.metadata.destination_value)}</span>
                      </span>
                    ) : <span className="text-xs text-muted-foreground">Unrouted</span>}
                  </TableCell>
                  <TableCell>{statusBadge(n.status)}</TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="ghost" onClick={() => release(n)} title="Release number"><Trash2 className="w-3 h-3" /></Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent></Card>

      <Dialog open={assignOpen} onOpenChange={setAssignOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Assign phone number</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="rounded-lg border bg-muted/30 p-3 text-xs flex items-center gap-3">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <div>
                <div className="font-medium text-foreground">{pool.length} number{pool.length === 1 ? '' : 's'} available</div>
                <div className="text-muted-foreground">{assigned.length} already assigned to this customer</div>
              </div>
            </div>

            <div>
              <Label>Step 1 — Choose number {numOk && <CheckCircle2 className="inline w-3 h-3 text-emerald-600 ml-1" />}</Label>
              <Select value={poolId} onValueChange={setPoolId}>
                <SelectTrigger><SelectValue placeholder={pool.length === 0 ? 'No numbers in pool' : 'Select…'} /></SelectTrigger>
                <SelectContent>{pool.map((p: any) => (
                  <SelectItem key={p.id} value={p.id}>
                    <span className="font-mono">{fmtE164(p.phone_number)}</span>
                  </SelectItem>
                ))}</SelectContent>
              </Select>
              {selectedPool && (
                <div className="mt-2 text-xs flex items-center gap-2">
                  <span className="font-mono">{fmtE164(selectedPool.phone_number)}</span>
                  {statusBadge('available')}
                </div>
              )}
            </div>

            <div>
              <Label>Step 2 — Route incoming calls to {destOk && <CheckCircle2 className="inline w-3 h-3 text-emerald-600 ml-1" />}</Label>
              <div className="grid grid-cols-2 gap-2">
                <Select value={destType} onValueChange={(v: any) => { setDestType(v); setDestValue(''); }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="extension">Extension ({extensions.length})</SelectItem>
                    <SelectItem value="ivr">IVR menu ({ivrs.length})</SelectItem>
                    <SelectItem value="ringgroup">Ring Group ({ringGroups.length})</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={destValue} onValueChange={setDestValue}>
                  <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                  <SelectContent>
                    {destType === 'extension' && extensions.map((e: any) => (
                      <SelectItem key={e.extension_uuid || e.extension} value={e.extension}>
                        {e.extension}{e.effective_caller_id_name ? ` · ${e.effective_caller_id_name}` : ''}
                      </SelectItem>
                    ))}
                    {destType === 'ivr' && ivrs.map((i: any) => (
                      <SelectItem key={i.ivr_menu_uuid} value={i.ivr_menu_extension}>{i.ivr_menu_extension} · {i.ivr_menu_name}</SelectItem>
                    ))}
                    {destType === 'ringgroup' && ringGroups.map((r: any) => (
                      <SelectItem key={r.ring_group_uuid} value={r.ring_group_extension}>{r.ring_group_extension} · {r.ring_group_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {(destType === 'extension' && extensions.length === 0) && <p className="text-xs text-amber-600 mt-1">No extensions yet — create one in the Users tab first.</p>}
              {(destType === 'ivr' && ivrs.length === 0) && <p className="text-xs text-amber-600 mt-1">No IVRs yet — create one in the IVR tab first.</p>}
              {(destType === 'ringgroup' && ringGroups.length === 0) && <p className="text-xs text-amber-600 mt-1">No ring groups yet — create one in the Ring Groups tab first.</p>}
            </div>

            {numOk && destOk && (
              <div className="rounded-lg border-2 border-primary/30 bg-primary/5 p-3 text-sm">
                <div className="text-xs text-muted-foreground mb-1">Preview</div>
                <div className="flex items-center gap-2 font-mono">
                  <PhoneCall className="w-4 h-4 text-emerald-600" />
                  <span>{fmtE164(selectedPool!.phone_number)}</span>
                  <PhoneForwarded className="w-4 h-4 text-muted-foreground" />
                  {destIcon(destType)}
                  <span>{destLabel(destType, destValue)}</span>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignOpen(false)}>Cancel</Button>
            <Button onClick={doAssign} disabled={assigning || !numOk || !destOk}>{assigning && <Loader2 className="w-3 h-3 mr-1 animate-spin" />}Confirm assignment</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <PortRequestDialog open={portOpen} onOpenChange={setPortOpen} organizationId={organizationId} domainUuid={domainUuid} />
    </div>
  );
}

function PortRequestDialog({ open, onOpenChange, organizationId, domainUuid }: { open: boolean; onOpenChange: (o: boolean) => void; organizationId?: string; domainUuid: string }) {
  const [numbers, setNumbers] = useState<string[]>(['']);
  const [carrier, setCarrier] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [pin, setPin] = useState('');
  const [authorizedName, setAuthorizedName] = useState('');
  const [street, setStreet] = useState('');
  const [city, setCity] = useState('');
  const [province, setProvince] = useState('QC');
  const [postal, setPostal] = useState('');
  const [desiredDate, setDesiredDate] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const minDate = (() => {
    const d = new Date();
    let n = 0; while (n < 10) { d.setDate(d.getDate() + 1); if (d.getDay() !== 0 && d.getDay() !== 6) n++; }
    return d.toISOString().slice(0, 10);
  })();

  const submit = async () => {
    const cleanNumbers = numbers.map(n => n.trim()).filter(Boolean);
    if (cleanNumbers.length === 0 || !carrier || !accountNumber || !authorizedName) {
      toast.error('Numbers, carrier, account, authorized name required'); return;
    }
    setSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { data, error } = await (supabase as any).from('number_porting_requests').insert({
        organization_id: organizationId,
        requested_by: user?.id,
        numbers: cleanNumbers,
        current_carrier: carrier,
        account_number: accountNumber,
        pin,
        service_address: { street, city, province, postal, authorized_name: authorizedName, desired_port_date: desiredDate },
        notes,
        status: 'pending',
      }).select().single();
      if (error) throw error;

      await supabase.functions.invoke('send-port-request-email', {
        body: {
          request_id: data.id,
          numbers: cleanNumbers, carrier, account_number: accountNumber,
          authorized_name: authorizedName, desired_port_date: desiredDate,
          service_address: { street, city, province, postal }, notes,
          domain_uuid: domainUuid,
        },
      }).catch(() => {});

      toast.success(`Port request submitted (#${data.id.slice(0, 8)})`);
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message || 'Failed');
    } finally { setSubmitting(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>Request number port</DialogTitle></DialogHeader>
        <div className="space-y-3 max-h-[70vh] overflow-y-auto pr-1">
          <div>
            <Label>Numbers to port</Label>
            {numbers.map((n, i) => (
              <div key={i} className="flex gap-2 mt-1">
                <Input value={n} onChange={e => { const x = [...numbers]; x[i] = e.target.value; setNumbers(x); }} placeholder="+15145551234" />
                <Button size="icon" variant="ghost" onClick={() => setNumbers(numbers.filter((_, j) => j !== i))}><Trash2 className="w-3 h-3" /></Button>
              </div>
            ))}
            <Button size="sm" variant="outline" className="mt-1" onClick={() => setNumbers([...numbers, ''])}><Plus className="w-3 h-3 mr-1" />Add number</Button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label>Current carrier *</Label><Input value={carrier} onChange={e => setCarrier(e.target.value)} /></div>
            <div><Label>Account number *</Label><Input value={accountNumber} onChange={e => setAccountNumber(e.target.value)} /></div>
            <div><Label>Account PIN</Label><Input value={pin} onChange={e => setPin(e.target.value)} /></div>
            <div><Label>Authorized name *</Label><Input value={authorizedName} onChange={e => setAuthorizedName(e.target.value)} /></div>
          </div>
          <div className="border rounded p-3 space-y-2">
            <Label>Service address</Label>
            <Input placeholder="Street" value={street} onChange={e => setStreet(e.target.value)} />
            <div className="grid grid-cols-3 gap-2">
              <Input placeholder="City" value={city} onChange={e => setCity(e.target.value)} />
              <Input placeholder="Province" value={province} onChange={e => setProvince(e.target.value)} />
              <Input placeholder="Postal code" value={postal} onChange={e => setPostal(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label>Desired port date</Label><Input type="date" min={minDate} value={desiredDate} onChange={e => setDesiredDate(e.target.value)} /></div>
          </div>
          <div><Label>Notes</Label><Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={submitting}>{submitting && <Loader2 className="w-3 h-3 mr-1 animate-spin" />}Submit request</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
