import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Phone, Voicemail, MessageCircle, Clock, PhoneIncoming, PhoneOutgoing, Settings, Download, PhoneCall } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Link } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';

export default function MyDashboard() {
  const { data } = useQuery({
    queryKey: ['my-dashboard'],
    queryFn: async () => {
      try {
        const { data: auth } = await supabase.auth.getUser();
        const uid = auth.user?.id;
        const email = auth.user?.email;
        if (!uid) return { ext: null };

        let spu: any = null;
        const { data: byId } = await (supabase as any)
          .from('pbx_softphone_users')
          .select('extension,display_name,organization_id,status,sip_domain')
          .eq('portal_user_id', uid)
          .maybeSingle();
        spu = byId;

        if (!spu && email) {
          const local = email.split('@')[0];
          const { data: byName } = await (supabase as any)
            .from('pbx_softphone_users')
            .select('extension,display_name,organization_id,status,sip_domain')
            .ilike('display_name', `%${local}%`)
            .maybeSingle();
          spu = byName;
        }

        if (!spu) return { ext: null, name: email };

        const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0);
        const [callsRes, vmRes, recentRes] = await Promise.all([
          (supabase as any).from('pbx_call_records')
            .select('id,duration_seconds')
            .eq('organization_id', spu.organization_id)
            .eq('extension', spu.extension)
            .gte('start_at', startOfDay.toISOString()),
          (supabase as any).from('pbx_voicemails')
            .select('id', { count: 'exact', head: true })
            .eq('organization_id', spu.organization_id)
            .eq('extension', spu.extension)
            .is('read_at', null),
          (supabase as any).from('pbx_call_records')
            .select('id,direction,caller_number,destination_number,duration_seconds,start_at')
            .eq('organization_id', spu.organization_id)
            .eq('extension', spu.extension)
            .order('start_at', { ascending: false })
            .limit(5),
        ]);
        const callRows = (callsRes.data ?? []) as any[];
        const talkSec = callRows.reduce((s, r) => s + (r.duration_seconds || 0), 0);
        return {
          ext: spu.extension,
          name: spu.display_name,
          status: spu.status || 'offline',
          callsToday: callRows.length,
          voicemails: vmRes.count ?? 0,
          talkTime: `${Math.floor(talkSec / 3600)}h ${Math.floor((talkSec % 3600) / 60)}m`,
          recent: (recentRes.data ?? []) as any[],
        };
      } catch (err) {
        console.error('MyDashboard load error:', err);
        return { ext: null };
      }
    },
    retry: false,
  });


  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">My Dashboard</h1>
          <p className="text-muted-foreground">
            {data?.ext ? `Extension ${data.ext} · ${data.name ?? ''}` : 'No extension assigned'}
          </p>
        </div>
        {data?.ext && (
          <Badge variant="outline" className="text-sm">
            ● {data.status}
          </Badge>
        )}
      </div>

      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm">My calls today</CardTitle><Phone className="h-4 w-4" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold">{data?.callsToday ?? '—'}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm">Voicemails</CardTitle><Voicemail className="h-4 w-4" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold">{data?.voicemails ?? '—'}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm">SMS unread</CardTitle><MessageCircle className="h-4 w-4" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold">—</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm">Talk time today</CardTitle><Clock className="h-4 w-4" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold">{data?.talkTime ?? '—'}</div></CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle className="text-base">Recent calls</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {(data?.recent ?? []).length === 0 && (
              <p className="text-sm text-muted-foreground">No recent calls.</p>
            )}
            {(data?.recent ?? []).map((c) => {
              const other = c.direction === 'inbound' ? c.caller_number : c.destination_number;
              const Icon = c.direction === 'inbound' ? PhoneIncoming : PhoneOutgoing;
              return (
                <div key={c.id} className="flex items-center justify-between border-b pb-2 last:border-0">
                  <div className="flex items-center gap-2">
                    <Icon className="w-4 h-4 text-muted-foreground" />
                    <span className="font-mono">{other || 'unknown'}</span>
                  </div>
                  <div className="flex items-center gap-3 text-sm text-muted-foreground">
                    <span>{Math.round((c.duration_seconds || 0))}s</span>
                    <span>{c.start_at ? formatDistanceToNow(new Date(c.start_at), { addSuffix: true }) : ''}</span>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Quick actions</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            <Button asChild className="w-full justify-start" variant="default">
              <Link to="/org/lemtel/telephony/webphone"><PhoneCall className="w-4 h-4 mr-2" />Open Softphone</Link>
            </Button>
            <Button asChild className="w-full justify-start" variant="outline">
              <Link to="/org/lemtel/my/settings"><Settings className="w-4 h-4 mr-2" />My Settings</Link>
            </Button>
            <Button asChild className="w-full justify-start" variant="outline">
              <Link to="/org/lemtel/my/downloads"><Download className="w-4 h-4 mr-2" />Download Apps</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
