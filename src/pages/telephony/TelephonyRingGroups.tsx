import { useEffect, useMemo, useRef, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Bell, Plus, Loader2, Pencil, Trash2, RefreshCw, ArrowUp, ArrowDown, X, Phone, Users, Voicemail, ListOrdered, Shuffle, Zap, MoveRight, Music } from 'lucide-react';
import { LEMTEL_ORG, usePbxExtensions, usePbxRingGroups, usePbxQueues } from '@/hooks/usePbxData';
import { PbxRefreshButton } from '@/components/lemtel/PbxRefreshButton';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';
import { useLanguage } from '@/context/LanguageContext';
import { usePbxRealtime } from '@/hooks/usePbxRealtime';
import {
  parseRingGroupDestinations,
  serializeRingGroupDestinations,
  RING_STRATEGIES,
  type RingGroupDestination,
} from '@/lib/pbx-ring-groups';

const STRATEGY_ICONS: Record<string, any> = {
  simultaneous: Users,
  sequence: ListOrdered,
  enterprise: Zap,
  rollover: MoveRight,
  random: Shuffle,
};

const copy = {
  en: {
    title: 'Ring Groups', subtitle: 'Create, edit, and sync hunt groups with FusionPBX in real time.', new: 'New Ring Group', count: 'ring groups',
    empty: 'No ring groups yet — create one to route inbound calls to several extensions.',
    name: 'Name', extension: 'Extension', strategy: 'Strategy', members: 'Members', status: 'Status', actions: 'Actions',
    enabled: 'enabled', disabled: 'disabled', destinations: 'Destinations', save: 'Save', create: 'Create', cancel: 'Cancel',
    description: 'Description', forwarding: 'Forwarding / fallback', synced: 'Synced with FusionPBX', failed: 'FusionPBX sync failed',
    deleteConfirm: 'Delete ring group from FusionPBX?', resync: 'Resync from PBX', resyncing: 'Resyncing…',
    general: 'General', fallback: 'Fallback', timeout: 'Timeout (s)', addDest: 'Add destination', pickerHint: 'Click to add to the ring list',
    cidNamePrefix: 'Caller ID name prefix', cidNumPrefix: 'Caller ID number prefix', moh: 'Music on hold',
    missedAlert: 'Missed call alert email', forwardType: 'Forward to', none: 'None', voicemail: 'Voicemail', ext: 'Extension', ringGroup: 'Ring group', queue: 'Queue', custom: 'Custom',
    createFirst: 'Create your first ring group',
  },
  fr: {
    title: 'Groupes d’appel', subtitle: 'Créer, modifier et synchroniser les groupes d’appel avec FusionPBX en temps réel.', new: 'Nouveau groupe', count: 'groupes',
    empty: 'Aucun groupe d’appel — créez-en un pour router les appels entrants vers plusieurs extensions.',
    name: 'Nom', extension: 'Extension', strategy: 'Stratégie', members: 'Membres', status: 'Statut', actions: 'Actions',
    enabled: 'actif', disabled: 'inactif', destinations: 'Destinations', save: 'Enregistrer', create: 'Créer', cancel: 'Annuler',
    description: 'Description', forwarding: 'Renvoi / secours', synced: 'Synchronisé avec FusionPBX', failed: 'Échec de synchronisation FusionPBX',
    deleteConfirm: 'Supprimer ce groupe dans FusionPBX ?', resync: 'Resync depuis le PBX', resyncing: 'Synchronisation…',
    general: 'Général', fallback: 'Renvoi', timeout: 'Timeout (s)', addDest: 'Ajouter une destination', pickerHint: 'Cliquer pour ajouter',
    cidNamePrefix: 'Préfixe nom CID', cidNumPrefix: 'Préfixe numéro CID', moh: 'Musique d’attente',
    missedAlert: 'Email d’alerte appel manqué', forwardType: 'Renvoyer vers', none: 'Aucun', voicemail: 'Messagerie', ext: 'Extension', ringGroup: 'Groupe d’appel', queue: 'File', custom: 'Personnalisé',
    createFirst: 'Créer votre premier groupe',
  },
};

