import { usePortal } from '@/hooks/usePortalAuth';
import { usePortalPlatformAnalytics, usePortalPlatformConversations } from '@/hooks/usePortalPlatformData';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { MessageSquare, Clock, TrendingUp, Phone, Activity, Sparkles, AlertCircle, Loader2, ArrowRight, BarChart3, Headphones, Zap } from 'lucide-react';
import { motion } from 'framer-motion';
import { PortalStatCard } from '@/components/portal/PortalStatCard';
import { AvaLogo } from '@/components/shared/AvaLogo';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Link } from 'react-router-dom';
import { useTranslation } from '@/hooks/useTranslation';
import { WhatsNewModal } from '@/components/dashboard/WhatsNewModal';

const PortalDashboard = () => {
  const { t, language } = useTranslation();
  const { session } = usePortal();
  const { data: analytics, isLoading: analyticsLoading, error: analyticsError } = usePortalPlatformAnalytics('7days');
  const { data: conversationsData, isLoading: conversationsLoading, error: conversationsError } = usePortalPlatformConversations(1, 100);

  // Debug logs
  console.log('[PortalDashboard] Session:', session ? {
    agentId: session.agentId,
    agentName: session.agentName,
    platform: session.platform,
    platformAgentId: session.platformAgentId,
    organizationId: session.organizationId,
  } : 'null');
  console.log('[PortalDashboard] Analytics:', { data: analytics, loading: analyticsLoading, error: analyticsError });
  console.log('[PortalDashboard] Conversations:', { data: conversationsData, loading: conversationsLoading, error: conversationsError });

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { staggerChildren: 0.1 } }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0 }
  };

  const isLoading = analyticsLoading || conversationsLoading;
  const hasData = analytics || conversationsData;

  // Format chart data
  const chartData = analytics?.charts?.conversations_over_time?.map(item => ({
    name: new Date(item.date).toLocaleDateString(language === 'fr' ? 'fr-FR' : 'en-US', { weekday: 'short' }),
    conversations: item.count,
  })) || [];

  // Format duration
  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const basePath = session?.agentSlug ? `/${session.agentSlug}` : '/portal';

  const quickActions = [
    {
      icon: MessageSquare,
      label: t('clientPortal.dashboard.viewConversations'),
      href: `${basePath}/conversations`,
      gradient: 'from-blue-500 to-cyan-500',
    },
    {
      icon: BarChart3,
      label: t('clientPortal.dashboard.viewAnalytics'),
      href: `${basePath}/analytics`,
      gradient: 'from-purple-500 to-pink-500',
    },
    {
      icon: Headphones,
      label: t('clientPortal.dashboard.knowledgeBase'),
      href: `${basePath}/knowledge`,
      gradient: 'from-green-500 to-emerald-500',
    },
  ];

  return (
    <>
    <WhatsNewModal />
    <motion.div variants={containerVariants} initial="hidden" animate="visible" className="space-y-8">
      {/* Hero Section */}
      <motion.div variants={itemVariants} className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-primary/20 via-purple-500/15 to-pink-500/20 p-8 md:p-10 border border-primary/20">
        {/* Animated background elements */}
        <div className="absolute top-0 right-0 w-80 h-80 bg-primary/20 rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-0 left-0 w-64 h-64 bg-pink-500/20 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl" />
        
        <div className="relative flex flex-col md:flex-row items-start md:items-center gap-6">
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 200, delay: 0.2 }}
          >
            <AvaLogo size="lg" animated />
          </motion.div>
          <div className="flex-1">
            <motion.h1 
              className="text-3xl md:text-4xl font-bold mb-3"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.3 }}
            >
              {t('clientPortal.dashboard.welcome')} <span className="bg-gradient-to-r from-primary via-purple-400 to-pink-400 bg-clip-text text-transparent">AVA Statistics</span>
            </motion.h1>
            <motion.p 
              className="text-muted-foreground text-lg"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.4 }}
            >
              Agent: <span className="font-semibold text-foreground">{session?.agentName}</span>
            </motion.p>
          </div>
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.5 }}
            className="hidden md:flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/30"
          >
            <Zap className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium">{t('clientPortal.dashboard.liveStatus')}</span>
          </motion.div>
        </div>
      </motion.div>

      {/* Loading State */}
      {isLoading && !hasData && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      )}

      {/* No Data State */}
      {!isLoading && !hasData && (
        <motion.div variants={itemVariants}>
          <Card className="bg-card/50 backdrop-blur-sm border-border/30">
            <CardContent className="flex flex-col items-center justify-center py-12">
              <AlertCircle className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">{t('clientPortal.dashboard.configRequired')}</h3>
              <p className="text-muted-foreground text-center max-w-md">
                {t('clientPortal.dashboard.noDataAvailable')}
              </p>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Stats Grid */}
      {hasData && (
        <>
          <motion.div variants={itemVariants} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <PortalStatCard
              title={t('clientPortal.dashboard.totalConversations')}
              value={analytics?.metrics?.total_conversations || conversationsData?.total || 0}
              icon={MessageSquare}
              gradient="blue"
              trend={{ value: 12, isPositive: true }}
            />
            <PortalStatCard
              title={t('clientPortal.dashboard.avgDuration')}
              value={formatDuration(analytics?.metrics?.avg_duration || 0)}
              icon={Clock}
              gradient="green"
              trend={{ value: 8, isPositive: true }}
            />
            <PortalStatCard
              title={t('clientPortal.dashboard.callsToday')}
              value={analytics?.metrics?.today_conversations || 0}
              icon={Phone}
              gradient="purple"
              trend={{ value: 5, isPositive: true }}
            />
            <PortalStatCard
              title={t('clientPortal.dashboard.successRate')}
              value={`${analytics?.metrics?.success_rate || 0}%`}
              icon={Activity}
              gradient="pink"
              trend={{ value: 3, isPositive: true }}
            />
          </motion.div>

          {/* Quick Actions */}
          <motion.div variants={itemVariants}>
            <h3 className="text-lg font-semibold mb-4">{t('clientPortal.dashboard.quickActions')}</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {quickActions.map((action, i) => (
                <motion.div
                  key={action.label}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.6 + i * 0.1 }}
                >
                  <Link to={action.href}>
                    <Card className="group bg-card/50 backdrop-blur-sm border-border/30 hover:border-primary/50 transition-all cursor-pointer overflow-hidden">
                      <CardContent className="p-6 flex items-center gap-4">
                        <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${action.gradient} flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform`}>
                          <action.icon className="h-6 w-6 text-white" />
                        </div>
                        <div className="flex-1">
                          <p className="font-medium group-hover:text-primary transition-colors">{action.label}</p>
                        </div>
                        <ArrowRight className="h-5 w-5 text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition-all" />
                      </CardContent>
                    </Card>
                  </Link>
                </motion.div>
              ))}
            </div>
          </motion.div>

          {/* Charts */}
          <motion.div variants={itemVariants} className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Card className="lg:col-span-2 bg-card/50 backdrop-blur-sm border-border/30">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5 text-primary" />
                  {t('clientPortal.dashboard.conversationTrend')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-[300px]">
                  {chartData.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={chartData}>
                        <defs>
                          <linearGradient id="colorConversations" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3}/>
                            <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                        <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                        <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
                        <Tooltip 
                          contentStyle={{ 
                            backgroundColor: 'hsl(var(--card))', 
                            border: '1px solid hsl(var(--border))',
                            borderRadius: '12px',
                            boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
                          }}
                        />
                        <Area 
                          type="monotone" 
                          dataKey="conversations" 
                          stroke="hsl(var(--primary))" 
                          strokeWidth={3}
                          fillOpacity={1} 
                          fill="url(#colorConversations)" 
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="flex items-center justify-center h-full text-muted-foreground">
                      {t('clientPortal.dashboard.notEnoughData')}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Quick Stats Card */}
            <Card className="bg-gradient-to-br from-primary/5 via-purple-500/5 to-pink-500/5 border-border/30">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-primary" />
                  {t('clientPortal.dashboard.aiInsights')}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {[
                  { label: t('clientPortal.dashboard.successfulConversations'), value: analytics?.metrics?.successful_conversations || 0, color: 'text-green-400' },
                  { label: t('clientPortal.dashboard.totalDuration'), value: formatDuration(analytics?.metrics?.total_duration || 0), color: 'text-blue-400' },
                  { label: t('clientPortal.dashboard.failedCalls'), value: analytics?.metrics?.failed_conversations || 0, color: 'text-red-400' },
                ].map((item, i) => (
                  <motion.div 
                    key={item.label}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.5 + i * 0.1 }}
                    className="flex items-center justify-between p-4 rounded-xl bg-card/50 border border-border/30 hover:border-primary/30 transition-colors"
                  >
                    <span className="text-sm text-muted-foreground">{item.label}</span>
                    <span className={`font-bold text-lg ${item.color}`}>{item.value}</span>
                  </motion.div>
                ))}
              </CardContent>
            </Card>
          </motion.div>
        </>
      )}
    </motion.div>
    </>
  );
};

export default PortalDashboard;
