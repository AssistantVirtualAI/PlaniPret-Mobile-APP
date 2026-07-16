import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Plus, Trash2, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

type Agent = { extension: string; level: number };

export function QueueCreateDialog({
  open, onOpenChange, domainUuid, extensions, onCreated,
}: {
  open: boolean; onOpenChange: (o: boolean) => void;
  domainUuid: string; extensions: any[];
  onCreated: () => void;
}) {
  const [name, setName] = useState('Support Technique');
  const [ext, setExt] = useState('7000');
  const [strategy, setStrategy] = useState('ring-all');
  const [maxWait, setMaxWait] = useState(300);
  const [holdMusic, setHoldMusic] = useState('default');
  const [announce, setAnnounce] = useState(false);
  const [callback, setCallback] = useState(false);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!name || !ext) { toast.error('Name + extension required'); return; }
    setSaving(true);
    try {
      const { data, error } = await supabase.functions.invoke('fusionpbx-proxy', {
        body: {
          action: 'create-queue',
          domain_uuid: domainUuid,
          queue_name: name,
          queue_extension: ext,
          queue_strategy: strategy,
          queue_timeout_action: '',
          queue_max_wait_time: maxWait,
          queue_moh_sound: holdMusic === 'default' ? '$${hold_music}' : holdMusic,
          queue_announce_position: announce ? 'true' : 'false',
          queue_announce_sound: '',
          queue_callback_enabled: callback ? 'true' : 'false',
          queue_enabled: 'true',
        },
      });
      if (error) throw error;
      const qUuid = (data as any)?.call_center_queue_uuid || (data as any)?.uuid || (data as any)?.data?.uuid;
      // Add agents
      for (const a of agents) {
        if (!a.extension) continue;
        await supabase.functions.invoke('fusionpbx-proxy', {
          body: {
            action: 'create-queue-agent',
            domain_uuid: domainUuid,
            call_center_queue_uuid: qUuid,
            agent_name: a.extension,
            agent_contact: `user/${a.extension}@__domain__`,
            agent_tier_level: a.level,
            agent_tier_position: 1,
          },
        });
      }
      toast.success('Queue created');
      onCreated();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message || 'Failed');
    } finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>New Queue</DialogTitle></DialogHeader>
        <div className="space-y-3 max-h-[70vh] overflow-y-auto pr-1">
          <div className="grid grid-cols-2 gap-2">
            <div><Label>Name *</Label><Input value={name} onChange={e => setName(e.target.value)} /></div>
            <div><Label>Extension *</Label><Input value={ext} onChange={e => setExt(e.target.value)} /></div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Strategy</Label>
              <Select value={strategy} onValueChange={setStrategy}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ring-all">Ring All</SelectItem>
                  <SelectItem value="round-robin">Round Robin</SelectItem>
                  <SelectItem value="longest-idle-agent">Least Busy</SelectItem>
                  <SelectItem value="agent-with-least-talk-time">Least Talk Time</SelectItem>
                  <SelectItem value="top-down">Top Down</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>Max wait (sec)</Label><Input type="number" value={maxWait} onChange={e => setMaxWait(+e.target.value || 300)} /></div>
          </div>
          <div className="flex gap-6">
            <label className="flex items-center gap-2 text-sm"><Switch checked={announce} onCheckedChange={setAnnounce} />Announce position</label>
            <label className="flex items-center gap-2 text-sm"><Switch checked={callback} onCheckedChange={setCallback} />Callback option</label>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Agents ({agents.length})</Label>
              <Button size="sm" variant="outline" onClick={() => setAgents([...agents, { extension: '', level: 1 }])}>
                <Plus className="w-3 h-3 mr-1" /> Add agent
              </Button>
            </div>
            {agents.map((a, i) => (
              <div key={i} className="grid grid-cols-[1fr_120px_auto] gap-2 items-end border rounded p-2">
                <div>
                  <Label className="text-xs">Extension</Label>
                  <Select value={a.extension} onValueChange={v => { const n = [...agents]; n[i].extension = v; setAgents(n); }}>
                    <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                    <SelectContent>{extensions.map((e: any) => (
                      <SelectItem key={e.extension_uuid || e.extension} value={e.extension}>{e.extension} {e.effective_caller_id_name ? `· ${e.effective_caller_id_name}` : ''}</SelectItem>
                    ))}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Level</Label>
                  <Select value={String(a.level)} onValueChange={v => { const n = [...agents]; n[i].level = +v; setAgents(n); }}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">1 · Primary</SelectItem>
                      <SelectItem value="2">2 · Backup</SelectItem>
                      <SelectItem value="3">3 · Overflow</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button size="icon" variant="ghost" onClick={() => setAgents(agents.filter((_, j) => j !== i))}><Trash2 className="w-3 h-3" /></Button>
              </div>
            ))}
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
