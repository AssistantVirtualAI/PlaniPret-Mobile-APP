import { useState, useEffect, useMemo, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Voicemail, Plus, Sparkles, Volume2, Loader2, Mic, Save, Wand2, AlertCircle, RotateCcw, CheckCircle2, Upload, Trash2, CheckCheck } from 'lucide-react';
import {
  usePbxIvrs, usePbxIvrOptions, usePbxIvrAudio,
  usePbxExtensions, usePbxQueues, usePbxRingGroups, LEMTEL_ORG,
} from '@/hooks/usePbxData';
import { PbxRefreshButton } from '@/components/lemtel/PbxRefreshButton';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useOrganization } from '@/context/OrganizationContext';
import { useQueryClient } from '@tanstack/react-query';
import { usePbxRealtime } from '@/hooks/usePbxRealtime';

const VOICES = [
  { id: '21m00Tcm4TlvDq8ikWAM', name: 'Rachel · Calm Female (EN)' },
  { id: 'EXAVITQu4vr4xnSDxMaL', name: 'Sarah · Warm Female (EN/FR)' },
  { id: 'FGY2WhTYpPnrIDTdsKH5', name: 'Laura · Friendly Female (EN/FR)' },
  { id: 'XrExE9yKIg1WjnnlVkGX', name: 'Matilda · Soft Female (EN/FR)' },
  { id: 'Xb7hH8MSUJpSbSDYk0k2', name: 'Alice · British Female' },
  { id: 'cgSgspJ2msm6clMCkdW9', name: 'Jessica · Conversational' },
  { id: 'JBFqnCBsd6RMkjVDRZzb', name: 'George · Deep Male (EN/FR)' },
  { id: 'onwK4e9ZLuTAKqWW03F9', name: 'Daniel · Authoritative Male' },
  { id: 'nPczCjzI2devNBz1zQrb', name: 'Brian · Narrator Male' },
  { id: 'TX3LPaxmHKxFdv7VOQHJ', name: 'Liam · Young Male' },
  { id: 'IKne3meq5aSn9XLyUdCD', name: 'Charlie · Casual Male' },
];

const errorText = (e: any, fb: string) =>
  e?.message || e?.error_description || e?.details || e?.hint || fb;

