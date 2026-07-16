import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useClientAgentAccess } from '@/hooks/useClientAgentAccess';
import { useClientElevenLabsAnalytics } from '@/hooks/useClientElevenLabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  BarChart3, 
  Clock, 
  MessageSquare, 
  Phone,
  ThumbsUp,
  TrendingUp,
  TrendingDown,
  Calendar,
  Download,
  FileSpreadsheet,
  FileText
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, AreaChart, Area } from 'recharts';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { toast } from 'sonner';
import { exportMetricsToPDF } from '@/utils/pdfExport';

type Timeframe = '24h' | '7d' | '30d' | '90d';

const StatCard = ({ 
  title, 
  value, 
  icon: Icon, 
  trend, 
  trendValue,
  isLoading 
}: { 
  title: string; 
  value: string | number; 
  icon: any; 
  trend?: 'up' | 'down' | 'neutral';
  trendValue?: string;
  isLoading?: boolean;
}) => (
  <Card>
    <CardContent className="p-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">{title}</p>
          {isLoading ? (
            <Skeleton className="h-8 w-20 mt-1" />
          ) : (
            <>
              <p className="text-2xl font-bold">{value}</p>
              {trendValue && (
                <p className={`text-xs flex items-center gap-1 mt-1 ${
                  trend === 'up' ? 'text-green-600' : 
                  trend === 'down' ? 'text-red-600' : 'text-muted-foreground'
                }`}>
                  {trend === 'up' ? <TrendingUp className="h-3 w-3" /> : 
                   trend === 'down' ? <TrendingDown className="h-3 w-3" /> : null}
                  {trendValue}
                </p>
              )}
            </>
          )}
        </div>
        <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
          <Icon className="h-6 w-6 text-primary" />
        </div>
      </div>
    </CardContent>
  </Card>
);

