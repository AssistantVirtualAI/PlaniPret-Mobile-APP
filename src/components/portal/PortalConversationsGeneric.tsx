import { useState, useMemo } from 'react';
import { usePortal } from '@/hooks/usePortalAuth';
import { usePortalPlatformConversations } from '@/hooks/usePortalPlatformData';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, MessageSquare, Search, Clock, AlertCircle, Phone, Volume2, Bot, User, TrendingUp, TrendingDown, Minus, Brain, Download, RefreshCw } from 'lucide-react';
import { motion } from 'framer-motion';
import { PortalPageHeader } from '@/components/portal/PortalPageHeader';
import { GlowBadge } from '@/components/portal/GlowBadge';
import { AdvancedAudioPlayer } from '@/components/audio/AdvancedAudioPlayer';
import { format } from 'date-fns';
import { enUS, fr } from 'date-fns/locale';
import { useTranslation } from '@/hooks/useTranslation';
import { normalizeTranscript, transcriptToAudioPlayerFormat } from '@/lib/transcript/normalizeElevenLabsTranscript';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';

export default function PortalConversationsGeneric() {
  const { t, language } = useTranslation();
  const { session } = usePortal();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('overview');

  const { data: conversationsData, isLoading, error: conversationsError, refetch } = usePortalPlatformConversations(1, 500);
  
  const unwrapProxy = <T,>(res: any): T => {
    if (res && typeof res === 'object' && 'success' in res) {
      if (res.success === false) throw new Error(res.error || 'Proxy error');
      return res.data as T;
    }
    return res as T;
  };

  // Fetch conversation details when selected
  const { data: selectedDetails, isLoading: detailsLoading } = useQuery({
    queryKey: ['portal-conversation-details', selectedConversationId, session?.platform, session?.organizationId],
    queryFn: async () => {
      if (!selectedConversationId || !session?.organizationId) return null;
      
      if (session?.platform === 'retell') {
        const { data, error } = await supabase.functions.invoke('retell-proxy', {
          body: {
            action: 'getCall',
            callId: selectedConversationId,
            organizationId: session.organizationId,
          },
        });
        if (error) throw error;
        return unwrapProxy<any>(data);
      }
      return null;
    },
    enabled: !!selectedConversationId && !!session?.organizationId,
  });
  
  const conversations = conversationsData?.conversations || [];

  const filtered = conversations.filter((c) =>
    !searchTerm || c.conversation_id.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const dateLocale = language === 'fr' ? fr : enUS;

  const formatTimestamp = (unixSecs: number | undefined) => {
    if (!unixSecs || isNaN(unixSecs)) return t('common.unknownDate');
    try {
      const date = new Date(unixSecs * 1000);
      if (isNaN(date.getTime())) return t('common.unknownDate');
      return format(date, 'PPp', { locale: dateLocale });
    } catch {
      return t('common.unknownDate');
    }
  };

  const formatDuration = (seconds: number | undefined) => {
    if (!seconds) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getStatusVariant = (status: string) => {
    if (status === 'ended' || status === 'done' || status === 'completed') return 'success' as const;
    if (status === 'failed' || status === 'error') return 'destructive' as const;
    return 'secondary' as const;
  };

  // Get selected conversation from list (for fallback)
  const selectedConversation = useMemo(() => {
    return conversations.find(c => c.conversation_id === selectedConversationId);
  }, [conversations, selectedConversationId]);

  // Normalize transcript for selected conversation - with fallback to list data
  const transcriptMessages = useMemo(() => {
    // Try details first
    if (selectedDetails) {
      const msgs = normalizeTranscript({
        transcript: selectedDetails.transcript,
        transcript_object: selectedDetails.transcript_object,
        platform: session?.platform,
      });
      if (msgs.length > 0) return msgs;
    }
    // Fallback: try to use transcript from the conversation list
    if (selectedConversation) {
      return normalizeTranscript({
        transcript: (selectedConversation as any).transcript,
        transcript_object: (selectedConversation as any).transcript_object,
        platform: session?.platform,
      });
    }
    return [];
  }, [selectedDetails, selectedConversation, session?.platform]);

  // Get audio URL - with fallback to list data
  const audioUrl = selectedDetails?.recording_url || (selectedConversation as any)?.recording_url || null;

  // Export CSV
  const exportToCSV = () => {
    const headers = ['ID', 'Date', 'Duration', 'Status'];
    const rows = filtered.map(c => [
      c.conversation_id,
      formatTimestamp(c.start_time_unix_secs),
      formatDuration(c.call_duration_secs),
      c.status,
    ]);
    
    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `conversations_${session?.platform}_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    toast.success(t('componentUi.conversations.exportCSVSuccess'));
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <PortalPageHeader
        icon={MessageSquare}
        title={t('clientPortal.nav.conversations')}
        description={session?.agentName}
        gradient="blue-purple"
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              <RefreshCw className="h-4 w-4 mr-2" />
              {t('componentUi.conversations.refresh')}
            </Button>
            <Button variant="outline" size="sm" onClick={exportToCSV}>
              <Download className="h-4 w-4 mr-2" />
              Export
            </Button>
          </div>
        }
      />

      {conversationsError && (
        <Card className="bg-card/50 backdrop-blur-sm border-border/30">
          <CardContent className="py-6 text-sm text-muted-foreground">
            {t('componentUi.conversations.cannotLoadConversations')}
          </CardContent>
        </Card>
      )}

      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      )}

      {!isLoading && !conversationsError && conversations.length === 0 && (
        <Card className="bg-card/50 backdrop-blur-sm border-border/30">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <AlertCircle className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">{t('clientPortal.conversations.noConversations')}</h3>
          </CardContent>
        </Card>
      )}

      {!isLoading && conversations.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Conversations List */}
          <Card className="lg:col-span-1 bg-card/50 backdrop-blur-sm border-border/30">
            <CardHeader className="pb-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder={t('common.search')}
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 bg-muted/30 border-border/50"
                />
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                {filtered.length} / {conversations.length} conversations
              </p>
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="h-[600px]">
                <div className="p-3 space-y-2">
                  {filtered.map((conversation, index) => (
                    <motion.div
                      key={conversation.conversation_id}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.01 }}
                      onClick={() => setSelectedConversationId(conversation.conversation_id)}
                      className={`p-4 rounded-xl cursor-pointer transition-all border ${
                        selectedConversationId === conversation.conversation_id
                          ? 'bg-primary/10 border-primary/30'
                          : 'bg-muted/20 border-border/30 hover:bg-muted/40'
                      }`}
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <Phone className="h-4 w-4 text-primary" />
                          <div>
                            <p className="font-medium text-sm truncate max-w-[120px]">
                              {conversation.conversation_id.slice(0, 8)}...
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {formatTimestamp(conversation.start_time_unix_secs)}
                            </p>
                          </div>
                        </div>
                        <GlowBadge variant={getStatusVariant(conversation.status)} className="text-xs">
                          {conversation.status}
                        </GlowBadge>
                      </div>
                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {formatDuration(conversation.call_duration_secs)}
                        </span>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>

          {/* Conversation Details */}
          <Card className="lg:col-span-2 bg-card/50 backdrop-blur-sm border-border/30">
            {!selectedConversationId && (
              <div className="flex flex-col items-center justify-center h-[600px] text-muted-foreground">
                <MessageSquare className="h-12 w-12 mb-4 opacity-50" />
                <p>{t('clientPortal.conversations.selectConversation')}</p>
              </div>
            )}

            {selectedConversationId && detailsLoading && (
              <div className="flex items-center justify-center h-[600px]">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            )}

            {selectedConversationId && !detailsLoading && (
              <div className="p-4">
                <Tabs value={activeTab} onValueChange={setActiveTab}>
                  <TabsList className="grid w-full grid-cols-3 mb-4">
                    <TabsTrigger value="overview">{t('componentUi.conversations.overview')}</TabsTrigger>
                    <TabsTrigger value="audio">{t('componentUi.conversations.audio')}</TabsTrigger>
                    <TabsTrigger value="transcript">{t('componentUi.conversations.transcript')}</TabsTrigger>
                  </TabsList>

                  <TabsContent value="overview" className="space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="p-3 rounded-lg bg-muted/20 border border-border/30">
                        <p className="text-xs text-muted-foreground">{t('componentUi.conversations.duration')}</p>
                        <p className="font-medium">
                          {formatDuration(
                            selectedDetails?.end_timestamp && selectedDetails?.start_timestamp 
                              ? Math.round((selectedDetails.end_timestamp - selectedDetails.start_timestamp) / 1000)
                              : selectedConversation?.call_duration_secs || 0
                          )}
                        </p>
                      </div>
                      <div className="p-3 rounded-lg bg-muted/20 border border-border/30">
                        <p className="text-xs text-muted-foreground">{t('componentUi.conversations.statusLabel')}</p>
                        <p className="font-medium capitalize">
                          {selectedDetails?.call_status || selectedConversation?.status || 'N/A'}
                        </p>
                      </div>
                    </div>

                    {(selectedDetails?.call_analysis?.call_summary || (selectedConversation as any)?.analysis?.summary) && (
                      <Card className="bg-muted/10 border-border/30">
                        <CardHeader className="py-3">
                          <CardTitle className="text-sm flex items-center gap-2">
                            <Brain className="h-4 w-4 text-primary" />
                            {t('componentUi.conversations.summary')}
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="py-2">
                          <p className="text-sm text-muted-foreground">
                            {selectedDetails?.call_analysis?.call_summary || (selectedConversation as any)?.analysis?.summary}
                          </p>
                        </CardContent>
                      </Card>
                    )}
                  </TabsContent>

                  <TabsContent value="audio">
                    {audioUrl ? (
                      <AdvancedAudioPlayer
                        audioUrl={audioUrl}
                        conversation={{
                          conversation_id: selectedConversationId,
                        }}
                        transcript={transcriptToAudioPlayerFormat(transcriptMessages)}
                      />
                    ) : (
                      <Card className="p-8 text-center bg-muted/10 border-border/30">
                        <Volume2 className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                        <p className="text-muted-foreground">{t('componentUi.conversations.audioNotAvailable')}</p>
                      </Card>
                    )}
                  </TabsContent>

                  <TabsContent value="transcript">
                    {transcriptMessages.length > 0 ? (
                      <ScrollArea className="h-[400px] pr-4">
                        <div className="space-y-3">
                          {transcriptMessages.map((msg, index) => (
                            <div
                              key={index}
                              className={`flex ${msg.role === 'agent' ? 'justify-start' : 'justify-end'}`}
                            >
                              <div className={`max-w-[80%] p-3 rounded-lg text-sm ${
                                msg.role === 'agent' 
                                  ? 'bg-primary/10 border border-primary/20' 
                                  : 'bg-muted/30 border border-border/30'
                              }`}>
                                <span className="text-xs font-medium block mb-1">
                                  {msg.role === 'agent' ? '🤖 Agent' : '👤 Client'}
                                </span>
                                {msg.message}
                              </div>
                            </div>
                          ))}
                        </div>
                      </ScrollArea>
                    ) : (
                      <Card className="p-8 text-center bg-muted/10 border-border/30">
                        <MessageSquare className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                        <p className="text-muted-foreground">{t('componentUi.conversations.transcriptNotAvailable')}</p>
                      </Card>
                    )}
                  </TabsContent>
                </Tabs>
              </div>
            )}
          </Card>
        </div>
      )}
    </motion.div>
  );
}