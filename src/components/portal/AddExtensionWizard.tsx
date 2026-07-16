import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

type Step = 1 | 2 | 3 | 4 | 5;

export function AddExtensionWizard({ open, onOpenChange, onCreated }: {
  open: boolean; onOpenChange: (v: boolean) => void; onCreated?: () => void;
}) {
  const [step, setStep] = useState<Step>(1);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    firstName: '', lastName: '', email: '', extension: '', displayName: '',
    cidName: '', cidNumber: '', timeout: 30, recording: 'none',
    voicemail: true, vmPin: '1234', vmEmail: true, vmTranscribe: true,
    fwdAll: '', fwdBusy: '', fwdNoAns: '', noAnsRing: 20,
    softphone: true, sendWelcome: true,
  });
  const set = (k: keyof typeof form, v: any) => setForm(f => ({ ...f, [k]: v }));

  useEffect(() => { if (!open) setStep(1); }, [open]);

  const submit = async () => {
    setBusy(true);
    try {
      const { error } = await supabase.functions.invoke('fusionpbx-proxy', {
        body: { action: 'create-extension', payload: form },
      });
      if (error) throw error;
      toast.success(`Extension ${form.extension} created`);
      onCreated?.();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message ?? 'Failed to create extension');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Add Extension — Step {step} of 5</DialogTitle>
        </DialogHeader>

        {step === 1 && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div><Label>First name</Label><Input value={form.firstName} onChange={e => set('firstName', e.target.value)} /></div>
              <div><Label>Last name</Label><Input value={form.lastName} onChange={e => set('lastName', e.target.value)} /></div>
            </div>
            <div><Label>Email</Label><Input type="email" value={form.email} onChange={e => set('email', e.target.value)} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Extension #</Label><Input value={form.extension} onChange={e => set('extension', e.target.value)} /></div>
              <div><Label>Display name</Label><Input value={form.displayName} onChange={e => set('displayName', e.target.value)} /></div>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-3">
            <div><Label>Outbound CID name</Label><Input value={form.cidName} onChange={e => set('cidName', e.target.value)} /></div>
            <div><Label>Outbound CID number</Label><Input value={form.cidNumber} onChange={e => set('cidNumber', e.target.value)} /></div>
            <div><Label>Call timeout (s)</Label>
              <Select value={String(form.timeout)} onValueChange={v => set('timeout', Number(v))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{[15, 20, 30, 45, 60].map(n => <SelectItem key={n} value={String(n)}>{n}s</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Call recording</Label>
              <Select value={form.recording} onValueChange={v => set('recording', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  <SelectItem value="inbound">Inbound</SelectItem>
                  <SelectItem value="outbound">Outbound</SelectItem>
                  <SelectItem value="all">All</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between"><Label>Enable voicemail</Label>
              <Switch checked={form.voicemail} onCheckedChange={v => set('voicemail', v)} /></div>
            <div><Label>Voicemail PIN</Label><Input value={form.vmPin} onChange={e => set('vmPin', e.target.value)} /></div>
            <div className="flex items-center justify-between"><Label>Email notification</Label>
              <Switch checked={form.vmEmail} onCheckedChange={v => set('vmEmail', v)} /></div>
            <div className="flex items-center justify-between"><Label>Transcription</Label>
              <Switch checked={form.vmTranscribe} onCheckedChange={v => set('vmTranscribe', v)} /></div>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-3">
            <div><Label>Forward all → number</Label><Input value={form.fwdAll} onChange={e => set('fwdAll', e.target.value)} /></div>
            <div><Label>Forward busy → number</Label><Input value={form.fwdBusy} onChange={e => set('fwdBusy', e.target.value)} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Forward no answer → number</Label><Input value={form.fwdNoAns} onChange={e => set('fwdNoAns', e.target.value)} /></div>
              <div><Label>Ring time (s)</Label><Input type="number" value={form.noAnsRing} onChange={e => set('noAnsRing', Number(e.target.value))} /></div>
            </div>
          </div>
        )}

        {step === 5 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between"><Label>Enable softphone</Label>
              <Switch checked={form.softphone} onCheckedChange={v => set('softphone', v)} /></div>
            <div className="flex items-center justify-between"><Label>Send welcome email with app downloads</Label>
              <Switch checked={form.sendWelcome} onCheckedChange={v => set('sendWelcome', v)} /></div>
            <p className="text-sm text-muted-foreground">
              A SIP password will be auto-generated. The portal account will be linked to {form.email || '(set email)'} so the user can sign in immediately.
            </p>
          </div>
        )}

        <DialogFooter className="flex justify-between">
          <Button variant="outline" disabled={step === 1 || busy} onClick={() => setStep((s) => (s - 1) as Step)}>Back</Button>
          {step < 5
            ? <Button onClick={() => setStep((s) => (s + 1) as Step)}>Next</Button>
            : <Button disabled={busy} onClick={submit}>{busy ? 'Creating…' : 'Create Extension'}</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
