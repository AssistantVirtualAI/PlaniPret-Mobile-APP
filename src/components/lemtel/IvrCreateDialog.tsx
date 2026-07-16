import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Trash2, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

type DestType = 'extension' | 'ringgroup' | 'queue' | 'voicemail' | 'menu-top' | 'menu-exec-app';
type Option = { digit: string; label: string; destType: DestType; destValue: string };

export function IvrCreateDialog({
  open, onOpenChange, domainUuid, domainName, extensions, ringGroups, queues, onCreated,
}: {
  open: boolean; onOpenChange: (o: boolean) => void;
  domainUuid: string; domainName: string;
  extensions: any[]; ringGroups: any[]; queues: any[];
  onCreated: () => void;
}) {
  const [name, setName] = useState('Menu Principal');
  const [ext, setExt] = useState('8000');
  const [desc, setDesc] = useState('');
  const [greetingText, setGreetingText] = useState('Bonjour, vous avez joint notre entreprise.');
  const [lang, setLang] = useState('fr');
  const [maxRetries, setMaxRetries] = useState(3);
  const [timeout, setTimeoutSec] = useState(5);
  const [timeoutDestType, setTimeoutDestType] = useState<DestType>('voicemail');
  const [timeoutDestValue, setTimeoutDestValue] = useState('');
  const [options, setOptions] = useState<Option[]>([
    { digit: '1', label: 'Ventes', destType: 'extension', destValue: '' },
  ]);
  const [saving, setSaving] = useState(false);
  const [previewing, setPreviewing] = useState(false);

  const destinationParam = (t: DestType, v: string) => {
    if (t === 'voicemail') return `transfer *99${v || ext} XML ${domainName}`;
    if (t === 'menu-top') return 'menu-top';
    if (t === 'menu-exec-app') return v;
    return `transfer ${v} XML ${domainName}`;
  };
  const actionFor = (t: DestType) => (t === 'menu-top' ? 'menu-top' : 'menu-exec-app');

  const previewTts = async () => {
    setPreviewing(true);
    try {
      const { data, error } = await supabase.functions.invoke('elevenlabs-tts', {
        body: { text: greetingText, voice_id: lang === 'fr' ? 'FGY2WhTYpPnrIDTdsKH5' : 'EXAVITQu4vr4xnSDxMaL' },
      });
      if (error) throw error;
      const b64 = (data as any)?.audioContent || (data as any)?.audio;
      if (b64) new Audio(`data:audio/mpeg;base64,${b64}`).play();
      else throw new Error('No audio returned');
    } catch (e: any) {
      // Fallback to browser TTS
      const u = new SpeechSynthesisUtterance(greetingText);
      u.lang = lang === 'fr' ? 'fr-CA' : 'en-US';
      speechSynthesis.speak(u);
    } finally { setPreviewing(false); }
  };

  const save = async () => {
    if (!name || !ext) { toast.error('Name + extension required'); return; }
    setSaving(true);
    try {
      const { data, error } = await supabase.functions.invoke('fusionpbx-proxy', {
        body: {
          action: 'create-ivr',
          domain_uuid: domainUuid,
          ivr_menu_name: name,
          ivr_menu_extension: ext,
          ivr_menu_description: desc,
          ivr_menu_greet_long: greetingText,
          ivr_menu_greet_short: greetingText,
          ivr_menu_timeout: timeout * 1000,
          ivr_menu_max_failures: maxRetries,
          ivr_menu_max_timeouts: maxRetries,
          ivr_menu_exit_app: 'transfer',
          ivr_menu_exit_data: destinationParam(timeoutDestType, timeoutDestValue),
          ivr_menu_enabled: 'true',
        },
      });
      if (error) throw error;
      const menuUuid = (data as any)?.ivr_menu_uuid || (data as any)?.uuid || (data as any)?.data?.uuid;
      // Create options sequentially
      for (let i = 0; i < options.length; i++) {
        const o = options[i];
        if (!o.digit || !o.destValue) continue;
        await supabase.functions.invoke('fusionpbx-proxy', {
          body: {
            action: 'create-ivr-option',
            domain_uuid: domainUuid,
            ivr_menu_uuid: menuUuid,
            ivr_menu_option_digits: o.digit,
            ivr_menu_option_action: actionFor(o.destType),
            ivr_menu_option_param: destinationParam(o.destType, o.destValue),
            ivr_menu_option_description: o.label,
            ivr_menu_option_order: String(i),
          },
        });
      }
      toast.success('IVR created');
      onCreated();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message || 'Failed to create IVR');
    } finally { setSaving(false); }
  };

  const DestSelect = ({ t, v, onT, onV }: any) => (
    <div className="grid grid-cols-2 gap-2">
      <Select value={t} onValueChange={onT}>
        <SelectTrigger><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="extension">Extension</SelectItem>
          <SelectItem value="ringgroup">Ring Group</SelectItem>
          <SelectItem value="queue">Queue</SelectItem>
          <SelectItem value="voicemail">Voicemail</SelectItem>
          <SelectItem value="menu-top">Repeat menu</SelectItem>
        </SelectContent>
      </Select>
      {t === 'extension' ? (
        <Select value={v} onValueChange={onV}>
          <SelectTrigger><SelectValue placeholder="Select extension" /></SelectTrigger>
          <SelectContent>{extensions.map((e: any) => (
            <SelectItem key={e.extension_uuid || e.extension} value={e.extension}>{e.extension} {e.effective_caller_id_name ? `· ${e.effective_caller_id_name}` : ''}</SelectItem>
          ))}</SelectContent>
        </Select>
      ) : t === 'ringgroup' ? (
        <Select value={v} onValueChange={onV}>
          <SelectTrigger><SelectValue placeholder="Select ring group" /></SelectTrigger>
          <SelectContent>{ringGroups.map((r: any) => (
            <SelectItem key={r.ring_group_uuid} value={r.ring_group_extension}>{r.ring_group_extension} · {r.ring_group_name}</SelectItem>
          ))}</SelectContent>
        </Select>
      ) : t === 'queue' ? (
        <Select value={v} onValueChange={onV}>
          <SelectTrigger><SelectValue placeholder="Select queue" /></SelectTrigger>
          <SelectContent>{queues.map((q: any) => (
            <SelectItem key={q.call_center_queue_uuid || q.queue_uuid} value={q.queue_extension}>{q.queue_extension} · {q.queue_name}</SelectItem>
          ))}</SelectContent>
        </Select>
      ) : t === 'voicemail' ? (
        <Input placeholder="extension #" value={v} onChange={e => onV(e.target.value)} />
      ) : <Input disabled value="—" />}
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>New IVR menu</DialogTitle></DialogHeader>
        <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
          <div className="grid grid-cols-2 gap-2">
            <div><Label>Name *</Label><Input value={name} onChange={e => setName(e.target.value)} /></div>
            <div><Label>Extension *</Label><Input value={ext} onChange={e => setExt(e.target.value)} /></div>
          </div>
          <div><Label>Description</Label><Input value={desc} onChange={e => setDesc(e.target.value)} /></div>
          <div className="border rounded-lg p-3 space-y-2">
            <Label>Greeting (text-to-speech)</Label>
            <Textarea value={greetingText} onChange={e => setGreetingText(e.target.value)} rows={3} />
            <div className="flex gap-2 items-center">
              <Select value={lang} onValueChange={setLang}>
                <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="fr">Français</SelectItem><SelectItem value="en">English</SelectItem></SelectContent>
              </Select>
              <Button size="sm" variant="outline" onClick={previewTts} disabled={previewing}>
                {previewing ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Preview'}
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Menu options ({options.length}/12)</Label>
              <Button size="sm" variant="outline" onClick={() => options.length < 12 && setOptions([...options, { digit: String(options.length + 1), label: '', destType: 'extension', destValue: '' }])}>
                <Plus className="w-3 h-3 mr-1" /> Add option
              </Button>
            </div>
            {options.map((o, i) => (
              <div key={i} className="border rounded p-2 space-y-2">
                <div className="grid grid-cols-[60px_1fr_auto] gap-2 items-end">
                  <div><Label className="text-xs">Digit</Label><Input value={o.digit} onChange={e => { const n = [...options]; n[i].digit = e.target.value; setOptions(n); }} /></div>
                  <div><Label className="text-xs">Label</Label><Input value={o.label} onChange={e => { const n = [...options]; n[i].label = e.target.value; setOptions(n); }} /></div>
                  <Button size="icon" variant="ghost" onClick={() => setOptions(options.filter((_, j) => j !== i))}><Trash2 className="w-3 h-3" /></Button>
                </div>
                <DestSelect t={o.destType} v={o.destValue}
                  onT={(t: DestType) => { const n = [...options]; n[i].destType = t; n[i].destValue = ''; setOptions(n); }}
                  onV={(v: string) => { const n = [...options]; n[i].destValue = v; setOptions(n); }}
                />
              </div>
            ))}
          </div>

          <div className="border rounded-lg p-3 space-y-2">
            <Label>Timeout / failure</Label>
            <div className="grid grid-cols-2 gap-2">
              <div><Label className="text-xs">Max retries</Label><Input type="number" value={maxRetries} onChange={e => setMaxRetries(+e.target.value || 3)} /></div>
              <div><Label className="text-xs">Timeout (sec)</Label><Input type="number" value={timeout} onChange={e => setTimeoutSec(+e.target.value || 5)} /></div>
            </div>
            <Label className="text-xs">On timeout → destination</Label>
            <DestSelect t={timeoutDestType} v={timeoutDestValue} onT={setTimeoutDestType} onV={setTimeoutDestValue} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={saving}>{saving && <Loader2 className="w-3 h-3 mr-1 animate-spin" />}Create IVR</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