export default function LemtelIVR() {
  const { selectedOrgId } = useOrganization();
  const orgId = selectedOrgId || LEMTEL_ORG;
  const qc = useQueryClient();
  const { data: ivrs = [], isLoading } = usePbxIvrs();
  const { data: extensions = [] } = usePbxExtensions();
  const { data: queues = [] } = usePbxQueues();
  const { data: ringGroups = [] } = usePbxRingGroups();
  usePbxRealtime(['pbx_ivrs', 'pbx_ivr_options', 'pbx_ivr_audio']);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = (ivrs as any[]).find(i => i.id === selectedId) || null;
  const { data: options = [] } = usePbxIvrOptions(selectedId);
  const { data: audios = [] } = usePbxIvrAudio(selectedId);
  const [syncingPbx, setSyncingPbx] = useState(false);
  const [autoSyncTried, setAutoSyncTried] = useState(false);

  useEffect(() => {
    if (!selectedId && ivrs.length > 0) setSelectedId((ivrs as any[])[0].id);
  }, [ivrs, selectedId]);

  const syncFromPbx = async () => {
    setSyncingPbx(true);
    try {
      await supabase.functions.invoke('fusionpbx-proxy', {
        body: { action: 'sync-all', resources: ['ivrs'], organization_id: orgId },
      });
      await supabase.functions.invoke('fusionpbx-proxy', {
        body: { action: 'sync-ivr-options', organization_id: orgId },
      });
      qc.invalidateQueries({ queryKey: ['pbx', 'pbx_ivrs'] });
      qc.invalidateQueries({ queryKey: ['pbx', 'pbx_ivr_options'] });
      toast.success('IVR menus & options synced');
    } catch (e: any) {
      toast.error(errorText(e, 'Sync failed'));
    } finally { setSyncingPbx(false); }
  };

  // Auto-sync once if IVR table is empty
  useEffect(() => {
    if (!isLoading && ivrs.length === 0 && !autoSyncTried) {
      setAutoSyncTried(true);
      syncFromPbx();
    }
  }, [isLoading, ivrs.length, autoSyncTried]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2"><Voicemail className="w-7 h-7" /> Auto-Attendant (IVR)</h1>
          <p className="text-muted-foreground">FusionPBX menus · ElevenLabs voices · uploadable greetings</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" onClick={syncFromPbx} disabled={syncingPbx}>
            {syncingPbx ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RotateCcw className="w-4 h-4 mr-2" />}
            Sync from PBX
          </Button>
          <PbxRefreshButton kind="config" />
          <NewIvrDialog orgId={orgId} onCreated={syncFromPbx} />
        </div>
      </div>

      {!isLoading && ivrs.length === 0 && (
        <Alert>
          <AlertCircle className="w-4 h-4" />
          <AlertDescription>No IVR menus found locally. Click <strong>Sync from PBX</strong> to import them.</AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-1">
          <CardHeader><CardTitle>Menus IVR ({ivrs.length})</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {isLoading ? <div className="flex justify-center py-4"><Loader2 className="animate-spin" /></div> :
              (ivrs as any[]).map(ivr => (
                <button key={ivr.id} onClick={() => setSelectedId(ivr.id)}
                  className={`w-full text-left p-3 rounded-lg border transition-colors ${selectedId === ivr.id ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/50'}`}>
                  <div className="font-medium text-sm">{ivr.name}</div>
                  <div className="text-xs text-muted-foreground">Ext {ivr.extension || '—'}</div>
                  {ivr.enabled === false && <Badge variant="outline" className="mt-1 text-xs">disabled</Badge>}
                </button>
              ))
            }
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          {selected ? (
            <IvrDetail
              ivr={selected}
              orgId={orgId}
              options={options as any[]}
              audios={audios as any[]}
              extensions={extensions as any[]}
              queues={queues as any[]}
              ringGroups={ringGroups as any[]}
              onAfterChange={() => {
                qc.invalidateQueries({ queryKey: ['pbx', 'pbx_ivr_options', selectedId] });
                qc.invalidateQueries({ queryKey: ['pbx', 'pbx_ivr_audio', selectedId] });
                qc.invalidateQueries({ queryKey: ['pbx', 'pbx_ivrs'] });
              }}
              onDeleted={() => setSelectedId(null)}
            />
          ) : (
            <CardContent className="py-16 text-center text-muted-foreground">Select an IVR to manage options and audio</CardContent>
          )}
        </Card>
      </div>
    </div>
  );
}

/* ============== New IVR Dialog ============== */
function NewIvrDialog({ orgId, onCreated }: { orgId: string; onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [ext, setExt] = useState('');
  const [busy, setBusy] = useState(false);
  const create = async () => {
    if (!name.trim() || !ext.trim()) return toast.error('Name & extension required');
    setBusy(true);
    try {
      const { error } = await supabase.functions.invoke('fusionpbx-proxy', {
        body: {
          organization_id: orgId, action: 'create-ivr',
          params: { ivr_menu_name: name, ivr_menu_extension: ext, ivr_menu_enabled: 'true', ivr_menu_description: name },
        },
      });
      if (error) throw error;
      toast.success('IVR created on PBX');
      setOpen(false); setName(''); setExt('');
      onCreated();
    } catch (e: any) { toast.error(errorText(e, 'Create failed')); }
    finally { setBusy(false); }
  };
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button><Plus className="w-4 h-4 mr-2" /> New IVR</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Create a new IVR menu</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Name</Label><Input value={name} onChange={e => setName(e.target.value)} /></div>
          <div><Label>Extension</Label><Input value={ext} onChange={e => setExt(e.target.value)} placeholder="e.g. 5000" /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={create} disabled={busy}>{busy && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Create on PBX</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ============== Detail Panel ============== */
function IvrDetail({ ivr, orgId, options, audios, extensions, queues, ringGroups, onAfterChange, onDeleted }: {
  ivr: any; orgId: string; options: any[]; audios: any[];
  extensions: any[]; queues: any[]; ringGroups: any[];
  onAfterChange: () => void; onDeleted: () => void;
}) {
  const deleteIvr = async () => {
    if (!ivr.pbx_uuid) return;
    if (!confirm(`Delete IVR "${ivr.name}"?`)) return;
    try {
      await supabase.functions.invoke('fusionpbx-proxy', {
        body: { organization_id: orgId, action: 'delete-ivr', params: { ivr_menu_uuid: ivr.pbx_uuid } },
      });
      await supabase.from('pbx_ivrs').delete().eq('id', ivr.id);
      toast.success('IVR deleted'); onDeleted(); onAfterChange();
    } catch (e: any) { toast.error(errorText(e, 'Delete failed')); }
  };

  const testIvr = async () => {
    const from = prompt('Test from which extension? (your phone)');
    if (!from) return;
    const { data: dom } = await (supabase as any).from('pbx_domains')
      .select('domain_name').eq('organization_id', orgId).maybeSingle();
    const domain_name = dom?.domain_name;
    if (!domain_name) return toast.error('No domain configured');
    const { data, error } = await supabase.functions.invoke('fusionpbx-proxy', {
      body: {
        organization_id: orgId, action: 'test-ivr',
        params: { ivr_extension: ivr.extension, from_extension: from, domain_name },
      },
    });
    if (error) return toast.error(error.message);
    if ((data as any)?.ok === false) return toast.error('Test call could not be placed');
    toast.success(`Calling ext ${from} to test IVR ${ivr.extension}`);
  };

  return (
    <>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>{ivr.name}</CardTitle>
            <p className="text-sm text-muted-foreground mt-1">Extension {ivr.extension || '—'} · {options.length} option{options.length !== 1 ? 's' : ''} · {audios.length} audio file{audios.length !== 1 ? 's' : ''}</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={testIvr}>Test call</Button>
            <Button variant="ghost" size="sm" onClick={deleteIvr} className="text-destructive">
              <Trash2 className="w-4 h-4 mr-1" /> Delete
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent>
        <Tabs defaultValue="options">
          <TabsList>
            <TabsTrigger value="options">Options ({options.length})</TabsTrigger>
            <TabsTrigger value="audio">Audio ({audios.length})</TabsTrigger>
            <TabsTrigger value="tts">TTS Studio</TabsTrigger>
          </TabsList>

          <TabsContent value="options" className="space-y-3 mt-4">
            <OptionsTab ivr={ivr} orgId={orgId} options={options}
              extensions={extensions} queues={queues} ringGroups={ringGroups}
              onAfterChange={onAfterChange} />
          </TabsContent>

          <TabsContent value="audio" className="space-y-3 mt-4">
            <AudioTab ivr={ivr} orgId={orgId} audios={audios} onAfterChange={onAfterChange} />
          </TabsContent>

          <TabsContent value="tts" className="space-y-3 mt-4">
            <TtsStudio ivr={ivr} orgId={orgId} onAfterChange={onAfterChange} />
          </TabsContent>
        </Tabs>
      </CardContent>
    </>
  );
}

/* ============== Options Tab ============== */
function OptionsTab({ ivr, orgId, options, extensions, queues, ringGroups, onAfterChange }: {
  ivr: any; orgId: string; options: any[];
  extensions: any[]; queues: any[]; ringGroups: any[];
  onAfterChange: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);

  const openCreate = () => { setEditing(null); setOpen(true); };
  const openEdit = (opt: any) => { setEditing(opt); setOpen(true); };

  const deleteOpt = async (opt: any) => {
    if (!confirm(`Delete digit "${opt.digit}"?`)) return;
    try {
      if (opt.pbx_uuid) {
        await supabase.functions.invoke('fusionpbx-proxy', {
          body: { organization_id: orgId, action: 'delete-ivr-option',
            params: { ivr_menu_option_uuid: opt.pbx_uuid } },
        });
      }
      await supabase.from('pbx_ivr_options').delete().eq('id', opt.id);
      toast.success('Option deleted'); onAfterChange();
    } catch (e: any) { toast.error(errorText(e, 'Delete failed')); }
  };

  const destLabel = (opt: any): string => {
    const t = opt.destination_type;
    const id = opt.destination_id;
    if (!id) return opt.description || '—';
    if (t === 'extension' || t === 'menu-exec-app') {
      const e = extensions.find(x => x.extension === id || x.pbx_uuid === id);
      return e ? `Ext ${e.extension}${e.display_name ? ' · ' + e.display_name : ''}` : `Ext ${id}`;
    }
    if (t === 'queue') {
      const q = queues.find(x => x.extension === id || x.pbx_uuid === id);
      return q ? `Queue ${q.name}` : `Queue ${id}`;
    }
    if (t === 'ring_group') {
      const g = ringGroups.find(x => x.extension === id || x.pbx_uuid === id);
      return g ? `Group ${g.name}` : `Group ${id}`;
    }
    return id;
  };

  return (
    <>
      <div className="flex items-center justify-between">
        <Label>Menu options (DTMF)</Label>
        <Button size="sm" variant="outline" onClick={openCreate} disabled={!ivr.pbx_uuid}>
          <Plus className="w-3 h-3 mr-1" /> Add option
        </Button>
      </div>
      {!ivr.pbx_uuid && (
        <Alert variant="destructive"><AlertCircle className="w-4 h-4" /><AlertDescription>This IVR is not yet linked to a FusionPBX record. Sync from PBX first.</AlertDescription></Alert>
      )}
      <div className="space-y-2">
        {options.length === 0 ? (
          <p className="text-sm text-muted-foreground">No options configured.</p>
        ) : options.map(opt => (
          <div key={opt.id} className="flex items-center gap-3 p-3 border rounded-lg bg-muted/30">
            <div className="w-10 h-10 rounded-full bg-primary text-primary-foreground font-bold flex items-center justify-center text-lg">{opt.digit}</div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium capitalize">{(opt.destination_type || '').replace('_', ' ') || 'destination'}</div>
              <div className="text-xs text-muted-foreground truncate">→ {destLabel(opt)}</div>
              {opt.description && <div className="text-xs text-muted-foreground italic truncate">{opt.description}</div>}
            </div>
            <Button size="sm" variant="ghost" onClick={() => openEdit(opt)}>Edit</Button>
            <Button size="sm" variant="ghost" onClick={() => deleteOpt(opt)} className="text-destructive"><Trash2 className="w-4 h-4" /></Button>
          </div>
        ))}
      </div>
      {open && (
        <OptionDialog
          open={open} setOpen={setOpen}
          ivr={ivr} orgId={orgId} editing={editing}
          extensions={extensions} queues={queues} ringGroups={ringGroups}
          onAfterChange={onAfterChange}
        />
      )}
    </>
  );
}

function OptionDialog({ open, setOpen, ivr, orgId, editing, extensions, queues, ringGroups, onAfterChange }: any) {
  const [digit, setDigit] = useState(editing?.digit || '');
  const [destType, setDestType] = useState(editing?.destination_type || 'extension');
  const [destId, setDestId] = useState(editing?.destination_id || '');
  const [desc, setDesc] = useState(editing?.description || '');
  const [busy, setBusy] = useState(false);

  useEffect(() => { setDestId(''); }, [destType]);

  const list = destType === 'extension' ? extensions
    : destType === 'queue' ? queues
    : destType === 'ring_group' ? ringGroups
    : [];

  const save = async () => {
    if (!digit) return toast.error('Digit required');
    if (!ivr.pbx_uuid) return toast.error('IVR not synced with PBX');
    setBusy(true);
    try {
      const baseParams: any = {
        ivr_menu_uuid: ivr.pbx_uuid,
        ivr_menu_option_digits: digit,
        ivr_menu_option_action: destType,
        ivr_menu_option_param: destId || '',
        ivr_menu_option_description: desc || '',
        ivr_menu_option_enabled: 'true',
      };
      if (editing?.pbx_uuid) baseParams.ivr_menu_option_uuid = editing.pbx_uuid;
      const action = editing?.pbx_uuid ? 'update-ivr-option' : 'create-ivr-option';
      const res: any = await supabase.functions.invoke('fusionpbx-proxy', {
        body: { organization_id: orgId, action, params: baseParams },
      });
      if (res?.error) throw res.error;
      const pbxUuid: string | null = editing?.pbx_uuid || res?.data?.proxy?.data?.[0]?.ivr_menu_option_uuid || null;
      if (editing?.id) {
        await supabase.from('pbx_ivr_options').update({
          digit, destination_type: destType, destination_id: destId || null, description: desc || null,
        }).eq('id', editing.id);
      } else {
        await supabase.from('pbx_ivr_options').insert({
          ivr_id: ivr.id, digit, destination_type: destType,
          destination_id: destId || null, description: desc || null, pbx_uuid: pbxUuid,
        });
      }
      toast.success(editing ? 'Option updated' : 'Option added');
      setOpen(false); onAfterChange();
    } catch (e: any) { toast.error(errorText(e, 'Save failed')); }
    finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent>
        <DialogHeader><DialogTitle>{editing ? 'Edit option' : 'New option'}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Key (0-9, *, #)</Label><Input maxLength={1} value={digit} onChange={e => setDigit(e.target.value)} /></div>
          <div>
            <Label>Destination type</Label>
            <Select value={destType} onValueChange={setDestType}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="extension">Extension</SelectItem>
                <SelectItem value="ring_group">Ring group</SelectItem>
                <SelectItem value="queue">Call queue</SelectItem>
                <SelectItem value="voicemail">Voicemail</SelectItem>
                <SelectItem value="external">External number</SelectItem>
                <SelectItem value="hangup">Hangup</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {destType === 'extension' || destType === 'queue' || destType === 'ring_group' ? (
            <div>
              <Label>Pick {destType.replace('_', ' ')}</Label>
              <Select value={destId} onValueChange={setDestId}>
                <SelectTrigger className="mt-1"><SelectValue placeholder={`Choose ${destType.replace('_', ' ')}`} /></SelectTrigger>
                <SelectContent>
                  {(list as any[]).map(item => (
                    <SelectItem key={item.id} value={item.extension || item.pbx_uuid || item.id}>
                      {destType === 'extension'
                        ? `${item.extension}${item.display_name ? ' · ' + item.display_name : ''}`
                        : `${item.name}${item.extension ? ' · ' + item.extension : ''}`}
                    </SelectItem>
                  ))}
                  {list.length === 0 && <div className="px-2 py-3 text-xs text-muted-foreground">None available</div>}
                </SelectContent>
              </Select>
            </div>
          ) : destType === 'external' || destType === 'voicemail' ? (
            <div>
              <Label>{destType === 'external' ? 'External number (E.164)' : 'Voicemail extension'}</Label>
              <Input value={destId} onChange={e => setDestId(e.target.value)}
                placeholder={destType === 'external' ? '+15145551234' : '300'} />
            </div>
          ) : null}
          <div><Label>Description (optional)</Label><Input value={desc} onChange={e => setDesc(e.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={save} disabled={busy}>{busy && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ============== Audio Tab ============== */
function AudioTab({ ivr, orgId, audios, onAfterChange }: { ivr: any; orgId: string; audios: any[]; onAfterChange: () => void; }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [settingId, setSettingId] = useState<string | null>(null);

  const handleUpload = async (file: File) => {
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) return toast.error('File too large (max 10 MB)');
    setUploading(true);
    try {
      const ext = file.name.split('.').pop()?.toLowerCase() || 'mp3';
      const path = `${orgId}/${ivr.id}/upload-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from('lemtel-ivr-audio')
        .upload(path, file, { contentType: file.type || 'audio/mpeg', upsert: false });
      if (upErr) throw upErr;
      const { error: insErr } = await supabase.from('pbx_ivr_audio').insert({
        organization_id: orgId, ivr_id: ivr.id, storage_path: path,
        script_text: `[Uploaded] ${file.name}`, language: 'fr', status: 'uploaded',
      });
      if (insErr) throw insErr;
      toast.success('Audio uploaded');
      onAfterChange();
    } catch (e: any) { toast.error(errorText(e, 'Upload failed')); }
    finally { setUploading(false); if (fileRef.current) fileRef.current.value = ''; }
  };

  const setAsGreeting = async (audio: any) => {
    setSettingId(audio.id);
    try {
      const { error } = await supabase.from('pbx_ivrs').update({
        greet_long: audio.script_text || ivr.greet_long || '',
        raw_data: {
          ...(typeof ivr.raw_data === 'object' && ivr.raw_data ? ivr.raw_data : {}),
          active_greeting: { audio_id: audio.id, storage_path: audio.storage_path, set_at: new Date().toISOString() },
        },
      } as any).eq('id', ivr.id);
      if (error) throw error;
      await supabase.from('pbx_ivr_audio').update({ status: 'active' }).eq('ivr_id', ivr.id).neq('id', audio.id);
      await supabase.from('pbx_ivr_audio').update({ status: 'active' }).eq('id', audio.id);
      toast.success('Set as active greeting (local). Use TTS Studio to push to PBX.');
      onAfterChange();
    } catch (e: any) { toast.error(errorText(e, 'Failed')); }
    finally { setSettingId(null); }
  };

  const remove = async (audio: any) => {
    if (!confirm('Delete this audio file?')) return;
    try {
      if (audio.storage_path) {
        await supabase.storage.from('lemtel-ivr-audio').remove([audio.storage_path]);
      }
      await supabase.from('pbx_ivr_audio').delete().eq('id', audio.id);
      toast.success('Deleted'); onAfterChange();
    } catch (e: any) { toast.error(errorText(e, 'Delete failed')); }
  };

  const activeId = (ivr.raw_data as any)?.active_greeting?.audio_id || (ivr.raw_data as any)?.elevenlabs_greeting?.audio_id;

  return (
    <>
      <div className="flex items-center justify-between">
        <Label>Audio files for this IVR</Label>
        <div className="flex gap-2">
          <input ref={fileRef} type="file" accept="audio/*" className="hidden"
            onChange={e => e.target.files?.[0] && handleUpload(e.target.files[0])} />
          <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()} disabled={uploading}>
            {uploading ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Upload className="w-3 h-3 mr-1" />}
            Upload .mp3/.wav
          </Button>
        </div>
      </div>
      <div className="space-y-2">
        {audios.length === 0 ? (
          <p className="text-sm text-muted-foreground">No audio yet. Upload one or generate with TTS Studio.</p>
        ) : audios.map(a => (
          <div key={a.id} className={`p-3 border rounded-lg space-y-2 ${activeId === a.id ? 'border-primary bg-primary/5' : 'bg-muted/20'}`}>
            <div className="flex items-center justify-between gap-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant={a.status === 'active' ? 'default' : 'outline'} className="text-[10px]">{a.status || 'draft'}</Badge>
                  {activeId === a.id && <Badge className="text-[10px]"><CheckCheck className="w-3 h-3 mr-1" />Active greeting</Badge>}
                  {a.language && <Badge variant="outline" className="text-[10px] uppercase">{a.language}</Badge>}
                  <span className="text-xs text-muted-foreground">{a.created_at ? new Date(a.created_at).toLocaleString() : ''}</span>
                </div>
                {a.script_text && <div className="text-xs text-muted-foreground mt-1 line-clamp-2 italic">{a.script_text}</div>}
              </div>
              <div className="flex gap-1">
                <Button size="sm" variant="outline" disabled={settingId === a.id || activeId === a.id}
                  onClick={() => setAsGreeting(a)}>
                  {settingId === a.id ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Set active'}
                </Button>
                <Button size="sm" variant="ghost" className="text-destructive" onClick={() => remove(a)}>
                  <Trash2 className="w-3 h-3" />
                </Button>
              </div>
            </div>
            {a.audio_url && <audio controls src={a.audio_url} className="w-full" />}
          </div>
        ))}
      </div>
    </>
  );
}

/* ============== TTS Studio ============== */
function TtsStudio({ ivr, orgId, onAfterChange }: { ivr: any; orgId: string; onAfterChange: () => void; }) {
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiLang, setAiLang] = useState<'en' | 'fr' | 'bilingual'>('bilingual');
  const [script, setScript] = useState(ivr.greet_long || ivr.greet_short || '');
  const [voiceId, setVoiceId] = useState(VOICES[1].id);
  const [language, setLanguage] = useState<'fr' | 'en' | 'es'>('fr');
  const [generating, setGenerating] = useState(false);
  const [synthesizing, setSynthesizing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState<any | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => { setScript(ivr.greet_long || ivr.greet_short || ''); setPreview(null); }, [ivr.id]);

  const generateScript = async () => {
    if (!aiPrompt.trim()) return toast.error('Describe what the menu should say');
    setGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke('ivr-script-generator', {
        body: { prompt: aiPrompt, language: aiLang },
      });
      if (error) throw error;
      setScript((data as any)?.script || '');
      setAiPrompt('');
      toast.success('Script generated');
    } catch (e: any) { toast.error(errorText(e, 'Generation failed')); }
    finally { setGenerating(false); }
  };

  const synthesize = async () => {
    if (!script.trim()) return toast.error('Enter a script first');
    setSynthesizing(true); setErr(null); setPreview(null);
    try {
      const { data, error } = await supabase.functions.invoke('elevenlabs-generate-greeting', {
        body: { script_text: script, voice_id: voiceId, language, ivr_id: ivr.id, organization_id: orgId },
      });
      if (error) throw error;
      const url = (data as any)?.audio_url;
      if (!url) throw new Error('No audio URL returned');
      setPreview({ ...(data as any), audio_url: url });
      onAfterChange();
      toast.success('Voice generated — review the preview');
    } catch (e: any) {
      const m = errorText(e, 'ElevenLabs failed'); setErr(m); toast.error(m);
    } finally { setSynthesizing(false); }
  };

  const saveAsGreeting = async () => {
    if (!preview?.audio_url) return toast.error('Generate a preview first');
    setSaving(true);
    try {
      const { error } = await supabase.from('pbx_ivrs').update({
        greet_long: script,
        raw_data: {
          ...(typeof ivr.raw_data === 'object' && ivr.raw_data ? ivr.raw_data : {}),
          active_greeting: { audio_id: preview.id, storage_path: preview.storage_path, set_at: new Date().toISOString() },
          elevenlabs_greeting: {
            audio_id: preview.id, audio_url: preview.audio_url, storage_path: preview.storage_path,
            script_text: script, elevenlabs_voice_id: voiceId, language, saved_at: new Date().toISOString(),
          },
        },
      } as any).eq('id', ivr.id);
      if (error) throw error;
      if (preview.id) await supabase.from('pbx_ivr_audio').update({ status: 'active' }).eq('id', preview.id);
      toast.success('Greeting saved');
      onAfterChange();
    } catch (e: any) { toast.error(errorText(e, 'Save failed')); }
    finally { setSaving(false); }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-primary/20 bg-gradient-to-br from-primary/5 to-transparent p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-primary" />
          <h3 className="font-semibold text-sm">AI script generator</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-2 items-end">
          <div>
            <Label className="text-xs">Describe the business and menu</Label>
            <Textarea rows={2} value={aiPrompt} onChange={e => setAiPrompt(e.target.value)}
              placeholder="Dental clinic. 1 for appointments, 2 for billing, 3 for emergencies..." />
          </div>
          <div className="flex gap-2">
            <Select value={aiLang} onValueChange={(v: any) => setAiLang(v)}>
              <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="en">English</SelectItem>
                <SelectItem value="fr">Français</SelectItem>
                <SelectItem value="bilingual">Bilingual</SelectItem>
              </SelectContent>
            </Select>
            <Button onClick={generateScript} disabled={generating} size="sm">
              {generating ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Wand2 className="w-3 h-3 mr-1" />}
              Generate
            </Button>
          </div>
        </div>
      </div>

      <div className="rounded-lg border p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Mic className="w-4 h-4 text-primary" />
          <h3 className="font-semibold text-sm">Voice Studio · ElevenLabs</h3>
          <Badge variant="outline" className="ml-auto text-[10px]">eleven_multilingual_v2</Badge>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">Voice</Label>
            <Select value={voiceId} onValueChange={setVoiceId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{VOICES.map(v => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Language</Label>
            <Select value={language} onValueChange={(v: any) => setLanguage(v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="fr">Français</SelectItem>
                <SelectItem value="en">English</SelectItem>
                <SelectItem value="es">Español</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div>
          <Label className="text-xs flex items-center gap-2"><Volume2 className="w-3 h-3" /> Greeting script</Label>
          <Textarea rows={5} value={script} onChange={e => { setScript(e.target.value); setPreview(null); }}
            placeholder="Hello, you've reached..." className="mt-1 font-mono text-sm" />
          <div className="text-[10px] text-muted-foreground mt-1 text-right">{script.length} chars</div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={synthesize} disabled={synthesizing || saving || !script.trim()} size="sm">
            {synthesizing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Wand2 className="w-4 h-4 mr-2" />}
            Generate voice
          </Button>
          <Button onClick={saveAsGreeting} disabled={saving || synthesizing || !preview?.audio_url} variant="outline" size="sm">
            {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
            Set as active greeting
          </Button>
        </div>
        {err && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" /><AlertDescription>{err}</AlertDescription>
          </Alert>
        )}
        {preview?.audio_url && (
          <div className="rounded-md bg-background/60 p-3 border space-y-2">
            <audio controls src={preview.audio_url} className="w-full" />
            <div className="flex items-center gap-2 text-[10px] text-muted-foreground flex-wrap">
              <Badge variant="outline">{VOICES.find(v => v.id === voiceId)?.name}</Badge>
              <Badge variant="outline">{language.toUpperCase()}</Badge>
              {preview.status === 'saved' && <span className="inline-flex items-center gap-1 text-primary"><CheckCircle2 className="w-3 h-3" /> Saved</span>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
