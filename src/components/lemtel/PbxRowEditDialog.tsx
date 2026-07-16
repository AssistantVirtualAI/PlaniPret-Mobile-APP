import { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { mergedFields, type ResourceKind, type FieldSpec } from '@/lib/fusionpbx/fieldMaps';

function normalize(v: any): string {
  if (v === null || v === undefined) return '';
  if (v === true || v === 'true') return 'true';
  if (v === false || v === 'false') return 'false';
  return String(v);
}

export function PbxRowEditDialog({
  open, onOpenChange, title, row, idKey, idValue, updateAction, organizationId, domainUuid, resourceKind, onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  row: any | null;
  idKey: string;
  idValue: string | undefined;
  updateAction: string;
  organizationId?: string;
  domainUuid: string;
  resourceKind?: ResourceKind;
  onSaved: () => void;
}) {
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  // Resource kind: explicit prop wins, else infer from idKey
  const kind: ResourceKind = useMemo(() => {
    if (resourceKind) return resourceKind;
    if (idKey.startsWith('queue')) return 'queue';
    if (idKey.startsWith('ring_group')) return 'ring_group';
    if (idKey.startsWith('device')) return 'device';
    if (idKey.startsWith('destination')) return 'destination';
    if (idKey.startsWith('ivr_menu_option')) return 'ivr_option';
    if (idKey.startsWith('ivr')) return 'ivr';
    return 'extension';
  }, [resourceKind, idKey]);

  const fields = useMemo(() => (row ? mergedFields(kind, row) : []), [row, kind]);

  // Group fields preserving order
  const grouped = useMemo(() => {
    const out: Array<{ group: string; items: Array<FieldSpec & { value: string }> }> = [];
    const map = new Map<string, number>();
    for (const f of fields) {
      const g = f.group || 'Other';
      if (!map.has(g)) { map.set(g, out.length); out.push({ group: g, items: [] }); }
      out[map.get(g)!].items.push(f);
    }
    return out;
  }, [fields]);

  useEffect(() => {
    if (!open || !row) return;
    const init: Record<string, string> = {};
    fields.forEach((f) => { init[f.key] = f.value; });
    setDraft(init);
  }, [open, row, fields.length]);

  if (!row) return null;

  const set = (k: string, v: string) => setDraft((d) => ({ ...d, [k]: v }));

  const save = async () => {
    if (!idValue) { toast.error('Missing record id'); return; }
    setSaving(true);
    try {
      const patch: Record<string, string> = {};
      fields.forEach((f) => {
        const next = draft[f.key] ?? '';
        if (next !== normalize(row[f.key])) patch[f.key] = next;
      });
      if (Object.keys(patch).length === 0) { toast.message('No changes'); onOpenChange(false); return; }
      const { error } = await supabase.functions.invoke('pbx-write', {
        body: {
          organizationId,
          action: updateAction,
          params: { [idKey]: idValue, domain_uuid: domainUuid, ...patch },
        },
      });
      if (error) throw error;
      toast.success('Saved & synced to FusionPBX');
      onSaved();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message || 'Save failed');
    } finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
        <p className="text-xs text-muted-foreground">All FusionPBX fields, grouped. Empty values are sent blank (clears the field).</p>
        <div className="space-y-4 pt-2">
          {grouped.map((g) => (
            <div key={g.group} className="border rounded-md">
              <div className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide bg-muted/40 border-b">{g.group}</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3">
                {g.items.map((f) => {
                  const v = draft[f.key] ?? '';
                  if (f.kind === 'bool') {
                    return (
                      <div key={f.key} className="flex items-center justify-between border rounded p-2">
                        <Label className="text-xs">{f.label}</Label>
                        <Switch checked={v === 'true'} onCheckedChange={(b) => set(f.key, b ? 'true' : 'false')} disabled={f.readOnly} />
                      </div>
                    );
                  }
                  if (f.kind === 'textarea') {
                    return (
                      <div key={f.key} className="sm:col-span-2">
                        <Label className="text-xs">{f.label}</Label>
                        <Textarea value={v} onChange={(e) => set(f.key, e.target.value)} rows={3} className="text-xs" readOnly={f.readOnly} />
                      </div>
                    );
                  }
                  return (
                    <div key={f.key}>
                      <Label className="text-xs">{f.label}</Label>
                      <Input
                        value={v}
                        onChange={(e) => set(f.key, e.target.value)}
                        className="h-8 text-xs"
                        type={f.kind === 'number' ? 'number' : f.kind === 'password' ? 'text' : 'text'}
                        readOnly={f.readOnly}
                        placeholder={f.placeholder}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={save} disabled={saving}>
            {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