const ClientAgentAnalytics = () => {
  const { clientId, agentId } = useParams();
  const { apiKey, platformAgentId, agentName, organizationId } = useClientAgentAccess(clientId, agentId);
  const [timeframe, setTimeframe] = useState<Timeframe>('7d');
  const [isExporting, setIsExporting] = useState(false);

  const { data: analytics, isLoading } = useClientElevenLabsAnalytics({
    apiKey,
    agentId: platformAgentId,
    organizationId,
  }, timeframe);

  const metrics = analytics?.metrics || {};
  const trends = analytics?.trends || {};
  const chartData = analytics?.charts?.conversations_over_time || [];
  const satisfactionData = analytics?.charts?.satisfaction_trend || [];

  const timeframeOptions: { value: Timeframe; label: string }[] = [
    { value: '24h', label: '24h' },
    { value: '7d', label: '7 jours' },
    { value: '30d', label: '30 jours' },
    { value: '90d', label: '90 jours' },
  ];

  const getTimeframeLabel = () => {
    const option = timeframeOptions.find(o => o.value === timeframe);
    return option?.label || timeframe;
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}m ${secs}s`;
  };

  const exportToCSV = () => {
    setIsExporting(true);

    try {
      let csvContent = `Rapport Analytics - ${agentName}\n`;
      csvContent += `Période: ${getTimeframeLabel()}\n`;
      csvContent += `Généré le: ${format(new Date(), 'dd/MM/yyyy HH:mm', { locale: fr })}\n\n`;
      
      csvContent += 'MÉTRIQUES\n';
      csvContent += `Total Conversations,${metrics.total_conversations || 0}\n`;
      csvContent += `Durée Totale,${metrics.total_duration ? Math.round(metrics.total_duration / 60) : 0} min\n`;
      csvContent += `Durée Moyenne,${metrics.avg_duration ? Math.round(metrics.avg_duration / 60) : 0} min\n`;
      csvContent += `Satisfaction,${metrics.avg_satisfaction ? Math.round(metrics.avg_satisfaction * 100) : 'N/A'}%\n`;

      if (chartData.length > 0) {
        csvContent += '\nCONVERSATIONS PAR JOUR\n';
        csvContent += 'Date,Conversations,Durée Moyenne\n';
        chartData.forEach((day: any) => {
          csvContent += `${day.date},${day.count || 0},${day.avg_duration || 0}\n`;
        });
      }

      const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `analytics_${agentName}_${format(new Date(), 'yyyy-MM-dd')}.csv`;
      link.click();
      URL.revokeObjectURL(url);
      
      toast.success('Export CSV téléchargé');
    } catch (error) {
      toast.error('Erreur lors de l\'export');
    } finally {
      setIsExporting(false);
    }
  };

  const exportToPDF = async () => {
    setIsExporting(true);

    try {
      await exportMetricsToPDF({
        'Agent': agentName || 'Agent',
        'Période': getTimeframeLabel(),
        'Total Conversations': (metrics.total_conversations || 0).toString(),
        'Durée Totale': metrics.total_duration ? `${Math.round(metrics.total_duration / 60)} minutes` : '0 minutes',
        'Durée Moyenne': metrics.avg_duration ? `${Math.round(metrics.avg_duration / 60)} minutes` : '0 minutes',
        'Satisfaction': metrics.avg_satisfaction ? `${Math.round(metrics.avg_satisfaction * 100)}%` : 'N/A',
        'Appels Aujourd\'hui': (metrics.today_conversations || 0).toString(),
      }, {
        title: `Rapport Analytics - ${agentName}`,
        filename: `analytics_${agentName}_${format(new Date(), 'yyyy-MM-dd')}.pdf`,
      });

      toast.success('Export PDF téléchargé');
    } catch (error) {
      toast.error('Erreur lors de l\'export PDF');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold">Analytics</h1>
          <p className="text-muted-foreground">Statistiques de performance de {agentName}</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            {timeframeOptions.map(({ value, label }) => (
              <Button
                key={value}
                variant={timeframe === value ? 'default' : 'outline'}
                size="sm"
                onClick={() => setTimeframe(value)}
              >
                {label}
              </Button>
            ))}
          </div>
          
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="gap-2" disabled={isExporting}>
                <Download className="w-4 h-4" />
                {isExporting ? 'Export...' : 'Exporter'}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={exportToCSV} className="gap-2">
                <FileSpreadsheet className="w-4 h-4" />
                Exporter en CSV
              </DropdownMenuItem>
              <DropdownMenuItem onClick={exportToPDF} className="gap-2">
                <FileText className="w-4 h-4" />
                Exporter en PDF
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Conversations"
          value={metrics.total_conversations || 0}
          icon={MessageSquare}
          trend={trends.conversations?.direction}
          trendValue={trends.conversations?.value}
          isLoading={isLoading}
        />
        <StatCard
          title="Durée Totale"
          value={metrics.total_duration ? formatDuration(metrics.total_duration) : '0m'}
          icon={Clock}
          isLoading={isLoading}
        />
        <StatCard
          title="Durée Moyenne"
          value={metrics.avg_duration ? formatDuration(metrics.avg_duration) : '0m'}
          icon={Phone}
          trend={trends.duration?.direction}
          trendValue={trends.duration?.value}
          isLoading={isLoading}
        />
        <StatCard
          title="Satisfaction"
          value={metrics.avg_satisfaction ? `${Math.round(metrics.avg_satisfaction * 100)}%` : 'N/A'}
          icon={ThumbsUp}
          trend={trends.satisfaction?.direction}
          trendValue={trends.satisfaction?.value}
          isLoading={isLoading}
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              Conversations par jour
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-64 w-full" />
            ) : chartData.length === 0 ? (
              <div className="h-64 flex items-center justify-center text-muted-foreground">
                Pas de données pour cette période
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={256}>
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis 
                    dataKey="date" 
                    className="text-xs"
                    tick={{ fill: 'hsl(var(--muted-foreground))' }}
                  />
                  <YAxis 
                    className="text-xs"
                    tick={{ fill: 'hsl(var(--muted-foreground))' }}
                  />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px'
                    }}
                  />
                  <Bar 
                    dataKey="count" 
                    fill="hsl(var(--primary))" 
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Durée moyenne par jour
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-64 w-full" />
            ) : chartData.length === 0 ? (
              <div className="h-64 flex items-center justify-center text-muted-foreground">
                Pas de données pour cette période
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={256}>
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="colorDuration" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis 
                    dataKey="date" 
                    className="text-xs"
                    tick={{ fill: 'hsl(var(--muted-foreground))' }}
                  />
                  <YAxis 
                    className="text-xs"
                    tick={{ fill: 'hsl(var(--muted-foreground))' }}
                  />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px'
                    }}
                  />
                  <Area 
                    type="monotone" 
                    dataKey="avg_duration" 
                    stroke="hsl(var(--primary))" 
                    fillOpacity={1}
                    fill="url(#colorDuration)"
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Additional KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Taux de Réponse</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-primary">
              {metrics.success_rate ? `${Math.round(metrics.success_rate)}%` : '—'}
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              Conversations terminées avec succès
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Appels Aujourd'hui</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-primary">
              {metrics.today_conversations || 0}
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              Conversations reçues aujourd'hui
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Temps Total</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-primary">
              {metrics.total_duration ? `${Math.round(metrics.total_duration / 3600)}h` : '0h'}
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              Heures de conversation
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default ClientAgentAnalytics;