export default function TelephonyRingGroups() {
  const { data: groups = [], isLoading } = usePbxRingGroups();
  const { data: extensions = [] } = usePbxExtensions();
  const { data: queues = [] } = usePbxQueues();
  usePbxRealtime(['pbx_ring_groups', 'pbx_extensions']);
  const { language } = useLanguage();
  const txt = copy[language];
  const { toast } = useToast();
  const qc = useQueryClient();
  const [resyncing, setResyncing] = useState(false);
  const autoSyncedRef = useRef(false);

  const triggerSync = async () => {
    setResyncing(true);
    try {
      await supabase.functions.invoke('fusionpbx-proxy', {
        body: { organization_id: LEMTEL_ORG, action: 'sync-ring-groups' },
      });
      qc.invalidateQueries({ queryKey: ['pbx'] });
    } catch (e: any) {
      toast({ title: txt.failed, description: e?.message, variant: 'destructive' });
    } finally {
      setResyncing(false);
    }
  };

  // Auto-sync when local table is empty
  useEffect(() => {
    if (autoSyncedRef.current || isLoading) return;
    if ((groups as any[]).length === 0) {
      autoSyncedRef.current = true;
      void triggerSync();
    }
  }, [isLoading, groups]);

  const extMap = useMemo(() => {
    const m = new Map<string, any>();
    (extensions as any[]).forEach((e) => m.set(String(e.extension), e));
    return m;
  }, [extensions]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2"><Bell className="w-7 h-7" /> {txt.title}</h1>
          <p className="text-muted-foreground">{txt.subtitle}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={triggerSync} disabled={resyncing}>
            <RefreshCw className={`w-4 h-4 mr-2 ${resyncing ? 'animate-spin' : ''}`} />
            {resyncing ? txt.resyncing : txt.resync}
          </Button>
          <PbxRefreshButton kind="config" />
          <RingGroupDialog mode="create" extensions={extensions as any[]} ringGroups={groups as any[]} queues={queues as any[]} txt={txt} trigger={<Button><Plus className="w-4 h-4 mr-2" /> {txt.new}</Button>} />
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{(groups as any[]).length} {txt.count}</CardTitle>
          <CardDescription>{txt.synced}</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="animate-spin" /></div>
          ) : (groups as any[]).length === 0 ? (
            <div className="text-center py-12 space-y-4">
              <Bell className="w-12 h-12 mx-auto text-muted-foreground/40" />
              <p className="text-muted-foreground">{txt.empty}</p>
              <div className="flex justify-center gap-2">
                <Button variant="outline" onClick={triggerSync} disabled={resyncing}><RefreshCw className={`w-4 h-4 mr-2 ${resyncing ? 'animate-spin' : ''}`} />{txt.resync}</Button>
                <RingGroupDialog mode="create" extensions={extensions as any[]} ringGroups={groups as any[]} queues={queues as any[]} txt={txt}
                  trigger={<Button><Plus className="w-4 h-4 mr-2" /> {txt.createFirst}</Button>} />
              </div>
            </div>
          ) : (
            <Table>
              <TableHeader><TableRow>
                <TableHead>{txt.name}</TableHead><TableHead>{txt.extension}</TableHead><TableHead>{txt.strategy}</TableHead>
                <TableHead>{txt.members}</TableHead><TableHead>{txt.forwarding}</TableHead><TableHead>{txt.status}</TableHead>
                <TableHead className="text-right">{txt.actions}</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {(groups as any[]).map((g) => {
                  const dests = parseRingGroupDestinations(g.raw_data?.ring_group_destinations || g.forwarding || g.destinations);
                  const Strat = STRATEGY_ICONS[g.strategy] || Users;
                  return (
                    <TableRow key={g.id}>
                      <TableCell className="font-medium">{g.name}</TableCell>
                      <TableCell className="font-mono">{g.extension || '—'}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="gap-1"><Strat className="w-3 h-3" />{g.strategy || '—'}</Badge>
                      </TableCell>
                      <TableCell>
                        <MemberAvatars dests={dests} extMap={extMap} />
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-[180px] truncate">{g.forwarding || '—'}</TableCell>
                      <TableCell>
                        <Badge variant={g.enabled === false ? 'outline' : 'default'}>{g.enabled === false ? txt.disabled : txt.enabled}</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <RingGroupDialog mode="edit" group={g} extensions={extensions as any[]} ringGroups={groups as any[]} queues={queues as any[]} txt={txt}
                            trigger={<Button size="sm" variant="ghost"><Pencil className="w-4 h-4" /></Button>} />
                          <DeleteRingGroup group={g} txt={txt} />
                        </div>
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

function MemberAvatars({ dests, extMap }: { dests: RingGroupDestination[]; extMap: Map<string, any> }) {
  if (dests.length === 0) return <span className="text-muted-foreground text-xs">—</span>;
  const visible = dests.slice(0, 5);
  return (
    <TooltipProvider>
      <div className="flex -space-x-2">
        {visible.map((d, i) => {
          const ext = extMap.get(d.destination);
          const initials = ext?.display_name ? String(ext.display_name).split(' ').map((s: string) => s[0]).join('').slice(0, 2).toUpperCase() : d.destination.slice(0, 2);
          const online = ext?.registration_status === 'registered' || ext?.registered;
          return (
            <Tooltip key={i}>
              <TooltipTrigger asChild>
                <div className={`relative w-7 h-7 rounded-full border-2 border-background flex items-center justify-center text-[10px] font-medium ${online ? 'bg-emerald-500/20 text-emerald-700' : 'bg-muted text-muted-foreground'}`}>
                  {initials}
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <div className="text-xs">
                  <div className="font-mono">{d.destination}</div>
                  {ext?.display_name && <div>{ext.display_name}</div>}
                  <div className="text-muted-foreground">{d.timeout}s</div>
                </div>
              </TooltipContent>
            </Tooltip>
          );
        })}
        {dests.length > visible.length && (
          <div className="w-7 h-7 rounded-full bg-muted text-muted-foreground border-2 border-background flex items-center justify-center text-[10px]">
            +{dests.length - visible.length}
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}

type DialogTxt = typeof copy.en;

function RingGroupDialog({
  mode, group, extensions, ringGroups, queues, trigger, txt,
}: {
  mode: 'create' | 'edit'; group?: any;
  extensions: any[]; ringGroups: any[]; queues: any[];
  trigger: React.ReactNode; txt: DialogTxt;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState('general');
  const { toast } = useToast();
  const qc = useQueryClient();

  const initialDests = useMemo(
    () => parseRingGroupDestinations(group?.raw_data?.ring_group_destinations || group?.forwarding || group?.destinations),
    [group?.id],
  );

  // Forward parsing
  const rawForward = String(group?.raw_data?.ring_group_forward_destination ?? group?.raw_data?.ring_group_forward ?? '');
  const initialForwardType = rawForward.startsWith('voicemail:') ? 'voicemail'
    : rawForward.startsWith('transfer:') ? 'custom'
    : rawForward ? 'custom' : 'none';

  const [form, setForm] = useState({
    ring_group_name: group?.name || '',
    ring_group_extension: group?.extension || '',
    ring_group_strategy: group?.strategy || 'simultaneous',
    ring_group_description: group?.description || '',
    ring_group_enabled: group?.enabled !== false,
    ring_group_cid_name_prefix: group?.raw_data?.ring_group_cid_name_prefix || '',
    ring_group_cid_number_prefix: group?.raw_data?.ring_group_cid_number_prefix || '',
    ring_group_missed_call_data: group?.raw_data?.ring_group_missed_call_data || '',
    ring_group_moh_sound: group?.raw_data?.ring_group_moh_sound || '',
  });

  const [dests, setDests] = useState<RingGroupDestination[]>(initialDests);
  const [forwardType, setForwardType] = useState<'none' | 'voicemail' | 'ext' | 'ringGroup' | 'queue' | 'custom'>(initialForwardType as any);
  const [forwardTarget, setForwardTarget] = useState<string>(rawForward.replace(/^voicemail:/, '').replace(/^transfer:/, ''));
  const [pickerFilter, setPickerFilter] = useState('');

  const addDestination = (destination: string) => {
    if (!destination) return;
    if (dests.some((d) => d.destination === destination)) return;
    setDests([...dests, { destination, timeout: 30 }]);
  };
  const removeDestination = (i: number) => setDests(dests.filter((_, idx) => idx !== i));
  const moveDest = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= dests.length) return;
    const copy = [...dests];
    [copy[i], copy[j]] = [copy[j], copy[i]];
    setDests(copy);
  };
  const updateTimeout = (i: number, timeout: number) => {
    setDests(dests.map((d, idx) => idx === i ? { ...d, timeout } : d));
  };

  const buildForward = () => {
    if (forwardType === 'none' || !forwardTarget) return '';
    if (forwardType === 'voicemail') return `voicemail:${forwardTarget}`;
    if (forwardType === 'custom') return forwardTarget;
    return forwardTarget; // ext / ringGroup / queue -> the bare number
  };

  const submit = async () => {
    setBusy(true);
    try {
      const params: any = {
        ...form,
        ring_group_enabled: form.ring_group_enabled ? 'true' : 'false',
        ring_group_destinations: serializeRingGroupDestinations(dests),
        ring_group_forward_destination: buildForward(),
      };
      if (mode === 'edit') params.ring_group_uuid = group.pbx_uuid;
      const { data, error } = await supabase.functions.invoke('fusionpbx-proxy', {
        body: { organization_id: LEMTEL_ORG, action: mode === 'create' ? 'create-ring-group' : 'update-ring-group', params },
      });
      if (error || data?.ok === false) throw new Error(data?.message || error?.message || txt.failed);
      await supabase.functions.invoke('fusionpbx-proxy', { body: { organization_id: LEMTEL_ORG, action: 'sync-ring-groups' } });
      qc.invalidateQueries({ queryKey: ['pbx'] });
      toast({ title: txt.synced });
      setOpen(false);
    } catch (e: any) {
      toast({ title: txt.failed, description: e.message, variant: 'destructive' });
    } finally { setBusy(false); }
  };

  const filteredExts = (extensions || []).filter((e: any) => {
    if (!pickerFilter) return true;
    const q = pickerFilter.toLowerCase();
    return String(e.extension).toLowerCase().includes(q) || String(e.display_name || '').toLowerCase().includes(q);
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{mode === 'create' ? txt.new : `${txt.save} — ${group?.name}`}</DialogTitle>
          <DialogDescription>{txt.subtitle}</DialogDescription>
        </DialogHeader>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="general">{txt.general}</TabsTrigger>
            <TabsTrigger value="destinations">{txt.destinations} ({dests.length})</TabsTrigger>
            <TabsTrigger value="fallback">{txt.fallback}</TabsTrigger>
          </TabsList>

          <TabsContent value="general" className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2"><Label>{txt.name}</Label><Input value={form.ring_group_name} onChange={(e) => setForm({ ...form, ring_group_name: e.target.value })} /></div>
              <div><Label>{txt.extension}</Label><Input value={form.ring_group_extension} onChange={(e) => setForm({ ...form, ring_group_extension: e.target.value })} placeholder="6000" /></div>
              <div className="flex items-center gap-2 pt-6"><Switch checked={form.ring_group_enabled} onCheckedChange={(v) => setForm({ ...form, ring_group_enabled: v })} /><Label>{txt.enabled}</Label></div>
              <div className="col-span-2"><Label>{txt.description}</Label><Textarea rows={2} value={form.ring_group_description} onChange={(e) => setForm({ ...form, ring_group_description: e.target.value })} /></div>
            </div>
            <div>
              <Label className="mb-2 block">{txt.strategy}</Label>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                {RING_STRATEGIES.map((s) => {
                  const Icon = STRATEGY_ICONS[s.value] || Users;
                  const active = form.ring_group_strategy === s.value;
                  return (
                    <button type="button" key={s.value}
                      onClick={() => setForm({ ...form, ring_group_strategy: s.value })}
                      className={`text-left rounded-lg border p-3 transition ${active ? 'border-primary bg-primary/5' : 'border-border hover:bg-accent'}`}>
                      <div className="flex items-center gap-2 font-medium text-sm"><Icon className="w-4 h-4" /> {s.label}</div>
                      <div className="text-xs text-muted-foreground mt-1">{s.desc}</div>
                    </button>
                  );
                })}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="destinations" className="space-y-3">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{txt.addDest}</Label>
                <Input placeholder="Search extension…" value={pickerFilter} onChange={(e) => setPickerFilter(e.target.value)} />
                <div className="border rounded-md max-h-72 overflow-y-auto">
                  {filteredExts.length === 0 ? (
                    <div className="p-3 text-xs text-muted-foreground">No extensions</div>
                  ) : filteredExts.map((e: any) => {
                    const inList = dests.some((d) => d.destination === String(e.extension));
                    return (
                      <button type="button" key={e.id}
                        disabled={inList}
                        onClick={() => addDestination(String(e.extension))}
                        className={`w-full text-left px-3 py-2 border-b last:border-b-0 hover:bg-accent flex items-center justify-between text-sm ${inList ? 'opacity-40' : ''}`}>
                        <span><span className="font-mono">{e.extension}</span> {e.display_name && <span className="text-muted-foreground ml-1">— {e.display_name}</span>}</span>
                        <Plus className="w-3 h-3" />
                      </button>
                    );
                  })}
                </div>
                <p className="text-xs text-muted-foreground">{txt.pickerHint}</p>
              </div>
              <div className="space-y-2">
                <Label>{txt.destinations}</Label>
                {dests.length === 0 ? (
                  <div className="border border-dashed rounded-md p-6 text-center text-sm text-muted-foreground">No destinations</div>
                ) : (
                  <ol className="space-y-1">
                    {dests.map((d, i) => {
                      const ext = extensions.find((e: any) => String(e.extension) === d.destination);
                      return (
                        <li key={`${d.destination}-${i}`} className="flex items-center gap-2 bg-muted/40 rounded-md p-2">
                          <span className="text-xs text-muted-foreground w-5 text-center">{i + 1}</span>
                          <div className="flex-1 min-w-0">
                            <div className="font-mono text-sm">{d.destination}</div>
                            {ext?.display_name && <div className="text-xs text-muted-foreground truncate">{ext.display_name}</div>}
                          </div>
                          <div className="flex items-center gap-1">
                            <Input type="number" className="h-8 w-16" value={d.timeout} min={5} max={120}
                              onChange={(ev) => updateTimeout(i, Number(ev.target.value) || 30)} />
                            <span className="text-xs text-muted-foreground">s</span>
                          </div>
                          <div className="flex flex-col">
                            <Button type="button" size="sm" variant="ghost" className="h-5 w-6 p-0" disabled={i === 0} onClick={() => moveDest(i, -1)}><ArrowUp className="w-3 h-3" /></Button>
                            <Button type="button" size="sm" variant="ghost" className="h-5 w-6 p-0" disabled={i === dests.length - 1} onClick={() => moveDest(i, 1)}><ArrowDown className="w-3 h-3" /></Button>
                          </div>
                          <Button type="button" size="sm" variant="ghost" onClick={() => removeDestination(i)}><X className="w-4 h-4 text-destructive" /></Button>
                        </li>
                      );
                    })}
                  </ol>
                )}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="fallback" className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>{txt.forwardType}</Label>
                <Select value={forwardType} onValueChange={(v) => setForwardType(v as any)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{txt.none}</SelectItem>
                    <SelectItem value="voicemail"><Voicemail className="w-3 h-3 inline mr-1" />{txt.voicemail}</SelectItem>
                    <SelectItem value="ext"><Phone className="w-3 h-3 inline mr-1" />{txt.ext}</SelectItem>
                    <SelectItem value="ringGroup">{txt.ringGroup}</SelectItem>
                    <SelectItem value="queue">{txt.queue}</SelectItem>
                    <SelectItem value="custom">{txt.custom}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Target</Label>
                {forwardType === 'voicemail' || forwardType === 'ext' ? (
                  <Select value={forwardTarget} onValueChange={setForwardTarget}>
                    <SelectTrigger><SelectValue placeholder="Pick extension" /></SelectTrigger>
                    <SelectContent>{extensions.map((e: any) => <SelectItem key={e.id} value={String(e.extension)}>{e.extension} — {e.display_name}</SelectItem>)}</SelectContent>
                  </Select>
                ) : forwardType === 'ringGroup' ? (
                  <Select value={forwardTarget} onValueChange={setForwardTarget}>
                    <SelectTrigger><SelectValue placeholder="Pick ring group" /></SelectTrigger>
                    <SelectContent>{ringGroups.filter((g: any) => g.id !== group?.id).map((g: any) => <SelectItem key={g.id} value={String(g.extension)}>{g.extension} — {g.name}</SelectItem>)}</SelectContent>
                  </Select>
                ) : forwardType === 'queue' ? (
                  <Select value={forwardTarget} onValueChange={setForwardTarget}>
                    <SelectTrigger><SelectValue placeholder="Pick queue" /></SelectTrigger>
                    <SelectContent>{queues.map((q: any) => <SelectItem key={q.id} value={String(q.extension || q.queue_extension)}>{q.extension || q.queue_extension} — {q.name}</SelectItem>)}</SelectContent>
                  </Select>
                ) : forwardType === 'custom' ? (
                  <Input value={forwardTarget} onChange={(e) => setForwardTarget(e.target.value)} placeholder="transfer:300 XML default" />
                ) : (
                  <Input disabled value="" placeholder={txt.none} />
                )}
              </div>
              <div><Label>{txt.cidNamePrefix}</Label><Input value={form.ring_group_cid_name_prefix} onChange={(e) => setForm({ ...form, ring_group_cid_name_prefix: e.target.value })} /></div>
              <div><Label>{txt.cidNumPrefix}</Label><Input value={form.ring_group_cid_number_prefix} onChange={(e) => setForm({ ...form, ring_group_cid_number_prefix: e.target.value })} /></div>
              <div className="col-span-2"><Label><Music className="w-3 h-3 inline mr-1" />{txt.moh}</Label><Input value={form.ring_group_moh_sound} onChange={(e) => setForm({ ...form, ring_group_moh_sound: e.target.value })} placeholder="local_stream://default" /></div>
              <div className="col-span-2"><Label>{txt.missedAlert}</Label><Input type="email" value={form.ring_group_missed_call_data} onChange={(e) => setForm({ ...form, ring_group_missed_call_data: e.target.value })} placeholder="alerts@example.com" /></div>
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>{txt.cancel}</Button>
          <Button disabled={busy || !form.ring_group_name || !form.ring_group_extension} onClick={submit}>
            {busy && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}{mode === 'create' ? txt.create : txt.save}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeleteRingGroup({ group, txt }: { group: any; txt: typeof copy.en }) {
  const [busy, setBusy] = useState(false);
  const { toast } = useToast();
  const qc = useQueryClient();
  const onDelete = async () => {
    if (!confirm(txt.deleteConfirm)) return;
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke('fusionpbx-proxy', {
        body: { organization_id: LEMTEL_ORG, action: 'delete-ring-group', params: { ring_group_uuid: group.pbx_uuid } },
      });
      if (error || data?.ok === false) throw new Error(data?.message || error?.message || txt.failed);
      await supabase.from('pbx_ring_groups' as any).delete().eq('id', group.id);
      qc.invalidateQueries({ queryKey: ['pbx'] });
      toast({ title: txt.synced });
    } catch (e: any) { toast({ title: txt.failed, description: e.message, variant: 'destructive' }); }
    finally { setBusy(false); }
  };
  return <Button size="sm" variant="ghost" onClick={onDelete} disabled={busy}>{busy ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4 text-destructive" />}</Button>;
}
