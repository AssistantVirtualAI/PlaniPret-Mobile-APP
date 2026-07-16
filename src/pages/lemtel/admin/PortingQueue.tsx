import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';

const STATUSES = ['submitted', 'in_review', 'approved', 'rejected', 'completed'] as const;

export default function PortingQueue() {
  const qc = useQueryClient();
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['porting-requests'],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('number_porting_requests')
        .select('*, organizations:organization_id(name)')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const setStatus = async (id: string, status: string) => {
    const { error } = await (supabase as any).from('number_porting_requests').update({ status }).eq('id', id);
    if (error) return toast.error(error.message);
    toast.success(`Status → ${status}`);
    qc.invalidateQueries({ queryKey: ['porting-requests'] });
  };

  return (
    <div className="space-y-4 w-full min-w-0 p-4">
      <h1 className="text-2xl font-bold">Number porting queue</h1>
      {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {rows.length === 0 && !isLoading && <p className="text-sm text-muted-foreground">No porting requests yet.</p>}
      {rows.map((r: any) => (
        <Card key={r.id}>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center justify-between flex-wrap gap-2">
              <span>{r.organizations?.name || r.organization_id} · {r.current_carrier}</span>
              <Badge>{r.status}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm space-y-2">
            <div className="text-xs text-muted-foreground">{formatDistanceToNow(new Date(r.created_at), { addSuffix: true })} · Account {r.account_number}</div>
            <div><strong>Numbers:</strong> <span className="font-mono">{(r.numbers || []).join(', ')}</span></div>
            <div className="text-xs text-muted-foreground">{[r.service_address?.street, r.service_address?.city, r.service_address?.state, r.service_address?.zip].filter(Boolean).join(', ')}</div>
            {r.notes && <div className="text-xs">📝 {r.notes}</div>}
            <div className="flex items-center gap-2 pt-2">
              <Select value={r.status} onValueChange={(v) => setStatus(r.id, v)}>
                <SelectTrigger className="w-[180px] h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
              {r.pin && <Button size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(r.pin); toast.success('PIN copied'); }}>Copy PIN</Button>}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
