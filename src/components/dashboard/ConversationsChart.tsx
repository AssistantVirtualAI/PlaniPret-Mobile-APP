import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { 
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, 
  Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line,
  RadialBarChart, RadialBar, Legend, ComposedChart
} from 'recharts';
import { DashboardMetrics } from '@/hooks/useDashboardMetrics';
import { TrendingUp, PieChartIcon, Star, Activity, Zap, Clock } from 'lucide-react';
import { motion } from 'framer-motion';
import { useTranslation } from '@/hooks/useTranslation';

interface ConversationsChartProps {
  metrics: DashboardMetrics;
}

const COLORS = ['#8B5CF6', '#06b6d4', '#f59e0b', '#10b981', '#ef4444', '#ec4899'];
const GRADIENT_COLORS = {
  primary: { start: '#8B5CF6', end: '#6366f1' },
  cyan: { start: '#06b6d4', end: '#0891b2' },
  amber: { start: '#f59e0b', end: '#d97706' },
  emerald: { start: '#10b981', end: '#059669' },
  pink: { start: '#ec4899', end: '#db2777' },
};

// Custom tooltip component with gradient background
const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload || !payload.length) return null;
  
  return (
    <div className="bg-gradient-to-br from-card via-card to-card/90 backdrop-blur-xl border border-border/50 rounded-xl p-3 shadow-2xl">
      <p className="text-sm font-semibold text-foreground mb-2">{label}</p>
      {payload.map((entry: any, index: number) => (
        <div key={index} className="flex items-center gap-2 text-sm">
          <div 
            className="w-2.5 h-2.5 rounded-full"
            style={{ backgroundColor: entry.color }}
          />
          <span className="text-muted-foreground">{entry.name}:</span>
          <span className="font-bold text-foreground">{entry.value}</span>
        </div>
      ))}
    </div>
  );
};

