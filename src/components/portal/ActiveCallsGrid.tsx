import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Eye, Phone } from 'lucide-react';
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { formatDistanceToNow } from 'date-fns';

const LEMTEL_ORG_ID = '71755d33-ed64-4ad5-a828-61c9d2029eb7';

type ActiveCall = {
  id: string; extension: string | null;
  caller_number: string | null; destination_number: string | null;
  direction: string | null; start_at: string; answer_at: string | null;
};

export function ActiveCallsGrid({ canMonitor = false }: { canMonitor?: boolean }) {
  const [calls, setCalls] = useState<ActiveCall[]>([]);

  const load = async () => {
    const { data } = await (supabase as any).from('pbx_call_records')
      .select('id,extension,caller_number,destination_number,direction,start_at,answer_at')
      .eq('organization_id', LEMTEL_ORG_ID)
      .is('end_at', null)
      .order('start_at', { ascending: false })
      .limit(40);
    setCalls((data ?? []) as ActiveCall[]);
  };

  useEffect(() => {
    load();
    const ch = supabase
      .channel('active-calls')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pbx_call_records',
        filter: `organization_id=eq.${LEMTEL_ORG_ID}` }, () => load())
      .subscribe();
    const t = setInterval(load, 5000);
    return () => { supabase.removeChannel(ch); clearInterval(t); };
  }, []);

  const onMonitor = async (callId: string) => {
    await supabase.functions.invoke('call-center-sync', { body: { action: 'monitor-start', callId } });
  };

  return (
    <Card>
      <CardHeader><CardTitle>Active Calls ({calls.length})</CardTitle></CardHeader>
      <CardContent>
        {calls.length === 0 ? (
          <p className="text-sm text-muted-foreground">No active calls right now.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {calls.map(c => (
              <div key={c.id} className="rounded-lg border p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <Badge variant="outline">Ext {c.extension ?? '—'}</Badge>
                  <span className="text-xs text-muted-foreground">
                    {formatDistanceToNow(new Date(c.start_at), { addSuffix: false })}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Phone className="h-4 w-4 text-muted-foreground" />
                  <span>{c.caller_number ?? '—'} → {c.destination_number ?? '—'}</span>
                </div>
                {canMonitor && (
                  <Button size="sm" variant="outline" className="w-full" onClick={() => onMonitor(c.id)}>
                    <Eye className="h-3.5 w-3.5 mr-1" /> Monitor
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
