import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Phone, 
  PhoneCall, 
  PhoneOff, 
  Clock, 
  Users, 
  Activity,
  Wifi,
  WifiOff,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Minus,
  Bot
} from 'lucide-react';
import { useRealtimeConversations, useRealtimeConversationsHttp, useSyncConversations } from '@/hooks/useRealtimeConversations';
import { format, formatDistanceToNow } from 'date-fns';
import { fr, enUS } from 'date-fns/locale';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { useTranslation } from '@/hooks/useTranslation';

export const RealtimeDashboard = () => {
  const { t, language } = useTranslation();
  const dateLocale = language === 'fr' ? fr : enUS;

  const [useWebSocket, setUseWebSocket] = useState(true);
  const { 
    isConnected, 
    activeConversations, 
    recentConversations, 
    lastUpdate, 
    agentCount,
    connect, 
    disconnect 
  } = useRealtimeConversations();
  
  const { data: httpData, isLoading: isLoadingHttp, refetch } = useRealtimeConversationsHttp();
  const syncMutation = useSyncConversations();

  useEffect(() => {
    if (useWebSocket) {
      connect();
    }
    return () => disconnect();
  }, [useWebSocket, connect, disconnect]);

  const displayData = useWebSocket 
    ? { 
        activeConversations, 
        recentConversations, 
        agentCount,
        timestamp: lastUpdate 
      }
    : httpData;

  const formatDuration = (seconds: number | undefined) => {
    if (!seconds) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getSentimentIcon = (sentiment: string | undefined) => {
    switch (sentiment) {
      case 'positive':
        return <TrendingUp className="w-4 h-4 text-green-500" />;
      case 'negative':
        return <TrendingDown className="w-4 h-4 text-destructive" />;
      default:
        return <Minus className="w-4 h-4 text-muted-foreground" />;
    }
  };

  const activeCount = displayData?.activeConversations?.length || 0;
  const recentCount = displayData?.recentConversations?.length || 0;
  const agentsTotal = displayData?.agentCount || 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">{t('dashboard.realtime.title')}</h2>
          <p className="text-muted-foreground">
            {t('dashboard.realtime.subtitle')}
          </p>
        </div>
        
        <div className="flex items-center gap-3">
          <Badge 
            variant={isConnected || !useWebSocket ? 'default' : 'secondary'}
            className={`gap-2 ${isConnected ? 'bg-green-500/20 text-green-400 border-green-500/30' : ''}`}
          >
            {isConnected || !useWebSocket ? (
              <>
                <Wifi className="w-3 h-3" />
                {t('dashboard.realtime.connected')}
              </>
            ) : (
              <>
                <WifiOff className="w-3 h-3" />
                {t('dashboard.realtime.disconnected')}
              </>
            )}
          </Badge>

          <Button 
            variant="outline" 
            size="sm"
            onClick={() => syncMutation.mutate(undefined)}
            disabled={syncMutation.isPending}
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${syncMutation.isPending ? 'animate-spin' : ''}`} />
            {t('dashboard.dataSource.synchronize')}
          </Button>

          {!useWebSocket && (
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => refetch()}
              disabled={isLoadingHttp}
            >
              <RefreshCw className={`w-4 h-4 ${isLoadingHttp ? 'animate-spin' : ''}`} />
            </Button>
          )}
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className={`glass-card ${activeCount > 0 ? 'border-green-500/50' : ''}`}>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">{t('dashboard.realtime.activeCalls')}</p>
                <p className="text-3xl font-bold">{activeCount}</p>
              </div>
              <div className={`p-3 rounded-full ${activeCount > 0 ? 'bg-green-500/20' : 'bg-muted'}`}>
                <PhoneCall className={`w-6 h-6 ${activeCount > 0 ? 'text-green-500 animate-pulse' : 'text-muted-foreground'}`} />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="glass-card">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">{t('dashboard.realtime.last30min')}</p>
                <p className="text-3xl font-bold">{recentCount}</p>
              </div>
              <div className="p-3 rounded-full bg-primary/20">
                <Activity className="w-6 h-6 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="glass-card">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">{t('dashboard.realtime.activeAgents')}</p>
                <p className="text-3xl font-bold">{agentsTotal}</p>
              </div>
              <div className="p-3 rounded-full bg-primary/20">
                <Bot className="w-6 h-6 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="glass-card">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">{t('dashboard.realtime.lastUpdate')}</p>
                <p className="text-lg font-semibold">
                  {displayData?.timestamp 
                    ? formatDistanceToNow(new Date(displayData.timestamp), { addSuffix: true, locale: dateLocale })
                    : t('dashboard.realtime.waiting')
                  }
                </p>
              </div>
              <div className="p-3 rounded-full bg-muted">
                <Clock className="w-6 h-6 text-muted-foreground" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Active Conversations */}
      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <PhoneCall className="w-5 h-5 text-green-500" />
            {t('dashboard.realtime.ongoingConversations')}
            {activeCount > 0 && (
              <Badge className="bg-green-500/20 text-green-400 border-green-500/30">
                {activeCount} {t('dashboard.realtime.active')}
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {activeCount === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <PhoneOff className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>{t('dashboard.realtime.noOngoing')}</p>
              <p className="text-sm">{t('dashboard.realtime.callsWillAppear')}</p>
            </div>
          ) : (
            <div className="space-y-3">
              {displayData?.activeConversations.map((conv) => (
                <div 
                  key={conv.conversation_id}
                  className="flex items-center justify-between p-4 bg-green-500/10 border border-green-500/30 rounded-lg"
                >
                  <div className="flex items-center gap-4">
                    <div className="relative">
                      <Phone className="w-8 h-8 text-green-500" />
                      <span className="absolute -top-1 -right-1 w-3 h-3 bg-green-500 rounded-full animate-ping" />
                    </div>
                    <div>
                      <p className="font-semibold">{conv.agent_name}</p>
                      <p className="text-sm text-muted-foreground">
                        ID: {conv.conversation_id.substring(0, 8)}...
                        {conv.caller_id && ` • ${conv.caller_id}`}
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <p className="text-lg font-mono font-bold text-green-400">
                        {formatDuration(conv.duration_secs)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(conv.start_time), { addSuffix: true, locale: dateLocale })}
                      </p>
                    </div>
                    <Badge className="bg-green-500 text-white">{t('dashboard.realtime.ongoing')}</Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recent Conversations */}
      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="w-5 h-5 text-primary" />
            {t('dashboard.realtime.recentConversations')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {recentCount === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <p>{t('dashboard.realtime.noRecent')}</p>
            </div>
          ) : (
            <div className="space-y-2">
              {displayData?.recentConversations.slice(0, 10).map((conv) => {
                const duration = conv.call_duration_secs || conv.duration || 0;
                return (
                  <div 
                    key={conv.conversation_id}
                    className="flex items-center justify-between p-3 bg-muted/50 rounded-lg hover:bg-muted transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <Badge variant="outline" className="text-xs">
                        {conv.agent_name}
                      </Badge>
                      <span className="text-sm text-muted-foreground">
                        {conv.conversation_id.substring(0, 8)}
                      </span>
                      {getSentimentIcon(conv.analysis?.sentiment)}
                    </div>
                    
                    <div className="flex items-center gap-4 text-sm">
                      <span className="flex items-center gap-1 text-muted-foreground">
                        <Clock className="w-3 h-3" />
                        {formatDuration(duration)}
                      </span>
                      {conv.analysis?.satisfaction_score !== undefined && (
                        <span className="text-muted-foreground">
                          {(conv.analysis.satisfaction_score * 100).toFixed(0)}%
                        </span>
                      )}
                      <span className="text-muted-foreground">
                        {conv.start_time && formatDistanceToNow(new Date(conv.start_time), { addSuffix: true, locale: dateLocale })}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Sync Status */}
      {syncMutation.isPending && (
        <Card className="glass-card border-primary/50">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <RefreshCw className="w-5 h-5 text-primary animate-spin" />
              <div className="flex-1">
                <p className="font-medium">{t('dashboard.realtime.syncing')}</p>
                <Progress value={50} className="h-2 mt-2" />
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};