export const ConversationsChart = ({ metrics }: ConversationsChartProps) => {
  const { t } = useTranslation();

  // Use real data only — no fake placeholders
  const weeklyData = metrics.weeklyData && metrics.weeklyData.length > 0
    ? metrics.weeklyData
    : [];

  const hasWeeklyData = weeklyData.length > 0 && weeklyData.some(d => d.conversations > 0);

  const platformData = metrics.platformDistribution.length > 0 
    ? metrics.platformDistribution.map(p => ({
        name: p.platform.charAt(0).toUpperCase() + p.platform.slice(1),
        value: p.count,
      }))
    : [];

  const hasPlatformData = platformData.length > 0;

  // Sentiment data for radial chart
  const totalSentiment = (metrics.sentimentBreakdown.positive || 0) + (metrics.sentimentBreakdown.neutral || 0) + (metrics.sentimentBreakdown.negative || 0);
  const sentimentData = totalSentiment > 0 ? [
    { name: t('dashboard.charts.positive'), value: Math.round((metrics.sentimentBreakdown.positive / totalSentiment) * 100), fill: '#10b981' },
    { name: t('dashboard.charts.neutral'), value: Math.round((metrics.sentimentBreakdown.neutral / totalSentiment) * 100), fill: '#f59e0b' },
    { name: t('dashboard.charts.negative'), value: Math.round((metrics.sentimentBreakdown.negative / totalSentiment) * 100), fill: '#ef4444' },
  ] : [
    { name: t('dashboard.charts.positive'), value: 0, fill: '#10b981' },
    { name: t('dashboard.charts.neutral'), value: 0, fill: '#f59e0b' },
    { name: t('dashboard.charts.negative'), value: 0, fill: '#ef4444' },
  ];

  // Peak hours: fill all 24 hours for proper time distribution
  const peakHoursMap = new Map<number, number>();
  if (metrics.peakHours && metrics.peakHours.length > 0) {
    metrics.peakHours.forEach(h => peakHoursMap.set(h.hour, h.count));
  }
  // Show business hours (6h-23h) for readability
  const peakHoursData: { hour: string; count: number }[] = [];
  for (let h = 6; h <= 23; h++) {
    peakHoursData.push({ hour: `${h}h`, count: peakHoursMap.get(h) || 0 });
  }
  const hasPeakData = peakHoursData.some(d => d.count > 0);

  const hasData = metrics.dataSource === 'elevenlabs' || metrics.totalConversations > 0;

  const cardVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0 },
  };

  return (
    <div className="space-y-6">
      {/* Main charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Conversations Area Chart with dual gradients */}
        <motion.div
          variants={cardVariants}
          initial="hidden"
          animate="visible"
          transition={{ delay: 0.1 }}
          className="lg:col-span-2"
        >
          <Card className="relative overflow-hidden bg-gradient-to-br from-card via-card to-primary/5 backdrop-blur-xl border-border/50 hover:border-primary/40 transition-all duration-300 shadow-lg hover:shadow-primary/10">
            <div className="absolute top-0 right-0 w-40 h-40 bg-gradient-to-br from-primary/20 to-transparent rounded-full blur-3xl" />
            <CardHeader className="pb-2 relative">
              <CardTitle className="text-lg flex items-center gap-2">
                <div className="p-2 rounded-lg bg-gradient-to-br from-primary to-purple-600">
                  <TrendingUp className="h-4 w-4 text-white" />
                </div>
                <span className="bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text">
                  {t('dashboard.charts.conversationTrends')}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="relative">
              {hasWeeklyData ? (
                <ResponsiveContainer width="100%" height={300}>
                  <ComposedChart data={weeklyData}>
                    <defs>
                      <linearGradient id="conversationsGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#8B5CF6" stopOpacity={0.8}/>
                        <stop offset="50%" stopColor="#8B5CF6" stopOpacity={0.4}/>
                        <stop offset="100%" stopColor="#8B5CF6" stopOpacity={0.05}/>
                      </linearGradient>
                      <filter id="glow">
                        <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
                        <feMerge>
                          <feMergeNode in="coloredBlur"/>
                          <feMergeNode in="SourceGraphic"/>
                        </feMerge>
                      </filter>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                    <XAxis 
                      dataKey="name" 
                      stroke="hsl(var(--muted-foreground))" 
                      fontSize={12}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis 
                      yAxisId="left"
                      stroke="hsl(var(--muted-foreground))" 
                      fontSize={12}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis 
                      yAxisId="right"
                      orientation="right"
                      stroke="#f59e0b" 
                      fontSize={12}
                      tickLine={false}
                      axisLine={false}
                      domain={[0, 5]}
                    />
                    <Tooltip content={<CustomTooltip />} />
                    <Area 
                      yAxisId="left"
                      type="monotone" 
                      dataKey="conversations" 
                      stroke="#8B5CF6" 
                      strokeWidth={3}
                      fillOpacity={1} 
                      fill="url(#conversationsGradient)" 
                      name={t('dashboard.stats.conversations')}
                      filter="url(#glow)"
                    />
                    <Line
                      yAxisId="right"
                      type="monotone"
                      dataKey="satisfaction"
                      stroke="#f59e0b"
                      strokeWidth={3}
                      dot={{ fill: '#f59e0b', strokeWidth: 2, r: 5 }}
                      activeDot={{ r: 8, stroke: '#f59e0b', strokeWidth: 2, fill: '#fff' }}
                      name={t('dashboard.stats.satisfaction')}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex flex-col items-center justify-center h-[300px] text-muted-foreground">
                  <TrendingUp className="h-12 w-12 mb-3 opacity-20" />
                  <p className="text-sm font-medium">{t('dashboard.charts.noDataYet')}</p>
                  <p className="text-xs mt-1">{t('dashboard.charts.configureAgents')}</p>
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* Platform Distribution Pie Chart with gradient */}
        <motion.div
          variants={cardVariants}
          initial="hidden"
          animate="visible"
          transition={{ delay: 0.2 }}
        >
          <Card className="relative overflow-hidden bg-gradient-to-br from-card via-card to-cyan-500/5 backdrop-blur-xl border-border/50 hover:border-cyan-500/40 transition-all duration-300 shadow-lg hover:shadow-cyan-500/10 h-full">
            <div className="absolute bottom-0 left-0 w-32 h-32 bg-gradient-to-tr from-cyan-500/20 to-transparent rounded-full blur-2xl" />
            <CardHeader className="pb-2 relative">
              <CardTitle className="text-lg flex items-center gap-2">
                <div className="p-2 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-600">
                  <PieChartIcon className="h-4 w-4 text-white" />
                </div>
                {t('dashboard.charts.platformDistribution')}
              </CardTitle>
            </CardHeader>
            <CardContent className="relative">
              {hasPlatformData ? (
                <>
                  <ResponsiveContainer width="100%" height={220}>
                    <PieChart>
                      <defs>
                        {COLORS.map((color, index) => (
                          <linearGradient key={index} id={`pieGradient${index}`} x1="0" y1="0" x2="1" y2="1">
                            <stop offset="0%" stopColor={color} stopOpacity={1}/>
                            <stop offset="100%" stopColor={color} stopOpacity={0.7}/>
                          </linearGradient>
                        ))}
                      </defs>
                      <Pie
                        data={platformData}
                        cx="50%"
                        cy="50%"
                        innerRadius={55}
                        outerRadius={85}
                        paddingAngle={4}
                        dataKey="value"
                        stroke="none"
                      >
                        {platformData.map((_, index) => (
                          <Cell 
                            key={`cell-${index}`} 
                            fill={`url(#pieGradient${index})`}
                            className="hover:opacity-80 transition-opacity cursor-pointer drop-shadow-lg"
                          />
                        ))}
                      </Pie>
                      <Tooltip content={<CustomTooltip />} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="flex flex-wrap justify-center gap-3 mt-2">
                    {platformData.map((entry, index) => (
                      <motion.div 
                        key={entry.name} 
                        className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-muted/50 hover:bg-muted transition-colors cursor-pointer"
                        whileHover={{ scale: 1.05 }}
                      >
                        <div
                          className="w-2.5 h-2.5 rounded-full shadow-sm"
                          style={{ backgroundColor: COLORS[index % COLORS.length] }}
                        />
                        <span className="text-xs text-muted-foreground">{entry.name}</span>
                        <span className="text-xs font-bold">{entry.value}</span>
                      </motion.div>
                    ))}
                  </div>
                </>
              ) : (
                <div className="flex flex-col items-center justify-center h-[280px] text-muted-foreground">
                  <PieChartIcon className="h-12 w-12 mb-3 opacity-20" />
                  <p className="text-sm font-medium">{t('dashboard.charts.noDataYet')}</p>
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Second row - Peak Hours and Sentiment */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Peak Hours Bar Chart */}
        <motion.div
          variants={cardVariants}
          initial="hidden"
          animate="visible"
          transition={{ delay: 0.3 }}
        >
          <Card className="relative overflow-hidden bg-gradient-to-br from-card via-card to-emerald-500/5 backdrop-blur-xl border-border/50 hover:border-emerald-500/40 transition-all duration-300 shadow-lg hover:shadow-emerald-500/10">
            <div className="absolute top-0 left-0 w-32 h-32 bg-gradient-to-br from-emerald-500/15 to-transparent rounded-full blur-2xl" />
            <CardHeader className="pb-2 relative">
              <CardTitle className="text-lg flex items-center gap-2">
                <div className="p-2 rounded-lg bg-gradient-to-br from-emerald-500 to-green-600">
                  <Clock className="h-4 w-4 text-white" />
                </div>
                {t('dashboard.charts.peakHours')}
              </CardTitle>
            </CardHeader>
            <CardContent className="relative">
              {hasPeakData ? (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={peakHoursData} barGap={2}>
                    <defs>
                      <linearGradient id="barGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#10b981" stopOpacity={1}/>
                        <stop offset="100%" stopColor="#059669" stopOpacity={0.8}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} vertical={false} />
                    <XAxis 
                      dataKey="hour" 
                      stroke="hsl(var(--muted-foreground))" 
                      fontSize={10}
                      tickLine={false}
                      axisLine={false}
                      interval={1}
                    />
                    <YAxis 
                      stroke="hsl(var(--muted-foreground))" 
                      fontSize={11}
                      tickLine={false}
                      axisLine={false}
                      allowDecimals={false}
                    />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar 
                      dataKey="count" 
                      fill="url(#barGradient)" 
                      radius={[4, 4, 0, 0]}
                      name={t('dashboard.charts.calls')}
                      className="drop-shadow-md"
                    />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex flex-col items-center justify-center h-[220px] text-muted-foreground">
                  <Clock className="h-12 w-12 mb-3 opacity-20" />
                  <p className="text-sm font-medium">{t('dashboard.charts.noDataYet')}</p>
                  <p className="text-xs mt-1">{t('dashboard.charts.configureAgents')}</p>
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* Sentiment Radial Chart */}
        <motion.div
          variants={cardVariants}
          initial="hidden"
          animate="visible"
          transition={{ delay: 0.4 }}
        >
          <Card className="relative overflow-hidden bg-gradient-to-br from-card via-card to-pink-500/5 backdrop-blur-xl border-border/50 hover:border-pink-500/40 transition-all duration-300 shadow-lg hover:shadow-pink-500/10">
            <div className="absolute bottom-0 right-0 w-32 h-32 bg-gradient-to-tl from-pink-500/15 to-transparent rounded-full blur-2xl" />
            <CardHeader className="pb-2 relative">
              <CardTitle className="text-lg flex items-center gap-2">
                <div className="p-2 rounded-lg bg-gradient-to-br from-pink-500 to-rose-600">
                  <Activity className="h-4 w-4 text-white" />
                </div>
                {t('dashboard.charts.sentimentAnalysis')}
              </CardTitle>
            </CardHeader>
            <CardContent className="relative">
              <div className="flex items-center gap-4">
                <ResponsiveContainer width="60%" height={200}>
                  <RadialBarChart 
                    cx="50%" 
                    cy="50%" 
                    innerRadius="30%" 
                    outerRadius="100%" 
                    data={sentimentData} 
                    startAngle={180} 
                    endAngle={0}
                  >
                    <RadialBar
                      background={{ fill: 'hsl(var(--muted))' }}
                      dataKey="value"
                      cornerRadius={10}
                    />
                    <Tooltip content={<CustomTooltip />} />
                  </RadialBarChart>
                </ResponsiveContainer>
                <div className="flex flex-col gap-3">
                  {sentimentData.map((entry, index) => (
                    <motion.div 
                      key={entry.name}
                      className="flex items-center gap-3"
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.5 + index * 0.1 }}
                    >
                      <div 
                        className="w-3 h-3 rounded-full shadow-lg"
                        style={{ backgroundColor: entry.fill }}
                      />
                      <div>
                        <p className="text-sm font-medium">{entry.name}</p>
                        <p className="text-lg font-bold" style={{ color: entry.fill }}>
                          {entry.value}%
                        </p>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Satisfaction Trend Line Chart - Full width */}
      {metrics.weeklyData && metrics.weeklyData.some(d => d.satisfaction > 0) && (
        <motion.div
          variants={cardVariants}
          initial="hidden"
          animate="visible"
          transition={{ delay: 0.5 }}
        >
          <Card className="relative overflow-hidden bg-gradient-to-br from-card via-card to-amber-500/5 backdrop-blur-xl border-border/50 hover:border-amber-500/40 transition-all duration-300 shadow-lg hover:shadow-amber-500/10">
            <div className="absolute top-1/2 right-0 w-48 h-48 bg-gradient-to-l from-amber-500/10 to-transparent rounded-full blur-3xl -translate-y-1/2" />
            <CardHeader className="pb-2 relative">
              <CardTitle className="text-lg flex items-center gap-2">
                <div className="p-2 rounded-lg bg-gradient-to-br from-amber-500 to-orange-600">
                  <Star className="h-4 w-4 text-white" />
                </div>
                {t('dashboard.charts.satisfactionEvolution')}
              </CardTitle>
            </CardHeader>
            <CardContent className="relative">
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={weeklyData}>
                  <defs>
                    <linearGradient id="satisfactionAreaGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.6}/>
                      <stop offset="50%" stopColor="#f59e0b" stopOpacity={0.2}/>
                      <stop offset="100%" stopColor="#f59e0b" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                  <XAxis 
                    dataKey="name" 
                    stroke="hsl(var(--muted-foreground))" 
                    fontSize={12}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis 
                    stroke="hsl(var(--muted-foreground))" 
                    fontSize={12}
                    tickLine={false}
                    axisLine={false}
                    domain={[0, 5]}
                    ticks={[0, 1, 2, 3, 4, 5]}
                  />
                  <Tooltip 
                    content={<CustomTooltip />}
                    formatter={(value: number) => [`${value.toFixed(1)}/5`, t('dashboard.stats.satisfaction')]}
                  />
                  <Area 
                    type="monotone" 
                    dataKey="satisfaction" 
                    stroke="#f59e0b" 
                    strokeWidth={3}
                    fill="url(#satisfactionAreaGradient)"
                    dot={{ fill: '#f59e0b', strokeWidth: 2, r: 5, stroke: '#fff' }}
                    activeDot={{ r: 8, stroke: '#f59e0b', strokeWidth: 3, fill: '#fff' }}
                    name={t('dashboard.stats.satisfaction')}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </motion.div>
      )}
    </div>
  );
};
