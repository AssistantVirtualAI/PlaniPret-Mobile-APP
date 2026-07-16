import { useState, useEffect, useId, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Plus, Trash2, Loader2, Pencil, X, Check, Search, ChevronLeft, ChevronRight, Download, AlertTriangle } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

type DestType = 'extension' | 'ringgroup' | 'queue' | 'voicemail' | 'menu-top';

export function IvrOptionsDialog({
  open, onOpenChange, ivr, domainUuid, domainName, extensions, ringGroups, queues,
}: {
  open: boolean; onOpenChange: (o: boolean) => void;
  ivr: any | null; domainUuid: string; domainName: string;
  extensions: any[]; ringGroups: any[]; queues: any[];
}) {
  const qc = useQueryClient();
  const menuUuid = ivr?.ivr_menu_uuid;
  const queryKey = ['fpbx', 'ivr-options', menuUuid];
  const uid = useId();
  const digitId = `${uid}-digit`;
  const labelId = `${uid}-label`;
  const dupErrId = `${uid}-dup`;

  const { data: options = [], isLoading, isFetching, refetch } = useQuery({
    queryKey,
    enabled: open && !!menuUuid,
    staleTime: 0,
    refetchOnMount: 'always',
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('fusionpbx-proxy', {
        body: { action: 'list-ivr-options-for-menu', ivr_menu_uuid: menuUuid, domain_uuid: domainUuid },
      });
      if (error) throw error;
      return (data as any)?.data || [];
    },
  });

  useEffect(() => {
    if (open && menuUuid) qc.invalidateQueries({ queryKey });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, menuUuid]);

  const [editId, setEditId] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ digit: string; label: string; destType: DestType; destValue: string }>({ digit: '', label: '', destType: 'extension', destValue: '' });
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 10;

  // Reset list-position state ONLY when the targeted menu changes — preserve across mutations.
  useEffect(() => { setSearch(''); setPage(1); }, [menuUuid]);

  const paramFor = (t: DestType, v: string) => {
    if (t === 'voicemail') return `transfer *99${v} XML ${domainName}`;
    if (t === 'menu-top') return 'menu-top';
    return `transfer ${v} XML ${domainName}`;
  };
  const actionFor = (t: DestType) => (t === 'menu-top' ? 'menu-top' : 'menu-exec-app');

  const parseOption = (o: any): { destType: DestType; destValue: string } => {
    const a = o.ivr_menu_option_action || '';
    const p = String(o.ivr_menu_option_param || '');
    if (a === 'menu-top') return { destType: 'menu-top', destValue: '' };
    const m = p.match(/transfer\s+(\*?\d+)/);
    const n = m?.[1] || '';
    if (n.startsWith('*99')) return { destType: 'voicemail', destValue: n.slice(3) };
    if (ringGroups.find((r: any) => r.ring_group_extension === n)) return { destType: 'ringgroup', destValue: n };
    if (queues.find((q: any) => q.queue_extension === n)) return { destType: 'queue', destValue: n };
    return { destType: 'extension', destValue: n };
  };

  const startEdit = (o: any) => {
    const { destType, destValue } = parseOption(o);
    setEditId(o.ivr_menu_option_uuid);
    setDraft({ digit: o.ivr_menu_option_digits || '', label: o.ivr_menu_option_description || '', destType, destValue });
    setAdding(false);
  };

  const startAdd = () => {
    setEditId(null); setAdding(true);
    const used = new Set(options.map((o: any) => String(o.ivr_menu_option_digits)));
    let next = 1; while (used.has(String(next))) next++;
    setDraft({ digit: String(next), label: '', destType: 'extension', destValue: '' });
  };

  const cancel = () => { setEditId(null); setAdding(false); };

  // Duplicate-digit detection against existing options (excluding the one being edited)
  const duplicateDigit = useMemo(() => {
    const d = String(draft.digit || '').trim();
    if (!d || (!adding && !editId)) return false;
    return options.some((o: any) =>
      String(o.ivr_menu_option_digits).trim() === d &&
      o.ivr_menu_option_uuid !== editId
    );
  }, [draft.digit, options, adding, editId]);

  // Optimistic helpers
  const snapshot = () => qc.getQueryData<any[]>(queryKey) || [];
  const writeCache = (next: any[]) => qc.setQueryData(queryKey, next);
  const revert = (prev: any[]) => writeCache(prev);

  const runWithRetry = (label: string, fn: () => Promise<void>, prev: any[]) => {
    toast.error(label, {
      description: 'Changes reverted to last sync.',
      action: { label: 'Retry', onClick: () => { writeCache(prev); fn(); } },
    });
  };

  const save = async () => {
    if (!draft.digit || (draft.destType !== 'menu-top' && !draft.destValue)) {
      toast.error('Digit + destination required'); return;
    }
    if (duplicateDigit) {
      toast.error(`Digit "${draft.digit}" is already used by another option.`);
      return;
    }
    const prev = snapshot();
    const optimistic = {
      ivr_menu_option_uuid: editId || `tmp-${Date.now()}`,
      ivr_menu_option_digits: draft.digit,
      ivr_menu_option_description: draft.label,
      ivr_menu_option_action: actionFor(draft.destType),
      ivr_menu_option_param: paramFor(draft.destType, draft.destValue),
      ivr_menu_option_enabled: 'true',
      _pending: true,
    };
    writeCache(editId ? prev.map(o => o.ivr_menu_option_uuid === editId ? { ...o, ...optimistic } : o) : [...prev, optimistic]);
    cancel();

    const attempt = async () => {
      setBusy(true);
      try {
        const body: any = {
          action: editId ? 'update-ivr-option' : 'create-ivr-option',
          domain_uuid: domainUuid,
          ivr_menu_uuid: menuUuid,
          ivr_menu_option_digits: draft.digit,
          ivr_menu_option_action: actionFor(draft.destType),
          ivr_menu_option_param: paramFor(draft.destType, draft.destValue),
          ivr_menu_option_description: draft.label,
          ivr_menu_option_enabled: 'true',
        };
        if (editId) body.ivr_menu_option_uuid = editId;
        const { error } = await supabase.functions.invoke('fusionpbx-proxy', { body });
        if (error) throw error;
        toast.success(editId ? 'Option updated' : 'Option added');
        await qc.invalidateQueries({ queryKey });
        await refetch();
        qc.invalidateQueries({ queryKey: ['fpbx', 'ivrs'] });
      } catch (e: any) {
        revert(prev);
        runWithRetry(e?.message || 'Failed to save option', attempt, prev);
      } finally { setBusy(false); }
    };
    attempt();
  };

  const del = async (o: any) => {
    if (!confirm(`Delete option "${o.ivr_menu_option_digits}"?`)) return;
    const prev = snapshot();
    writeCache(prev.filter(x => x.ivr_menu_option_uuid !== o.ivr_menu_option_uuid));

    const attempt = async () => {
      setBusy(true);
      try {
        const { error } = await supabase.functions.invoke('fusionpbx-proxy', {
          body: { action: 'delete-ivr-option', domain_uuid: domainUuid, ivr_menu_option_uuid: o.ivr_menu_option_uuid },
        });
        if (error) throw error;
        toast.success('Option deleted');
        await qc.invalidateQueries({ queryKey });
        await refetch();
        qc.invalidateQueries({ queryKey: ['fpbx', 'ivrs'] });
      } catch (e: any) {
        revert(prev);
        runWithRetry(e?.message || 'Failed to delete option', attempt, prev);
      } finally { setBusy(false); }
    };
    attempt();
  };

  // Filtered + paginated view
  const q = search.trim().toLowerCase();
  const filtered = q
    ? options.filter((o: any) =>
        String(o.ivr_menu_option_digits || '').toLowerCase().includes(q) ||
        String(o.ivr_menu_option_description || '').toLowerCase().includes(q))
    : options;
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paged = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  // Export helpers
  const exportRows = () => options.map((o: any) => {
    const { destType, destValue } = parseOption(o);
    return {
      digit: o.ivr_menu_option_digits || '',
      label: o.ivr_menu_option_description || '',
      destination_type: destType,
      destination_value: destValue,
      action: o.ivr_menu_option_action || '',
      param: o.ivr_menu_option_param || '',
      enabled: o.ivr_menu_option_enabled || '',
    };
  });
  const triggerDownload = (filename: string, content: string, mime: string) => {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const baseName = `ivr-${(ivr?.ivr_menu_name || 'menu').replace(/[^\w-]+/g, '_')}-options`;
  const exportJson = () => {
    triggerDownload(`${baseName}.json`, JSON.stringify(exportRows(), null, 2), 'application/json');
    toast.success('Exported JSON');
  };
  const exportCsv = () => {
    const rows = exportRows();
    if (rows.length === 0) { toast.error('Nothing to export'); return; }
    const headers = Object.keys(rows[0]);
    const esc = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const csv = [headers.join(','), ...rows.map(r => headers.map(h => esc((r as any)[h])).join(','))].join('\n');
    triggerDownload(`${baseName}.csv`, csv, 'text/csv');
    toast.success('Exported CSV');
  };

  const DestSelect = ({ t, v, onT, onV, idPrefix }: any) => (
    <div className="grid grid-cols-2 gap-1">
      <Select value={t} onValueChange={onT}>
        <SelectTrigger className="h-8" id={`${idPrefix}-dest-type`} aria-label="Destination type"><SelectValue /></SelectTrigger>
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
          <SelectTrigger className="h-8" aria-label="Extension"><SelectValue placeholder="…" /></SelectTrigger>
          <SelectContent>{extensions.map((e: any) => (
            <SelectItem key={e.extension_uuid || e.extension} value={e.extension}>{e.extension}{e.effective_caller_id_name ? ` · ${e.effective_caller_id_name}` : ''}</SelectItem>
          ))}</SelectContent>
        </Select>
      ) : t === 'ringgroup' ? (
        <Select value={v} onValueChange={onV}>
          <SelectTrigger className="h-8" aria-label="Ring group"><SelectValue placeholder="…" /></SelectTrigger>
          <SelectContent>{ringGroups.map((r: any) => (
            <SelectItem key={r.ring_group_uuid} value={r.ring_group_extension}>{r.ring_group_extension} · {r.ring_group_name}</SelectItem>
          ))}</SelectContent>
        </Select>
      ) : t === 'queue' ? (
        <Select value={v} onValueChange={onV}>
          <SelectTrigger className="h-8" aria-label="Queue"><SelectValue placeholder="…" /></SelectTrigger>
          <SelectContent>{queues.map((q: any) => (
            <SelectItem key={q.call_center_queue_uuid || q.queue_uuid} value={q.queue_extension}>{q.queue_extension} · {q.queue_name}</SelectItem>
          ))}</SelectContent>
        </Select>
      ) : t === 'voicemail' ? (
        <Input className="h-8" placeholder="ext #" value={v} onChange={e => onV(e.target.value)} aria-label="Voicemail extension" />
      ) : <Input className="h-8" disabled value="—" aria-label="No destination value" />}
    </div>
  );

  const DraftForm = ({ idPrefix }: { idPrefix: string }) => (
    <div className="space-y-2">
      <div className="grid grid-cols-[80px_1fr_auto] gap-2 items-end">
        <div>
          <Label htmlFor={`${idPrefix}-${digitId}`} className="text-xs">Digit</Label>
          <Input
            id={`${idPrefix}-${digitId}`}
            className="h-8"
            value={draft.digit}
            onChange={e => setDraft({ ...draft, digit: e.target.value })}
            aria-invalid={duplicateDigit || undefined}
            aria-describedby={duplicateDigit ? dupErrId : undefined}
            autoFocus
          />
        </div>
        <div>
          <Label htmlFor={`${idPrefix}-${labelId}`} className="text-xs">Label</Label>
          <Input
            id={`${idPrefix}-${labelId}`}
            className="h-8"
            value={draft.label}
            onChange={e => setDraft({ ...draft, label: e.target.value })}
            onKeyDown={e => { if (e.key === 'Enter' && !duplicateDigit) { e.preventDefault(); save(); } }}
          />
        </div>
        <div className="flex gap-1">
          <Button size="icon" variant="ghost" onClick={cancel} disabled={busy} aria-label="Cancel"><X className="w-4 h-4" /></Button>
          <Button size="icon" onClick={save} disabled={busy || duplicateDigit} aria-label="Save option">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
          </Button>
        </div>
      </div>
      {duplicateDigit && (
        <p id={dupErrId} role="alert" className="text-xs text-destructive flex items-center gap-1">
          <AlertTriangle className="w-3 h-3" /> Digit "{draft.digit}" is already used. Choose a different one to save.
        </p>
      )}
      <DestSelect
        idPrefix={idPrefix}
        t={draft.destType} v={draft.destValue}
        onT={(t: DestType) => setDraft({ ...draft, destType: t, destValue: '' })}
        onV={(v: string) => setDraft({ ...draft, destValue: v })}
      />
    </div>
  );

  const renderRow = (o: any) => {
    const isEdit = editId === o.ivr_menu_option_uuid;
    const { destType, destValue } = parseOption(o);
    if (isEdit) {
      return (
        <div key={o.ivr_menu_option_uuid} className="border rounded p-2 bg-muted/30" role="group" aria-label={`Editing option ${o.ivr_menu_option_digits}`}>
          <DraftForm idPrefix={`edit-${o.ivr_menu_option_uuid}`} />
        </div>
      );
    }
    return (
      <div
        key={o.ivr_menu_option_uuid}
        className={`flex items-center gap-3 border rounded p-2 ${o._pending ? 'opacity-60 animate-pulse' : ''}`}
        role="listitem"
      >
        <Badge variant="outline" className="font-mono text-base px-3">{o.ivr_menu_option_digits}</Badge>
        <div className="flex-1 min-w-0">
          <div className="text-sm truncate">{o.ivr_menu_option_description || <span className="text-muted-foreground italic">No label</span>}</div>
          <div className="text-xs text-muted-foreground capitalize">{destType}{destValue ? ` · ${destValue}` : ''}{o._pending ? ' · saving…' : ''}</div>
        </div>
        <Button size="icon" variant="ghost" onClick={() => startEdit(o)} disabled={busy || o._pending} aria-label={`Edit option ${o.ivr_menu_option_digits}`}>
          <Pencil className="w-3 h-3" />
        </Button>
        <Button size="icon" variant="ghost" onClick={() => del(o)} disabled={busy || o._pending} aria-label={`Delete option ${o.ivr_menu_option_digits}`}>
          <Trash2 className="w-3 h-3" />
        </Button>
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span>Options · {ivr?.ivr_menu_name || ''}</span>
            <span className="text-muted-foreground font-normal text-sm">(ext {ivr?.ivr_menu_extension})</span>
            {isFetching && !isLoading && (
              <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" aria-label="Refreshing" />
            )}
          </DialogTitle>
        </DialogHeader>

        <span className="sr-only" role="status" aria-live="polite">
          {isFetching ? 'Refreshing options…' : `${options.length} options loaded.`}
        </span>

        {options.length > 0 && (
          <div className="relative">
            <Search className="w-3 h-3 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input
              className="h-8 pl-7"
              placeholder="Search by digit or label…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              aria-label="Search options"
            />
          </div>
        )}

        <div className="space-y-2 max-h-[55vh] overflow-y-auto pr-1" role="list" aria-label="IVR options">
          {isLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin" aria-label="Loading options" /></div>
          ) : (
            <>
              {options.length === 0 && !adding && (
                <p className="text-sm text-muted-foreground text-center py-4">No options yet.</p>
              )}
              {options.length > 0 && filtered.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">No matches for "{search}".</p>
              )}
              {paged.map(renderRow)}
              {adding && (
                <div className="border rounded p-2 bg-muted/30 border-primary/40" role="group" aria-label="New option">
                  <DraftForm idPrefix="add" />
                </div>
              )}
            </>
          )}
        </div>

        {filtered.length > PAGE_SIZE && (
          <nav className="flex items-center justify-between text-xs text-muted-foreground pt-1" aria-label="Options pagination">
            <span>{(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, filtered.length)} of {filtered.length}</span>
            <div className="flex items-center gap-1">
              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={safePage <= 1} aria-label="Previous page">
                <ChevronLeft className="w-3 h-3" />
              </Button>
              <span aria-current="page">Page {safePage} / {totalPages}</span>
              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={safePage >= totalPages} aria-label="Next page">
                <ChevronRight className="w-3 h-3" />
              </Button>
            </div>
          </nav>
        )}

        <DialogFooter className="flex items-center justify-between sm:justify-between gap-2">
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={startAdd} disabled={adding || !!editId}>
              <Plus className="w-3 h-3 mr-1" /> Add option
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="outline" disabled={options.length === 0} aria-label="Export options">
                  <Download className="w-3 h-3 mr-1" /> Export
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuItem onClick={exportCsv}>Download CSV</DropdownMenuItem>
                <DropdownMenuItem onClick={exportJson}>Download JSON</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
