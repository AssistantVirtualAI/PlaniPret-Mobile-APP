import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Trash2, Loader2, ArrowUp, ArrowDown } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

type Strategy = 'simultaneous' | 'sequence' | 'random' | 'enterprise' | 'rollover';
type Member = { extension: string; delay: number; timeout: number };

export function RingGroupCreateDialog({
  open, onOpenChange, domainUuid, domainName, extensions, onCreated,
}: {
  open: boolean; onOpenChange: (o: boolean) => void;
  domainUuid: string; domainName: string;
  extensions: any[]; onCreated: () => void;
}) {
  const [name, setName] = useState('Équipe Ventes');
  const [ext, setExt] = useState('9000');
  const [strategy, setStrategy] = useState<Strategy>('simultaneous');
  const [members, setMembers] = useState<Member[]>([]);
  const [timeoutDest, setTimeoutDest] = useState('voicemail');
  const [timeoutValue, setTimeoutValue] = useState('');
  const [saving, setSaving] = useState(false);

  const destinationNumber = () => {
    if (timeoutDest === 'voicemail') return `*99${timeoutValue || ext}`;
    return timeoutValue;
  };

  const move = (i: number, dir: -1 | 1) => {
    const n = [...members];
    const j = i + dir;
    if (j < 0 || j >= n.length) return;
    [n[i], n[j]] = [n[j], n[i]];
    setMembers(n);
  };

  const save = async () => {
    if (!name || !ext) { toast.error('Name + extension required'); return; }
    setSaving(true);
    try {
      const { error } = await supabase.functions.invoke('fusionpbx-proxy', {
        body: {
          action: 'create-ring-group',
          domain_uuid: domainUuid,
          ring_group_name: name,
          ring_group_extension: ext,
          ring_group_strategy: strategy,
          ring_group_timeout_app: 'transfer',
          ring_group_timeout_data: `${destinationNumber()} XML ${domainName}`,
          ring_group_enabled: 'true',
          ring_group_members: members.map((m, i) => ({
            destination_number: m.extension,
            destination_delay: strategy === 'sequence' ? i * 10 : m.delay,
            destination_timeout: m.timeout,
            destination_prompt: '',
            destination_enabled: 'true',
          })),
        },
      });
      if (error) throw error;
      toast.success('Ring group created');
      onCreated();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message || 'Failed');
    } finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>New Ring Group</DialogTitle></DialogHeader>
        <div className="space-y-3 max-h-[70vh] overflow-y-auto pr-1">
          <div className="grid grid-cols-2 gap-2">
            <div><Label>Name *</Label><Input value={name} onChange={e => setName(e.target.value)} /></div>
            <div><Label>Extension *</Label><Input value={ext} onChange={e => setExt(e.target.value)} /></div>
          </div>
          <div>
            <Label>Strategy</Label>
            <Select value={strategy} onValueChange={(v: any) => setStrategy(v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="simultaneous">Simultaneous</SelectItem>
                <SelectItem value="sequence">Sequential</SelectItem>
                <SelectItem value="random">Random</SelectItem>
                <SelectItem value="rollover">Rollover</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Members ({members.length})</Label>
              <Button size="sm" variant="outline" onClick={() => setMembers([...members, { extension: '', delay: 0, timeout: 30 }])}>
                <Plus className="w-3 h-3 mr-1" /> Add member
              </Button>
            </div>
            {members.map((m, i) => (
              <div key={i} className="grid grid-cols-[1fr_80px_80px_auto] gap-2 items-end border rounded p-2">
                <div>
                  <Label className="text-xs">Extension</Label>
                  <Select value={m.extension} onValueChange={v => { const n = [...members]; n[i].extension = v; setMembers(n); }}>
                    <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                    <SelectContent>{extensions.map((e: any) => (
                      <SelectItem key={e.extension_uuid || e.extension} value={e.extension}>{e.extension} {e.effective_caller_id_name ? `· ${e.effective_caller_id_name}` : ''}</SelectItem>
                    ))}</SelectContent>
                  </Select>
                </div>
                <div><Label className="text-xs">Delay</Label><Input type="number" value={m.delay} onChange={e => { const n = [...members]; n[i].delay = +e.target.value; setMembers(n); }} /></div>
                <div><Label className="text-xs">Timeout</Label><Input type="number" value={m.timeout} onChange={e => { const n = [...members]; n[i].timeout = +e.target.value; setMembers(n); }} /></div>
                <div className="flex gap-1">
                  {strategy === 'sequence' && <>
                    <Button size="icon" variant="ghost" onClick={() => move(i, -1)}><ArrowUp className="w-3 h-3" /></Button>
                    <Button size="icon" variant="ghost" onClick={() => move(i, 1)}><ArrowDown className="w-3 h-3" /></Button>
                  </>}
                  <Button size="icon" variant="ghost" onClick={() => setMembers(members.filter((_, j) => j !== i))}><Trash2 className="w-3 h-3" /></Button>
                </div>
              </div>
            ))}
          </div>

          <div className="border rounded-lg p-3 space-y-2">
            <Label>No-answer destination</Label>
            <div className="grid grid-cols-2 gap-2">
              <Select value={timeoutDest} onValueChange={setTimeoutDest}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="voicemail">Voicemail</SelectItem>
                  <SelectItem value="extension">Extension</SelectItem>
                </SelectContent>
              </Select>
              <Input placeholder={timeoutDest === 'voicemail' ? `vm ${ext}` : 'extension'} value={timeoutValue} onChange={e => setTimeoutValue(e.target.value)} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={saving}>{saving && <Loader2 className="w-3 h-3 mr-1 animate-spin" />}Create</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
