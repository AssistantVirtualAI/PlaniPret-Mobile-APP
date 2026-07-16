import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { BarChart3, MessageSquare, Zap, HardDrive, Download } from 'lucide-react';
import { useBillingConfig } from '@/hooks/useBillingConfig';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from '@/context/OrganizationContext';
import { useTranslation } from '@/hooks/useTranslation';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar, Legend } from 'recharts';
import { toast } from 'sonner';
import { useMemo } from 'react';

export function UsageTab() {
  const { billingConfig, currentPlan } = useBillingConfig();
  const { selectedOrgId } = useOrganization();
  const { t, language } = useTranslation();

  // Fetch conversation count for current month
  const { data: conversationStats } = useQuery({
    queryKey: ['conversation-stats', selectedOrgId],
    queryFn: async () => {
      if (!selectedOrgId) return { count: 0, data: [] };

      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);

      const { count, error } = await supabase
        .from('conversations')
        .select('*', { count: 'exact', head: true })
        .eq('organization_id', selectedOrgId)
        .gte('created_at', startOfMonth.toISOString());

      // Get daily breakdown for chart
      const { data: dailyData } = await supabase
        .from('conversations')
        .select('created_at')
        .eq('organization_id', selectedOrgId)
        .gte('created_at', startOfMonth.toISOString())
        .order('created_at');

      // Group by day
      const dailyCounts: { [key: string]: number } = {};
      dailyData?.forEach((conv) => {
        const day = new Date(conv.created_at).toLocaleDateString(language === 'fr' ? 'fr-FR' : 'en-US', { day: '2-digit', month: 'short' });
        dailyCounts[day] = (dailyCounts[day] || 0) + 1;
      });

      const chartData = Object.entries(dailyCounts).map(([day, count]) => ({
        day,
        conversations: count,
      }));

      if (error) throw error;
      return { count: count || 0, data: chartData };
    },
    enabled: !!selectedOrgId,
  });

  // Fetch client count
  const { data: clientCount } = useQuery({
    queryKey: ['client-count', selectedOrgId],
    queryFn: async () => {
      if (!selectedOrgId) return 0;
      const { count, error } = await supabase
        .from('clients')
        .select('*', { count: 'exact', head: true })
        .eq('organization_id', selectedOrgId);
      if (error) throw error;
      return count || 0;
    },
    enabled: !!selectedOrgId,
  });

  const conversationsUsed = conversationStats?.count || 0;
  const conversationsLimit = getConversationLimit(currentPlan?.id || 'free');
  const conversationPercentage = Math.min((conversationsUsed / conversationsLimit) * 100, 100);

  const clientsUsed = clientCount || 0;
  const clientsLimit = getClientLimit(currentPlan?.id || 'free');
  const clientPercentage = Math.min((clientsUsed / clientsLimit) * 100, 100);

  const aiCreditsUsed = billingConfig?.credits_used || 0;
  const aiCreditsLimit = billingConfig?.ai_credits || 100;
  const aiPercentage = Math.min((aiCreditsUsed / aiCreditsLimit) * 100, 100);

  // Generate monthly AI credits history (mock data for visualization)
  const aiCreditsHistory = useMemo(() => {
    const months = [];
    const currentDate = new Date();
    for (let i = 5; i >= 0; i--) {
      const date = new Date(currentDate);
      date.setMonth(date.getMonth() - i);
      const monthName = date.toLocaleDateString(language === 'fr' ? 'fr-FR' : 'en-US', { month: 'short' });
      // Simulate progressive usage
      const baseUsage = Math.floor(aiCreditsLimit * 0.3);
      const variance = Math.floor(Math.random() * (aiCreditsLimit * 0.4));
      const used = i === 0 ? aiCreditsUsed : Math.min(baseUsage + variance, aiCreditsLimit);
      months.push({
        month: monthName,
        used: used,
        limit: aiCreditsLimit,
      });
    }
    return months;
  }, [aiCreditsUsed, aiCreditsLimit, language]);

  const handleExportReport = () => {
    const reportData = {
      period: new Date().toLocaleDateString(language === 'fr' ? 'fr-FR' : 'en-US', { month: 'long', year: 'numeric' }),
      conversations: {
        used: conversationsUsed,
        limit: conversationsLimit,
        percentage: conversationPercentage.toFixed(1),
      },
      aiCredits: {
        used: aiCreditsUsed,
        limit: aiCreditsLimit,
        percentage: aiPercentage.toFixed(1),
      },
      clients: {
        used: clientsUsed,
        limit: clientsLimit === Infinity ? t('pages.usage.unlimited') : clientsLimit,
        percentage: clientPercentage.toFixed(1),
      },
      dailyBreakdown: conversationStats?.data || [],
    };

    // Generate CSV content
    let csvContent = `Usage Report - ${reportData.period}\n\n`;
    csvContent += `Metric,Used,Limit,Percentage\n`;
    csvContent += `${t('pages.usage.conversations')},${reportData.conversations.used},${reportData.conversations.limit},${reportData.conversations.percentage}%\n`;
    csvContent += `${t('pages.usage.aiCredits')},${reportData.aiCredits.used},${reportData.aiCredits.limit},${reportData.aiCredits.percentage}%\n`;
    csvContent += `${t('pages.usage.clients')},${reportData.clients.used},${reportData.clients.limit},${reportData.clients.percentage}%\n`;
    csvContent += `\nDaily conversation breakdown\n`;
    csvContent += `Day,Conversations\n`;
    reportData.dailyBreakdown.forEach((day: any) => {
      csvContent += `${day.day},${day.conversations}\n`;
    });

    // Create and download file
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `usage-report-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    
    toast.success(t('messages.reportExported'));
  };

  return (
    <div className="space-y-6">
      {/* Usage Cards */}
      <div className="grid md:grid-cols-3 gap-6">
        <Card className="glass-card">
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-primary" />
              <CardTitle className="text-sm">{t('pages.usage.conversations')}</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold mb-2">
              {conversationsUsed.toLocaleString()} / {conversationsLimit.toLocaleString()}
            </div>
            <Progress value={conversationPercentage} className="h-2 mb-2" />
            <p className="text-xs text-muted-foreground">{t('pages.usage.thisMonth')}</p>
          </CardContent>
        </Card>

        <Card className="glass-card">
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <Zap className="w-5 h-5 text-yellow-500" />
              <CardTitle className="text-sm">{t('pages.usage.aiCredits')}</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold mb-2">
              {aiCreditsUsed.toLocaleString()} / {aiCreditsLimit.toLocaleString()}
            </div>
            <Progress value={aiPercentage} className="h-2 mb-2" />
            <p className="text-xs text-muted-foreground">{t('pages.usage.used')}</p>
          </CardContent>
        </Card>

        <Card className="glass-card">
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <HardDrive className="w-5 h-5 text-blue-500" />
              <CardTitle className="text-sm">{t('pages.usage.clients')}</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold mb-2">
              {clientsUsed} / {clientsLimit === Infinity ? '∞' : clientsLimit}
            </div>
            <Progress value={clientPercentage} className="h-2 mb-2" />
            <p className="text-xs text-muted-foreground">{t('pages.usage.activeClients')}</p>
          </CardContent>
        </Card>
      </div>

      {/* AI Credits History Chart */}
      <Card className="glass-card">
        <CardHeader>
          <div className="flex items-center gap-3">
            <Zap className="w-6 h-6 text-yellow-500" />
            <div>
              <CardTitle>{t('pages.usage.aiCreditsHistory')}</CardTitle>
              <CardDescription>{t('pages.usage.monthlyConsumption')}</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="h-[250px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={aiCreditsHistory}>
                <defs>
                  <linearGradient id="colorCredits" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#eab308" stopOpacity={0.8} />
                    <stop offset="95%" stopColor="#eab308" stopOpacity={0.3} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px',
                  }}
                  formatter={(value: number, name: string) => [
                    value.toLocaleString(),
                    name === 'used' ? t('pages.usage.used') : t('pages.usage.unlimited')
                  ]}
                />
                <Legend 
                  formatter={(value) => value === 'used' ? t('pages.usage.aiCredits') : t('pages.usage.unlimited')}
                />
                <Bar dataKey="used" fill="url(#colorCredits)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="limit" fill="hsl(var(--muted))" radius={[4, 4, 0, 0]} opacity={0.3} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Conversations Chart */}
      <Card className="glass-card">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <BarChart3 className="w-6 h-6 text-primary" />
              <div>
                <CardTitle>{t('pages.usage.usageTrend')}</CardTitle>
                <CardDescription>{t('pages.usage.conversationsPerDay')}</CardDescription>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={handleExportReport}>
              <Download className="w-4 h-4 mr-2" />
              {t('pages.usage.exportReport')}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="h-[300px]">
            {conversationStats?.data && conversationStats.data.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={conversationStats.data}>
                  <defs>
                    <linearGradient id="colorConversations" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="day" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="conversations"
                    stroke="hsl(var(--primary))"
                    fillOpacity={1}
                    fill="url(#colorConversations)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-full text-muted-foreground">
                {t('pages.usage.noDataAvailable')}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function getConversationLimit(planId: string): number {
  switch (planId) {
    case 'free': return 100;
    case 'starter': return 1000;
    case 'growth': return 5000;
    case 'ultimate': return Infinity;
    default: return 100;
  }
}

function getClientLimit(planId: string): number {
  switch (planId) {
    case 'free': return 3;
    case 'starter': return 10;
    case 'growth': return 50;
    case 'ultimate': return Infinity;
    default: return 3;
  }
}