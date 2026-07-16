import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, RefreshCw, Webhook, ExternalLink, Filter, Eye, ChevronDown } from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from '@/context/OrganizationContext';
import { useAllAgents, getPlatformDisplayName } from '@/hooks/useAllAgents';
import { useTranslation } from '@/hooks/useTranslation';
import { toast } from 'sonner';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Json } from '@/integrations/supabase/types';

interface WebhookLog {
  id: string;
  event_type: string;
  connector: string;
  processed: boolean;
  created_at: string;
  payload?: Json;
}

interface PlatformWebhookEvent {
  id: string;
  event_type: string;
  timestamp: string;
  status: string;
  payload?: Json;
  webhook_id?: string;
  response_status?: number;
  webhook_url?: string;
}

interface DeliveryLog {
  id: string;
  agent_id: string;
  agent_name?: string;
  event_type: string;
  timestamp: string;
  duration_secs?: number;
  status: string;
  message_count?: number;
  direction?: string;
  rating?: number;
  summary?: string;
  title?: string;
}

export default function WebhookLogs() {
  const { selectedOrgId } = useOrganization();
  const { t } = useTranslation();
  const { data: agentsData, isLoading: agentsLoading } = useAllAgents();
  
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedAgentId, setSelectedAgentId] = useState<string>('all');
  const [selectedLog, setSelectedLog] = useState<WebhookLog | null>(null);
  const [activeTab, setActiveTab] = useState<string>('local');

  // Fetch local webhook logs from database
  const { data: logs = [], isLoading: logsLoading, refetch: refetchLogs } = useQuery({
    queryKey: ['webhook-logs', selectedOrgId, statusFilter, selectedAgentId],
    queryFn: async (): Promise<WebhookLog[]> => {
      if (!selectedOrgId) return [];

      let query = supabase
        .from('webhook_events')
        .select('id, event_type, connector, processed, created_at, payload')
        .eq('organization_id', selectedOrgId)
        .order('created_at', { ascending: false })
        .limit(100);

      if (statusFilter !== 'all') {
        query = query.eq('processed', statusFilter === 'processed');
      }

      // Filter by connector (platform) if an agent is selected
      if (selectedAgentId !== 'all') {
        const agent = agentsData?.agents?.find(a => a.id === selectedAgentId);
        if (agent) {
          query = query.eq('connector', agent.platform);
        }
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as WebhookLog[];
    },
    enabled: !!selectedOrgId,
  });

  // Get selected agent info
  const selectedAgent = useMemo(() => {
    if (selectedAgentId === 'all' || !agentsData?.agents) return null;
    return agentsData.agents.find(a => a.id === selectedAgentId);
  }, [selectedAgentId, agentsData?.agents]);

  // Fetch platform webhook events for selected agent
  const { data: platformEvents = [], isLoading: platformEventsLoading, refetch: refetchPlatformEvents } = useQuery({
    queryKey: ['platform-webhook-events', selectedAgentId, selectedAgent?.platform],
    queryFn: async () => {
      if (!selectedAgent?.platform_agent_id) return [];
      
      if (selectedAgent.platform === 'elevenlabs') {
          const { data, error } = await supabase.functions.invoke('elevenlabs-convai-agent-config', {
            body: {
              action: 'list_workspace_webhooks',
              agentId: selectedAgent.platform_agent_id,
              organizationId: selectedOrgId,
            },
          });

        if (error) throw error;
        
        // ElevenLabs returns webhook configs with webhook_id field
        const webhooks = data?.webhooks || [];
        const events: PlatformWebhookEvent[] = [];
        
        for (const webhook of webhooks) {
          // ElevenLabs uses webhook_id, not id
          if (webhook.webhook_id) {
            events.push({
              id: webhook.webhook_id,
              event_type: webhook.name || t('webhookLogs.unnamed'),
              timestamp: webhook.created_at_unix 
                ? new Date(webhook.created_at_unix * 1000).toISOString() 
                : new Date().toISOString(),
              status: webhook.is_disabled ? 'disabled' : 'active',
              payload: webhook as Json,
              webhook_id: webhook.webhook_id,
            });
          }
        }
        
        return events;
      }
      
      // TODO: Add support for other platforms (Retell, Vapi)
      return [];
    },
    enabled: !!selectedAgent?.platform_agent_id && (activeTab === 'platform' || activeTab === 'delivery'),
  });

  // Fetch delivery logs (conversations triggered by webhooks) for selected agent
  const { data: deliveryLogs = [], isLoading: deliveryLogsLoading, refetch: refetchDeliveryLogs } = useQuery({
    queryKey: ['webhook-delivery-logs', selectedAgentId, selectedAgent?.platform],
    queryFn: async (): Promise<DeliveryLog[]> => {
      if (!selectedAgent?.platform_agent_id) return [];
      
      if (selectedAgent.platform === 'elevenlabs') {
        const { data, error } = await supabase.functions.invoke('elevenlabs-convai-agent-config', {
          body: {
            action: 'get_webhook_delivery_logs',
            agentId: selectedAgent.platform_agent_id,
            organizationId: selectedOrgId,
            limit: 50,
          },
        });

        if (error) throw error;
        
        return (data?.delivery_logs || []) as DeliveryLog[];
      }
      
      return [];
    },
    enabled: !!selectedAgent?.platform_agent_id && activeTab === 'delivery',
  });

  const filteredLogs = useMemo(() => {
    return logs.filter((log) =>
      log.event_type?.toLowerCase().includes(search.toLowerCase()) ||
      log.connector?.toLowerCase().includes(search.toLowerCase())
    );
  }, [logs, search]);

  const handleRefresh = () => {
    refetchLogs();
    if (activeTab === 'platform') {
      refetchPlatformEvents();
    }
    if (activeTab === 'delivery') {
      refetchDeliveryLogs();
    }
  };

  return (
    <AppLayout>
      <div className="p-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold gradient-text mb-2">
              {t('webhookLogs.title')}
            </h1>
            <p className="text-muted-foreground">
              {t('webhookLogs.description')}
            </p>
          </div>
          <Button onClick={handleRefresh} variant="outline" className="gap-2">
            <RefreshCw className="w-4 h-4" />
            {t('common.refresh')}
          </Button>
        </div>

        {/* Agent Selector */}
        <Card className="mb-6">
          <CardHeader className="pb-4">
            <CardTitle className="text-lg flex items-center gap-2">
              <Filter className="w-5 h-5" />
              {t('webhookLogs.filterByAgent')}
            </CardTitle>
            <CardDescription>
              {t('webhookLogs.filterDescription')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex gap-4 flex-wrap">
              <Select value={selectedAgentId} onValueChange={setSelectedAgentId}>
                <SelectTrigger className="w-[300px]">
                  <SelectValue placeholder={t('webhookLogs.selectAgent')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('webhookLogs.allAgents')}</SelectItem>
                  {agentsLoading ? (
                    <SelectItem value="loading" disabled>
                      {t('common.loading')}
                    </SelectItem>
                  ) : (
                    agentsData?.agents?.map((agent) => (
                      <SelectItem key={agent.id} value={agent.id}>
                        <div className="flex items-center gap-2">
                          <span>{agent.name}</span>
                          <Badge variant="outline" className="ml-2">
                            {getPlatformDisplayName(agent.platform)}
                          </Badge>
                        </div>
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>

              {selectedAgent && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Webhook className="w-4 h-4" />
                  <span>{t('webhookLogs.platform')}: </span>
                  <Badge>{getPlatformDisplayName(selectedAgent.platform)}</Badge>
                  {selectedAgent.platform_agent_id && (
                    <span className="font-mono text-xs">
                      ({selectedAgent.platform_agent_id.slice(0, 12)}...)
                    </span>
                  )}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Tabs: Local vs Platform vs Delivery */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList>
            <TabsTrigger value="local">{t('webhookLogs.localLogs')}</TabsTrigger>
            <TabsTrigger value="platform" disabled={!selectedAgent}>
              {t('webhookLogs.platformWebhooks')}
            </TabsTrigger>
            <TabsTrigger value="delivery" disabled={!selectedAgent}>
              {t('webhookLogs.deliveryLogs')}
            </TabsTrigger>
          </TabsList>

          {/* Local Logs Tab */}
          <TabsContent value="local">
            <div className="glass-card p-6">
              <div className="flex gap-4 mb-6">
                <div className="flex-1 relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder={t('webhookLogs.searchPlaceholder')}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-10"
                  />
                </div>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-[200px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t('webhookLogs.allStatuses')}</SelectItem>
                    <SelectItem value="processed">{t('webhookLogs.processed')}</SelectItem>
                    <SelectItem value="pending">{t('webhookLogs.pending')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('webhookLogs.timestamp')}</TableHead>
                    <TableHead>{t('webhookLogs.platform')}</TableHead>
                    <TableHead>{t('webhookLogs.eventType')}</TableHead>
                    <TableHead>{t('common.status')}</TableHead>
                    <TableHead className="text-right">{t('common.actions')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logsLoading ? (
                    <TableRow>
                      <TableCell colSpan={5}>
                        <div className="space-y-2">
                          <Skeleton className="h-10 w-full" />
                          <Skeleton className="h-10 w-full" />
                          <Skeleton className="h-10 w-full" />
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : filteredLogs.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-8">
                        {t('webhookLogs.noLogsFound')}
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredLogs.map((log) => (
                      <TableRow key={log.id}>
                        <TableCell>
                          {new Date(log.created_at).toLocaleString()}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{log.connector}</Badge>
                        </TableCell>
                        <TableCell className="font-mono text-sm">
                          {log.event_type}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={log.processed ? 'default' : 'secondary'}
                            className={log.processed ? 'bg-green-500' : ''}
                          >
                            {log.processed ? t('webhookLogs.processed') : t('webhookLogs.pending')}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button 
                            variant="ghost" 
                            size="sm"
                            onClick={() => setSelectedLog(log)}
                          >
                            <Eye className="w-4 h-4 mr-1" />
                            {t('webhookLogs.details')}
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </TabsContent>

          {/* Platform Logs Tab */}
          <TabsContent value="platform">
            <div className="glass-card p-6">
              {!selectedAgent ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Webhook className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>{t('webhookLogs.selectAgentFirst')}</p>
                </div>
              ) : platformEventsLoading ? (
                <div className="space-y-4">
                  <Skeleton className="h-20 w-full" />
                  <Skeleton className="h-20 w-full" />
                  <Skeleton className="h-20 w-full" />
                </div>
              ) : platformEvents.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Webhook className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>{t('webhookLogs.noPlatformWebhooks')}</p>
                  <p className="text-sm mt-2">
                    {t('webhookLogs.configurePlatformWebhooks')}
                  </p>
                </div>
              ) : (
                <>
                  <div className="mb-4 flex items-center justify-between">
                    <h3 className="text-lg font-semibold flex items-center gap-2">
                      <ExternalLink className="w-5 h-5" />
                      {t('webhookLogs.platformWebhooksFor')} {getPlatformDisplayName(selectedAgent.platform)}
                    </h3>
                    <Badge variant="outline">
                      {platformEvents.length} {t('webhookLogs.webhooksFound')}
                    </Badge>
                  </div>
                  
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t('webhookLogs.webhookId')}</TableHead>
                        <TableHead>{t('common.name')}</TableHead>
                        <TableHead>{t('common.status')}</TableHead>
                        <TableHead>{t('webhookLogs.timestamp')}</TableHead>
                        <TableHead className="text-right">{t('common.actions')}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {platformEvents.map((event) => (
                        <TableRow key={event.id}>
                          <TableCell className="font-mono text-xs">
                            {event.id.slice(0, 16)}...
                          </TableCell>
                          <TableCell>{event.event_type}</TableCell>
                          <TableCell>
                            <Badge
                              variant={event.status === 'active' ? 'default' : 'secondary'}
                              className={event.status === 'active' ? 'bg-green-500' : ''}
                            >
                              {event.status === 'active' ? t('common.active') : t('common.inactive')}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {new Date(event.timestamp).toLocaleString()}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button 
                              variant="ghost" 
                              size="sm"
                              onClick={() => setSelectedLog({
                                id: event.id,
                                event_type: event.event_type,
                                connector: selectedAgent.platform,
                                processed: event.status === 'active',
                                created_at: event.timestamp,
                                payload: event.payload,
                              })}
                            >
                              <Eye className="w-4 h-4 mr-1" />
                              {t('webhookLogs.details')}
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </>
              )}
            </div>
          </TabsContent>

          {/* Delivery Logs Tab */}
          <TabsContent value="delivery">
            <div className="glass-card p-6">
              {!selectedAgent ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Webhook className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>{t('webhookLogs.selectAgentFirst')}</p>
                </div>
              ) : deliveryLogsLoading ? (
                <div className="space-y-4">
                  <Skeleton className="h-20 w-full" />
                  <Skeleton className="h-20 w-full" />
                  <Skeleton className="h-20 w-full" />
                </div>
              ) : deliveryLogs.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Webhook className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>{t('webhookLogs.noDeliveryLogs')}</p>
                  <p className="text-sm mt-2">
                    {t('webhookLogs.noDeliveryLogsDescription')}
                  </p>
                </div>
              ) : (
                <>
                  <div className="mb-4 flex items-center justify-between">
                    <h3 className="text-lg font-semibold flex items-center gap-2">
                      <ExternalLink className="w-5 h-5" />
                      {t('webhookLogs.deliveryLogsFor')} {selectedAgent.name}
                    </h3>
                    <Badge variant="outline">
                      {deliveryLogs.length} {t('webhookLogs.eventsFound')}
                    </Badge>
                  </div>
                  
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t('webhookLogs.conversationId')}</TableHead>
                        <TableHead>{t('webhookLogs.eventType')}</TableHead>
                        <TableHead>{t('webhookLogs.timestamp')}</TableHead>
                        <TableHead>{t('webhookLogs.duration')}</TableHead>
                        <TableHead>{t('common.status')}</TableHead>
                        <TableHead className="text-right">{t('common.actions')}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {deliveryLogs.map((log) => (
                        <TableRow key={log.id}>
                          <TableCell className="font-mono text-xs">
                            {log.id.slice(0, 20)}...
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">{log.event_type}</Badge>
                          </TableCell>
                          <TableCell>
                            {log.timestamp ? new Date(log.timestamp).toLocaleString() : '-'}
                          </TableCell>
                          <TableCell>
                            {log.duration_secs ? `${log.duration_secs}s` : '-'}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant={log.status === 'success' ? 'default' : 'secondary'}
                              className={log.status === 'success' ? 'bg-green-500' : log.status === 'failure' ? 'bg-red-500' : ''}
                            >
                              {log.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <Button 
                              variant="ghost" 
                              size="sm"
                              onClick={() => setSelectedLog({
                                id: log.id,
                                event_type: log.event_type,
                                connector: selectedAgent.platform,
                                processed: log.status === 'success',
                                created_at: log.timestamp,
                                payload: {
                                  agent_id: log.agent_id,
                                  agent_name: log.agent_name,
                                  duration_secs: log.duration_secs,
                                  message_count: log.message_count,
                                  direction: log.direction,
                                  rating: log.rating,
                                  summary: log.summary,
                                  title: log.title,
                                } as Json,
                              })}
                            >
                              <Eye className="w-4 h-4 mr-1" />
                              {t('webhookLogs.details')}
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </>
              )}
            </div>
          </TabsContent>
        </Tabs>

        {/* Log Details Modal */}
        <Dialog open={!!selectedLog} onOpenChange={() => setSelectedLog(null)}>
          <DialogContent className="max-w-3xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Webhook className="w-5 h-5" />
                {t('webhookLogs.logDetails')}
              </DialogTitle>
              <DialogDescription>
                {selectedLog?.event_type} - {selectedLog?.connector}
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-muted-foreground">
                    {t('webhookLogs.platform')}
                  </label>
                  <p className="mt-1">
                    <Badge variant="outline">{selectedLog?.connector}</Badge>
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">
                    {t('webhookLogs.eventType')}
                  </label>
                  <p className="mt-1 font-mono text-sm">{selectedLog?.event_type}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">
                    {t('webhookLogs.timestamp')}
                  </label>
                  <p className="mt-1">
                    {selectedLog?.created_at && new Date(selectedLog.created_at).toLocaleString()}
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">
                    {t('common.status')}
                  </label>
                  <p className="mt-1">
                    <Badge 
                      variant={selectedLog?.processed ? 'default' : 'secondary'}
                      className={selectedLog?.processed ? 'bg-green-500' : ''}
                    >
                      {selectedLog?.processed ? t('webhookLogs.processed') : t('webhookLogs.pending')}
                    </Badge>
                  </p>
                </div>
              </div>
              
              <div>
                <label className="text-sm font-medium text-muted-foreground">
                  {t('webhookLogs.payload')}
                </label>
                <ScrollArea className="mt-2 h-[300px] rounded border p-4 bg-muted/50">
                  <pre className="text-xs font-mono whitespace-pre-wrap">
                    {JSON.stringify(selectedLog?.payload || {}, null, 2)}
                  </pre>
                </ScrollArea>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}
