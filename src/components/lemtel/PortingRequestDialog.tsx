import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export default function PortingRequestDialog({
  open, onOpenChange, organizationId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  organizationId: string;
}) {
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    current_carrier: '', account_number: '', pin: '',
    numbers: '', street: '', city: '', state: '', zip: '', notes: '',
  });

  const submit = async () => {
    if (!form.current_carrier || !form.account_number || !form.numbers) {
      toast.error('Carrier, account #, and at least one number are required');
      return;
    }
    setBusy(true);
    const { data: u } = await supabase.auth.getUser();
    const { error } = await (supabase as any).from('number_porting_requests').insert({
      organization_id: organizationId,
      requested_by: u.user?.id,
      current_carrier: form.current_carrier.trim(),
      account_number: form.account_number.trim(),
      pin: form.pin.trim() || null,
      numbers: form.numbers.split(/[,\s]+/).map(s => s.trim()).filter(Boolean),
      service_address: {
        street: form.street, city: form.city, state: form.state, zip: form.zip,
      },
      notes: form.notes.trim() || null,
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success('Porting request submitted');
    onOpenChange(false);
    setForm({ current_carrier: '', account_number: '', pin: '', numbers: '', street: '', city: '', state: '', zip: '', notes: '' });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Request number porting</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2"><Label>Current carrier *</Label><Input value={form.current_carrier} onChange={e => setForm({ ...form, current_carrier: e.target.value })} /></div>
          <div><Label>Account number *</Label><Input value={form.account_number} onChange={e => setForm({ ...form, account_number: e.target.value })} /></div>
          <div><Label>PIN / passcode</Label><Input value={form.pin} onChange={e => setForm({ ...form, pin: e.target.value })} /></div>
          <div className="col-span-2"><Label>Numbers to port *</Label><Textarea value={form.numbers} onChange={e => setForm({ ...form, numbers: e.target.value })} placeholder="+15145551234, +15145555678" rows={2} /></div>
          <div className="col-span-2"><Label>Service street</Label><Input value={form.street} onChange={e => setForm({ ...form, street: e.target.value })} /></div>
          <div><Label>City</Label><Input value={form.city} onChange={e => setForm({ ...form, city: e.target.value })} /></div>
          <div><Label>State / province</Label><Input value={form.state} onChange={e => setForm({ ...form, state: e.target.value })} /></div>
          <div><Label>ZIP / postal</Label><Input value={form.zip} onChange={e => setForm({ ...form, zip: e.target.value })} /></div>
          <div className="col-span-2"><Label>Notes</Label><Textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} rows={2} /></div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={busy}>{busy ? 'Submitting…' : 'Submit request'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
