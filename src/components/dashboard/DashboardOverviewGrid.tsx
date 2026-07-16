import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Phone,
  PhoneIncoming,
  PhoneMissed,
  Voicemail,
  Activity,
  Users,
  TrendingUp,
  TrendingDown,
  Target,
  CalendarClock,
  Megaphone,
  HeadsetIcon,
  MessageSquare,
  BookOpen,
  AlertTriangle,
  CircleUser,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { DashboardOverview } from '@/hooks/useDashboardOverview';

interface Props {
  data?: DashboardOverview | null;
  isLoading?: boolean;
}

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  trend,
  href,
  accent = 'primary',
  emptyHint,
}: {
  icon: any;
  label: string;
  value: number | string;
  sub?: string;
  trend?: number;
  href?: string;
  accent?: 'primary' | 'emerald' | 'amber' | 'rose' | 'sky' | 'violet';
  emptyHint?: string;
}) {
  const accentMap: Record<string, string> = {
    primary: 'from-primary/20 to-primary/5 text-primary',
    emerald: 'from-emerald-500/20 to-emerald-500/5 text-emerald-500',
    amber: 'from-amber-500/20 to-amber-500/5 text-amber-500',
    rose: 'from-rose-500/20 to-rose-500/5 text-rose-500',
    sky: 'from-sky-500/20 to-sky-500/5 text-sky-500',
    violet: 'from-violet-500/20 to-violet-500/5 text-violet-500',
  };

  const inner = (
    <Card className="glass-card hover:border-primary/40 transition-colors h-full">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className={`p-2 rounded-lg bg-gradient-to-br ${accentMap[accent]}`}>
            <Icon className="h-4 w-4" />
          </div>
          {typeof trend === 'number' && trend !== 0 && (
            <Badge variant="outline" className={`gap-1 text-xs ${trend > 0 ? 'text-emerald-500 border-emerald-500/30' : 'text-rose-500 border-rose-500/30'}`}>
              {trend > 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
              {Math.abs(trend)}%
            </Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground mt-3">{label}</p>
        <p className="text-2xl font-bold mt-0.5 tabular-nums">{value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
        {!sub && value === 0 && emptyHint && (
          <p className="text-xs text-muted-foreground/70 mt-1">{emptyHint}</p>
        )}
      </CardContent>
    </Card>
  );

  return href ? <Link to={href}>{inner}</Link> : inner;
}

function SkeletonCard() {
  return (
    <Card className="glass-card h-full">
      <CardContent className="p-4 space-y-3">
        <Skeleton className="h-8 w-8 rounded-lg" />
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-7 w-16" />
      </CardContent>
    </Card>
  );
}

export function DashboardOverviewGrid({ data, isLoading }: Props) {
  if (isLoading || !data) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        {Array.from({ length: 12 }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Voice & Telephony */}
      <div>
        <h3 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-2">
          <Phone className="h-4 w-4" /> Voice & Telephony
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <StatCard
            icon={PhoneIncoming}
            label="Calls (period)"
            value={data.voice.callsTotal}
            sub={`${data.voice.callsToday} today`}
            trend={data.voice.callsTrend}
            href="/telephony"
            accent="sky"
            emptyHint="No calls yet"
          />
          <StatCard
            icon={PhoneMissed}
            label="Missed calls"
            value={data.voice.missed}
            accent={data.voice.missed > 0 ? 'rose' : 'primary'}
            href="/telephony"
          />
          <StatCard
            icon={Voicemail}
            label="Voicemails unread"
            value={data.voice.voicemailsUnread}
            accent={data.voice.voicemailsUnread > 0 ? 'amber' : 'primary'}
            href="/voicemails"
          />
          <StatCard
            icon={Activity}
            label="Active calls now"
            value={data.voice.activeNow}
            accent={data.voice.activeNow > 0 ? 'emerald' : 'primary'}
          />
          <StatCard
            icon={HeadsetIcon}
            label="Handoffs pending"
            value={data.handoffs.pending}
            sub={`${data.handoffs.resolved} resolved`}
            accent={data.handoffs.pending > 0 ? 'amber' : 'primary'}
          />
          <StatCard
            icon={MessageSquare}
            label="SMS (in/out)"
            value={`${data.messaging.smsIn}/${data.messaging.smsOut}`}
            accent="violet"
          />
        </div>
      </div>

      {/* Leads, Campaigns & Appointments */}
      <div>
        <h3 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-2">
          <Target className="h-4 w-4" /> Pipeline & Campaigns
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <StatCard
            icon={Target}
            label="New leads"
            value={data.leads.new}
            trend={data.leads.trend}
            href="/leads"
            accent="emerald"
            emptyHint="No new leads"
          />
          <StatCard
            icon={TrendingUp}
            label="Conversion rate"
            value={`${data.leads.conversionRate}%`}
            sub={`${data.leads.converted} converted`}
            accent="emerald"
          />
          <StatCard
            icon={Megaphone}
            label="Active campaigns"
            value={data.campaigns.active}
            sub={`${data.campaigns.dialed} dialed`}
            href="/campaigns"
            accent="violet"
          />
          <StatCard
            icon={Activity}
            label="Campaign success"
            value={`${data.campaigns.successRate}%`}
            sub={`${data.campaigns.successful}/${data.campaigns.dialed}`}
            accent="emerald"
          />
          <StatCard
            icon={CalendarClock}
            label="Appointments today"
            value={data.appointments.today}
            sub={`${data.appointments.upcoming7d} next 7d`}
            href="/appointments"
            accent="sky"
          />
          <StatCard
            icon={CalendarClock}
            label="No-shows"
            value={data.appointments.noShows}
            accent={data.appointments.noShows > 0 ? 'rose' : 'primary'}
          />
        </div>
      </div>

      {/* Workspace */}
      <div>
        <h3 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-2">
          <Users className="h-4 w-4" /> Workspace
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <StatCard
            icon={CircleUser}
            label="Team online"
            value={`${data.team.online}/${data.team.total}`}
            accent="emerald"
          />
          <StatCard
            icon={BookOpen}
            label="Knowledge items"
            value={data.knowledge.items}
            href="/knowledge"
            accent="violet"
          />
          <StatCard
            icon={AlertTriangle}
            label="Integration errors"
            value={data.health.erroredCount}
            sub={data.health.erroredIntegrations.slice(0, 2).map((i) => i.platform).join(', ') || undefined}
            accent={data.health.erroredCount > 0 ? 'rose' : 'primary'}
            href="/integrations"
          />
          {data.billing.trialDaysLeft !== null && (
            <StatCard
              icon={AlertTriangle}
              label="Trial days left"
              value={data.billing.trialDaysLeft}
              sub={data.billing.orgName ?? undefined}
              accent={data.billing.trialDaysLeft <= 3 ? 'rose' : 'amber'}
              href="/billing"
            />
          )}
        </div>
      </div>
    </div>
  );
}
