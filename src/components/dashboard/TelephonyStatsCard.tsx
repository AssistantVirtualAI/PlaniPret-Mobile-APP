import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Phone, PhoneCall, MessageSquare, Smartphone, Voicemail, Headphones, Bell } from 'lucide-react';
import {
  usePbxCallRecords,
  usePbxExtensions,
  usePbxIvrs,
  usePbxQueues,
  usePbxRingGroups,
  usePbxSmsThreads,
  usePbxIntegration,
} from '@/hooks/usePbxData';
import { Link } from 'react-router-dom';
import { useLemtelAccess } from '@/hooks/useLemtelAccess';

export const TelephonyStatsCard = () => {
  const { isMember, isSuperAdmin } = useLemtelAccess();
  const hasAccess = isMember || isSuperAdmin;
  const { data: cdrs = [] } = usePbxCallRecords(500);
  const { data: extensions = [] } = usePbxExtensions();
  const { data: ivrs = [] } = usePbxIvrs();
  const { data: queues = [] } = usePbxQueues();
  const { data: ringGroups = [] } = usePbxRingGroups();
  const { data: sms = [] } = usePbxSmsThreads();
  const { data: integration } = usePbxIntegration();

  if (!hasAccess) return null;

  const today = new Date().toDateString();
  const callsToday = (cdrs as any[]).filter(
    (c: any) => c.start_at && new Date(c.start_at).toDateString() === today,
  ).length;
  const missedToday = (cdrs as any[]).filter(
    (c: any) =>
      c.start_at &&
      new Date(c.start_at).toDateString() === today &&
      c.direction === 'missed',
  ).length;
  const unreadSms = (sms as any[]).reduce(
    (s: number, t: any) => s + (t.unread_count || 0),
    0,
  );
  const enabledExt = (extensions as any[]).filter((e: any) => e.enabled).length;

  const stats = [
    { label: 'Calls today', value: callsToday, icon: PhoneCall, href: '/org/lemtel/telephony/calls' },
    { label: 'Missed today', value: missedToday, icon: Phone, href: '/org/lemtel/telephony/calls' },
    { label: 'Extensions', value: `${enabledExt}/${extensions.length}`, icon: Smartphone, href: '/org/lemtel/telephony/extensions' },
    { label: 'IVR menus', value: ivrs.length, icon: Voicemail, href: '/org/lemtel/telephony/ivr' },
    { label: 'Call queues', value: queues.length, icon: Headphones, href: '/org/lemtel/telephony/queues' },
    { label: 'Ring groups', value: ringGroups.length, icon: Bell, href: '/org/lemtel/telephony/ring-groups' },
    { label: 'SMS threads', value: sms.length, icon: MessageSquare, href: '/org/lemtel/telephony/messages' },
    { label: 'Unread SMS', value: unreadSms, icon: MessageSquare, href: '/org/lemtel/telephony/messages' },
  ];

  return (
    <Card className="glass-card">
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <PhoneCall className="h-5 w-5 text-primary" />
          Phone System
        </CardTitle>
        <Badge variant={integration?.status === 'configured' ? 'default' : 'outline'}>
          {integration?.status === 'configured' ? 'Connected' : 'Setup'}
        </Badge>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {stats.map((s) => {
            const Icon = s.icon;
            return (
              <Link
                key={s.label}
                to={s.href}
                className="group flex items-center gap-3 p-3 rounded-xl border border-border/50 hover:border-primary/40 hover:bg-primary/5 transition-all"
              >
                <div className="p-2 rounded-lg bg-muted group-hover:bg-primary/10">
                  <Icon className="h-4 w-4 text-primary" />
                </div>
                <div className="min-w-0">
                  <div className="text-xl font-bold leading-tight">{s.value}</div>
                  <div className="text-xs text-muted-foreground truncate">{s.label}</div>
                </div>
              </Link>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
};

export default TelephonyStatsCard;
