import { usePortal } from '@/hooks/usePortalAuth';
import { usePortalPlatformAnalytics } from '@/hooks/usePortalPlatformData';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BarChart3, TrendingUp, Clock, MessageSquare, Users, Zap, Loader2, AlertCircle, Brain, Target, CheckCircle, AlertTriangle, Sparkles } from 'lucide-react';
import { motion } from 'framer-motion';
import { PortalPageHeader } from '@/components/portal/PortalPageHeader';
import { PortalStatCard } from '@/components/portal/PortalStatCard';
import { GlowBadge } from '@/components/portal/GlowBadge';
import { 
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend 
} from 'recharts';
import { useTranslation } from '@/hooks/useTranslation';

const PortalAnalytics = () => {
  const { t, language } = useTranslation();
  const { session } = usePortal();
  const { data: analytics, isLoading } = usePortalPlatformAnalytics('7days');
  const { data: analytics30, isLoading: analytics30Loading } = usePortalPlatformAnalytics('30days');

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { staggerChildren: 0.1 } }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0 }
  };

  // Format chart data
  const conversationData = analytics?.charts?.conversations_over_time?.map(item => ({
    name: new Date(item.date).toLocaleDateString(language === 'fr' ? 'fr-FR' : 'en-US', { weekday: 'short' }),
    calls: item.count,
  })) || [];

  const hourlyData = analytics?.charts?.peak_hours?.map(item => ({
    hour: `${item.hour}h`,
    calls: item.count,
  })) || [];

  // Calculate sentiment data from success rate
  const successRate = analytics?.metrics?.success_rate || 0;
  const sentimentData = [
    { name: t('clientPortal.analytics.successful'), value: successRate, color: 'hsl(var(--success))' },
    { name: t('clientPortal.analytics.failed'), value: 100 - successRate, color: 'hsl(var(--destructive))' },
  ];

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatTotalDuration = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    if (hours > 0) return `${hours}h${mins}m`;
    return `${mins}m`;
  };

  // AI Analysis data (from 30 days)
  const totalConversations30 = analytics30?.metrics?.total_conversations || 0;
  const successRate30 = analytics30?.metrics?.success_rate || 0;
  const avgDuration30 = analytics30?.metrics?.avg_duration || 0;

  const insights = [
    {
      title: t('clientPortal.analytics.globalPerf'),
      value: successRate30 >= 80 ? t('clientPortal.analytics.excellent') : successRate30 >= 60 ? t('clientPortal.analytics.good') : t('clientPortal.analytics.needsImprovement'),
      description: t('clientPortal.analytics.successRateOf').replace('{rate}', String(successRate30)).replace('{total}', String(totalConversations30)),
      icon: TrendingUp,
      color: successRate30 >= 80 ? 'text-green-400' : successRate30 >= 60 ? 'text-yellow-400' : 'text-red-400',
      bgColor: successRate30 >= 80 ? 'from-green-500/10 to-emerald-500/10' : successRate30 >= 60 ? 'from-yellow-500/10 to-orange-500/10' : 'from-red-500/10 to-pink-500/10',
    },
    {
      title: t('clientPortal.analytics.optimalDuration'),
      value: avgDuration30 < 180 ? t('clientPortal.analytics.efficient') : avgDuration30 < 300 ? t('clientPortal.analytics.normal') : t('clientPortal.analytics.long'),
      description: t('clientPortal.analytics.avgDurationOf').replace('{duration}', formatDuration(avgDuration30)),
      icon: Target,
      color: avgDuration30 < 180 ? 'text-green-400' : avgDuration30 < 300 ? 'text-yellow-400' : 'text-orange-400',
      bgColor: avgDuration30 < 180 ? 'from-green-500/10 to-emerald-500/10' : avgDuration30 < 300 ? 'from-yellow-500/10 to-orange-500/10' : 'from-orange-500/10 to-red-500/10',
    },
    {
      title: t('clientPortal.analytics.callVolume'),
      value: totalConversations30 > 100 ? t('clientPortal.analytics.high') : totalConversations30 > 50 ? t('clientPortal.analytics.moderate') : t('clientPortal.analytics.low'),
      description: t('clientPortal.analytics.recordedConversations').replace('{count}', String(totalConversations30)),
      icon: MessageSquare,
      color: 'text-blue-400',
      bgColor: 'from-blue-500/10 to-cyan-500/10',
    },
  ];

  const recommendations = [
    {
      type: 'success',
      title: t('clientPortal.analytics.strengths'),
      items: [
        successRate30 >= 70 && t('clientPortal.analytics.goodResolutionRate'),
        avgDuration30 < 300 && t('clientPortal.analytics.optimizedCallDuration'),
        totalConversations30 > 50 && t('clientPortal.analytics.satisfactoryUsageVolume'),
      ].filter(Boolean),
      icon: CheckCircle,
      color: 'text-green-400',
      bgColor: 'bg-green-500/10',
    },
    {
      type: 'warning',
      title: t('clientPortal.analytics.improvements'),
      items: [
        successRate30 < 70 && t('clientPortal.analytics.improveSuccessRate'),
        avgDuration30 > 300 && t('clientPortal.analytics.optimizeCallDuration'),
        totalConversations30 < 20 && t('clientPortal.analytics.increaseAgentUsage'),
      ].filter(Boolean),
      icon: AlertTriangle,
      color: 'text-yellow-400',
      bgColor: 'bg-yellow-500/10',
    },
  ];

  return (
    <motion.div variants={containerVariants} initial="hidden" animate="visible" className="space-y-6">
      <PortalPageHeader
        icon={BarChart3}
        title={t('clientPortal.analytics.title')}
        description={session?.agentName}
        gradient="purple-pink"
      />

      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      )}

      {!isLoading && !analytics && (
        <Card className="bg-card/50 backdrop-blur-sm border-border/30">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <AlertCircle className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">{t('clientPortal.analytics.notEnoughData')}</h3>
            <p className="text-muted-foreground text-center max-w-md">
              {t('clientPortal.dashboard.noDataAvailable')}
            </p>
          </CardContent>
        </Card>
      )}

      {analytics && (
        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList className="bg-muted/30 border border-border/30">
            <TabsTrigger value="overview" className="gap-2">
              <BarChart3 className="h-4 w-4" />
              {t('clientPortal.analytics.overview')}
            </TabsTrigger>
            <TabsTrigger value="ai-analysis" className="gap-2">
              <Brain className="h-4 w-4" />
              {t('clientPortal.analytics.aiAnalysis')}
            </TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-6">
            {/* Stats Grid */}
            <motion.div variants={itemVariants} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <PortalStatCard
                title={t('clientPortal.analytics.totalConversations')}
                value={analytics.metrics.total_conversations}
                icon={MessageSquare}
                gradient="blue"
                trend={{ value: 12, isPositive: true }}
              />
              <PortalStatCard
                title={t('clientPortal.analytics.totalDuration')}
                value={formatTotalDuration(analytics.metrics.total_duration)}
                icon={Clock}
                gradient="purple"
                trend={{ value: 8, isPositive: true }}
              />
              <PortalStatCard
                title={t('clientPortal.analytics.avgDuration')}
                value={formatDuration(analytics.metrics.avg_duration)}
                icon={TrendingUp}
                gradient="green"
                trend={{ value: 5, isPositive: true }}
              />
              <PortalStatCard
                title={t('clientPortal.analytics.today')}
                value={analytics.metrics.today_conversations}
                icon={Users}
                gradient="pink"
                trend={{ value: 15, isPositive: true }}
              />
            </motion.div>

            {/* Charts Row 1 */}
            <motion.div variants={itemVariants} className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Conversations Trend */}
              <Card className="bg-card/50 backdrop-blur-sm border-border/30">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <TrendingUp className="h-5 w-5 text-primary" />
                    {t('clientPortal.analytics.conversationTrend')}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-[300px]">
                    {conversationData.length > 0 ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={conversationData}>
                          <defs>
                            <linearGradient id="colorCalls" x1="0" y1="0" x2="0" y2="1">
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
                              borderRadius: '12px'
                            }}
                          />
                          <Area 
                            type="monotone" 
                            dataKey="calls" 
                            stroke="hsl(var(--primary))" 
                            strokeWidth={3}
                            fillOpacity={1} 
                            fill="url(#colorCalls)" 
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="flex items-center justify-center h-full text-muted-foreground">
                        {t('clientPortal.analytics.notEnoughData')}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Hourly Distribution */}
              <Card className="bg-card/50 backdrop-blur-sm border-border/30">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Clock className="h-5 w-5 text-purple-400" />
                    {t('clientPortal.analytics.peakHours')}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-[300px]">
                    {hourlyData.length > 0 ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={hourlyData}>
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                          <XAxis dataKey="hour" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                          <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
                          <Tooltip 
                            contentStyle={{ 
                              backgroundColor: 'hsl(var(--card))', 
                              border: '1px solid hsl(var(--border))',
                              borderRadius: '12px'
                            }}
                          />
                          <Bar 
                            dataKey="calls" 
                            fill="hsl(var(--primary))" 
                            radius={[6, 6, 0, 0]}
                          />
                        </BarChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="flex items-center justify-center h-full text-muted-foreground">
                        {t('clientPortal.analytics.notEnoughData')}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </motion.div>

            {/* Charts Row 2 */}
            <motion.div variants={itemVariants} className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Success Rate Pie */}
              <Card className="bg-card/50 backdrop-blur-sm border-border/30">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Zap className="h-5 w-5 text-yellow-400" />
                    {t('clientPortal.analytics.successRate')}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-[250px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={sentimentData}
                          cx="50%"
                          cy="50%"
                          innerRadius={60}
                          outerRadius={90}
                          paddingAngle={5}
                          dataKey="value"
                        >
                          {sentimentData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip 
                          contentStyle={{ 
                            backgroundColor: 'hsl(var(--card))', 
                            border: '1px solid hsl(var(--border))',
                            borderRadius: '12px'
                          }}
                          formatter={(value: number) => [`${value.toFixed(1)}%`, '']}
                        />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>

              {/* AI Insights */}
              <Card className="lg:col-span-2 bg-gradient-to-br from-primary/5 via-purple-500/5 to-pink-500/5 border-border/30">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Zap className="h-5 w-5 text-primary animate-pulse" />
                    {t('clientPortal.analytics.aiInsights')}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {[
                      { 
                        title: t('clientPortal.analytics.successful'), 
                        value: `${analytics.metrics.successful_conversations}`, 
                        desc: t('clientPortal.analytics.onTotal').replace('{total}', String(analytics.metrics.total_conversations))
                      },
                      { 
                        title: t('clientPortal.analytics.failed'), 
                        value: `${analytics.metrics.failed_conversations}`, 
                        desc: t('clientPortal.analytics.needAttention')
                      },
                      { 
                        title: t('clientPortal.analytics.successRate'), 
                        value: `${analytics.metrics.success_rate}%`, 
                        desc: t('clientPortal.analytics.globalPerformance')
                      },
                      { 
                        title: t('clientPortal.analytics.avgDuration'), 
                        value: formatDuration(analytics.metrics.avg_duration), 
                        desc: t('clientPortal.analytics.perConversation')
                      },
                    ].map((insight, i) => (
                      <motion.div
                        key={insight.title}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.5 + i * 0.1 }}
                        className="p-4 rounded-xl bg-card/50 border border-border/30 hover:border-primary/30 transition-colors"
                      >
                        <p className="text-sm text-muted-foreground mb-1">{insight.title}</p>
                        <p className="text-xl font-bold text-primary">{insight.value}</p>
                        <p className="text-xs text-muted-foreground mt-1">{insight.desc}</p>
                      </motion.div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          </TabsContent>

          {/* AI Analysis Tab */}
          <TabsContent value="ai-analysis" className="space-y-6">
            {analytics30Loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : (
              <>
                {/* AI Score Card */}
                <motion.div variants={itemVariants}>
                  <Card className="bg-gradient-to-br from-primary/10 via-purple-500/10 to-pink-500/10 border-primary/20 overflow-hidden">
                    <CardContent className="p-8">
                      <div className="flex items-center justify-between flex-wrap gap-6">
                        <div>
                          <div className="flex items-center gap-3 mb-4">
                            <motion.div 
                              className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary to-purple-500 flex items-center justify-center"
                              animate={{ scale: [1, 1.05, 1] }}
                              transition={{ repeat: Infinity, duration: 2 }}
                            >
                              <Sparkles className="h-7 w-7 text-white" />
                            </motion.div>
                            <div>
                              <h2 className="text-2xl font-bold">{t('clientPortal.analytics.performanceScore')}</h2>
                              <p className="text-muted-foreground">{t('clientPortal.analytics.days30Analysis')}</p>
                            </div>
                          </div>
                        </div>
                        <div className="text-right">
                          <motion.div 
                            className="text-6xl font-bold bg-gradient-to-r from-primary to-purple-400 bg-clip-text text-transparent"
                            initial={{ scale: 0.5, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            transition={{ type: "spring", stiffness: 200 }}
                          >
                            {successRate30}%
                          </motion.div>
                          <p className="text-muted-foreground">{t('clientPortal.analytics.successRate')}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>

                {/* Insights Grid */}
                <motion.div variants={itemVariants} className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {insights.map((insight, i) => (
                    <motion.div
                      key={insight.title}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.3 + i * 0.1 }}
                    >
                      <Card className={`bg-gradient-to-br ${insight.bgColor} border-border/30 hover:border-primary/30 transition-all`}>
                        <CardContent className="p-6">
                          <div className="flex items-center gap-3 mb-4">
                            <div className="w-10 h-10 rounded-xl bg-card/50 flex items-center justify-center">
                              <insight.icon className={`h-5 w-5 ${insight.color}`} />
                            </div>
                            <h3 className="font-semibold">{insight.title}</h3>
                          </div>
                          <p className={`text-2xl font-bold ${insight.color} mb-2`}>{insight.value}</p>
                          <p className="text-sm text-muted-foreground">{insight.description}</p>
                        </CardContent>
                      </Card>
                    </motion.div>
                  ))}
                </motion.div>

                {/* Recommendations */}
                <motion.div variants={itemVariants} className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {recommendations.map((rec, i) => (
                    <motion.div
                      key={rec.type}
                      initial={{ opacity: 0, x: i === 0 ? -20 : 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.5 + i * 0.1 }}
                    >
                      <Card className={`${rec.bgColor} border-border/30`}>
                        <CardHeader>
                          <CardTitle className={`flex items-center gap-2 ${rec.color}`}>
                            <rec.icon className="h-5 w-5" />
                            {rec.title}
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          {rec.items.length > 0 ? (
                            <ul className="space-y-3">
                              {rec.items.map((item, j) => (
                                <motion.li 
                                  key={j} 
                                  className="flex items-start gap-2"
                                  initial={{ opacity: 0, x: -10 }}
                                  animate={{ opacity: 1, x: 0 }}
                                  transition={{ delay: 0.7 + j * 0.1 }}
                                >
                                  <div className={`w-5 h-5 rounded-full ${rec.bgColor} flex items-center justify-center shrink-0 mt-0.5`}>
                                    <rec.icon className={`h-3 w-3 ${rec.color}`} />
                                  </div>
                                  <span className="text-sm">{item}</span>
                                </motion.li>
                              ))}
                            </ul>
                          ) : (
                            <p className="text-muted-foreground text-sm">
                              {rec.type === 'success' ? '🎉 ' : ''}{t('clientPortal.analytics.notEnoughData')}
                            </p>
                          )}
                        </CardContent>
                      </Card>
                    </motion.div>
                  ))}
                </motion.div>
              </>
            )}
          </TabsContent>
        </Tabs>
      )}
    </motion.div>
  );
};

export default PortalAnalytics;
