import { useState } from 'react';
import { BarChart3, Phone, Clock, CheckCircle, XCircle, ArrowDownLeft, ArrowUpRight } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useTranslation } from '@/hooks/useTranslation';
import { Skeleton } from '@/components/ui/skeleton';
import { useTwilioCallsAnalytics } from '@/hooks/useTwilioCallsAnalytics';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell } from 'recharts';

const COLORS = ['hsl(var(--primary))', 'hsl(142, 76%, 36%)', 'hsl(var(--destructive))', 'hsl(var(--muted))', 'hsl(220, 70%, 50%)'];

export function TwilioAnalyticsPanel() {
  const { t } = useTranslation();
  const [period, setPeriod] = useState<number>(7);
  const { analytics, loading, error } = useTwilioCallsAnalytics(period);

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.round(seconds % 60);
    return `${mins}m ${secs}s`;
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-10 w-32" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => (
            <Card key={i}>
              <CardContent className="p-6">
                <Skeleton className="h-20 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <Card className="border-destructive">
        <CardContent className="p-6">
          <div className="text-center text-destructive">
            <XCircle className="w-10 h-10 mx-auto mb-2" />
            <p>{t('twilio.analytics.error')}: {error}</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!analytics) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="text-center text-muted-foreground">
            <Phone className="w-10 h-10 mx-auto mb-2 opacity-50" />
            <p>{t('twilio.analytics.noData')}</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <BarChart3 className="w-5 h-5" />
            {t('twilio.analytics.title')}
          </h3>
          <p className="text-sm text-muted-foreground">{t('twilio.analytics.description')}</p>
        </div>
        <Select value={period.toString()} onValueChange={(v) => setPeriod(parseInt(v))}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7">{t('twilio.analytics.last7Days')}</SelectItem>
            <SelectItem value="14">{t('twilio.analytics.last14Days')}</SelectItem>
            <SelectItem value="30">{t('twilio.analytics.last30Days')}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Phone className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{t('twilio.analytics.totalCalls')}</p>
                <p className="text-2xl font-bold">{analytics.totalCalls}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-500/10">
                <CheckCircle className="w-5 h-5 text-green-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{t('twilio.analytics.successRate')}</p>
                <p className="text-2xl font-bold">{analytics.successRate.toFixed(1)}%</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-500/10">
                <Clock className="w-5 h-5 text-blue-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{t('twilio.analytics.avgDuration')}</p>
                <p className="text-2xl font-bold">{formatDuration(analytics.avgDuration)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-destructive/10">
                <XCircle className="w-5 h-5 text-destructive" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{t('twilio.analytics.failedCalls')}</p>
                <p className="text-2xl font-bold">{analytics.failedCalls}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Call Volume Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">{t('twilio.analytics.callVolume')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={analytics.callsByDay}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="date" className="text-xs" />
                  <YAxis className="text-xs" />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px'
                    }} 
                  />
                  <Area 
                    type="monotone" 
                    dataKey="calls" 
                    stroke="hsl(var(--primary))" 
                    fill="hsl(var(--primary))" 
                    fillOpacity={0.2}
                    name={t('twilio.analytics.totalCalls')}
                  />
                  <Area 
                    type="monotone" 
                    dataKey="completed" 
                    stroke="hsl(142, 76%, 36%)" 
                    fill="hsl(142, 76%, 36%)" 
                    fillOpacity={0.2}
                    name={t('twilio.analytics.completed')}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Call Status Distribution */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">{t('twilio.analytics.statusDistribution')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64 flex items-center justify-center">
              {analytics.callsByStatus.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={analytics.callsByStatus}
                      dataKey="count"
                      nameKey="status"
                      cx="50%"
                      cy="50%"
                      outerRadius={80}
                      label={(entry: any) => `${entry.status ?? entry.name ?? ''} (${((entry.percent ?? 0) * 100).toFixed(0)}%)`}
                    >
                      {analytics.callsByStatus.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="text-muted-foreground">{t('twilio.analytics.noData')}</div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Call Direction */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">{t('twilio.analytics.callDirection')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              {analytics.callsByDirection.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={analytics.callsByDirection} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis type="number" className="text-xs" />
                    <YAxis type="category" dataKey="direction" className="text-xs" width={100} />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: 'hsl(var(--card))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px'
                      }} 
                    />
                    <Bar dataKey="count" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-full text-muted-foreground">
                  {t('twilio.analytics.noData')}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Summary Stats */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">{t('twilio.analytics.summary')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-between items-center py-2 border-b">
              <span className="text-muted-foreground">{t('twilio.analytics.totalDuration')}</span>
              <span className="font-medium">{formatDuration(analytics.totalDuration)}</span>
            </div>
            <div className="flex justify-between items-center py-2 border-b">
              <span className="text-muted-foreground">{t('twilio.analytics.completedCalls')}</span>
              <span className="font-medium">{analytics.completedCalls}</span>
            </div>
            <div className="flex justify-between items-center py-2 border-b">
              <span className="text-muted-foreground">{t('twilio.analytics.avgPerDay')}</span>
              <span className="font-medium">{(analytics.totalCalls / period).toFixed(1)}</span>
            </div>
            <div className="flex justify-between items-center py-2">
              <span className="text-muted-foreground">{t('twilio.analytics.peakDay')}</span>
              <span className="font-medium">
                {analytics.callsByDay.reduce((max, day) => day.calls > max.calls ? day : max, { date: '-', calls: 0 }).date}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
