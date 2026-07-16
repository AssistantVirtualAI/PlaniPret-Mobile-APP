import { useState, useEffect } from 'react';
import { usePortal } from '@/hooks/usePortalAuth';
import PortalConversationsGeneric from '@/components/portal/PortalConversationsGeneric';
import { usePortalConversations, usePortalConversationDetails, usePortalConversationAudio } from '@/hooks/usePortalElevenLabs';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Slider } from '@/components/ui/slider';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { MessageSquare, Search, Phone, Clock, TrendingUp, TrendingDown, Minus, User, Loader2, AlertCircle, Volume2, Download, Filter, X, Brain, RefreshCw, Sparkles, Target, Bot, Lightbulb } from 'lucide-react';
import { motion } from 'framer-motion';
import { PortalPageHeader } from '@/components/portal/PortalPageHeader';
import { GlowBadge } from '@/components/portal/GlowBadge';
import { AdvancedAudioPlayer } from '@/components/audio/AdvancedAudioPlayer';
import { SatisfactionScore } from '@/components/conversations/SatisfactionScore';
import { SentimentTimeline } from '@/components/conversations/SentimentTimeline';
import { ImprovementsList } from '@/components/conversations/ImprovementCard';
import { format } from 'date-fns';
import { enUS } from 'date-fns/locale';
import { toast } from 'sonner';
import { useTranslation } from '@/hooks/useTranslation';
import { usePortalConversationAnalysis } from '@/hooks/usePortalConversationAnalysis';

const PortalConversations = () => {
  const { t, language } = useTranslation();
  const { session } = usePortal();

  // For non-ElevenLabs platforms, show a simplified (but non-blocking) conversations view
  if (session?.platform && session.platform !== 'elevenlabs') {
    return <PortalConversationsGeneric />;
  }

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [activeTab, setActiveTab] = useState('overview');
  
  // Audio state
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioUnavailable, setAudioUnavailable] = useState(false);
  const [isLoadingAudio, setIsLoadingAudio] = useState(false);
  
  // Filters state
  const [showFilters, setShowFilters] = useState(false);
  const [durationFilter, setDurationFilter] = useState<[number, number]>([0, 600]);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const { data: conversationsData, isLoading, refetch } = usePortalConversations(page, 100);
  const { data: selectedConversation, isLoading: detailsLoading } = usePortalConversationDetails(selectedConversationId);
  const audioMutation = usePortalConversationAudio();
  
  // AI Analysis hook
  const { analysis, isAnalyzing, generateAnalysis } = usePortalConversationAnalysis(selectedConversationId);

  const conversations = conversationsData?.conversations || [];

  // Apply filters
  const filteredConversations = conversations.filter(c => {
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      const matchesId = c.conversation_id.toLowerCase().includes(term);
      const matchesCaller = (c.caller_number || '').toLowerCase().includes(term);
      if (!matchesId && !matchesCaller) return false;
    }
    
    const duration = c.call_duration_secs || 0;
    if (duration < durationFilter[0] || duration > durationFilter[1]) {
      return false;
    }
    
    if (dateFrom || dateTo) {
      const convDate = c.start_time_unix_secs ? new Date(c.start_time_unix_secs * 1000) : null;
      if (convDate) {
        if (dateFrom && convDate < new Date(dateFrom)) return false;
        if (dateTo && convDate > new Date(dateTo + 'T23:59:59')) return false;
      }
    }
    
    return true;
  });

  // Auto-load audio when conversation is selected
  useEffect(() => {
    if (selectedConversationId && selectedConversation?.conversation_id) {
      handlePlayAudio(selectedConversation.conversation_id);
    }
  }, [selectedConversationId, selectedConversation?.conversation_id]);

  // Audio handler
  const handlePlayAudio = async (conversationId: string) => {
    setIsLoadingAudio(true);
    setAudioUnavailable(false);
    setAudioUrl(null);
    
    try {
      const result = await audioMutation.mutateAsync({ conversationId, format: 'mp3' });
      
      if (result?.audio_unavailable) {
        setAudioUnavailable(true);
      } else if (result?.audio_url) {
        setAudioUrl(result.audio_url);
      } else {
        setAudioUnavailable(true);
      }
    } catch (error) {
      console.error('Audio error:', error);
      setAudioUnavailable(true);
    } finally {
      setIsLoadingAudio(false);
    }
  };

  // Generate AI Analysis
  const handleGenerateAnalysis = () => {
    if (!session?.platformAgentId || !selectedConversation) return;
    
    const transcript = selectedConversation.transcript 
      ? JSON.stringify(selectedConversation.transcript) 
      : undefined;
    
    generateAnalysis({
      platformAgentId: session.platformAgentId,
      transcript,
    });
  };

  // CSV Export
  const exportToCSV = () => {
    const headers = ['ID', 'Date', 'Duration (s)', 'Messages', 'Status'];
    const rows = filteredConversations.map(c => [
      c.conversation_id,
      c.start_time_unix_secs ? new Date(c.start_time_unix_secs * 1000).toISOString() : '',
      c.call_duration_secs || 0,
      c.message_count || 0,
      c.status || ''
    ]);
    
    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `conversations_${format(new Date(), 'yyyy-MM-dd')}.csv`;
    link.click();
    toast.success(t('clientPortal.conversations.exportSuccess'));
  };

  const clearFilters = () => {
    setSearchTerm('');
    setDurationFilter([0, 600]);
    setDateFrom('');
    setDateTo('');
  };

  const activeFiltersCount = [
    searchTerm,
    durationFilter[0] > 0 || durationFilter[1] < 600,
    dateFrom,
    dateTo
  ].filter(Boolean).length;

  const formatTimestamp = (unixSecs: number | undefined, formatStr: string): string => {
    if (!unixSecs || isNaN(unixSecs)) return t('common.unknownDate');
    try {
      const date = new Date(unixSecs * 1000);
      if (isNaN(date.getTime())) return t('common.unknownDate');
      return format(date, formatStr, { locale: enUS });
    } catch {
      return t('common.unknownDate');
    }
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getStatusVariant = (status: string): 'success' | 'destructive' | 'secondary' => {
    switch (status) {
      case 'done':
      case 'completed': return 'success';
      case 'failed':
      case 'error': return 'destructive';
      default: return 'secondary';
    }
  };

  const getSentimentIcon = (sentiment: string) => {
    switch (sentiment) {
      case 'positive': return <TrendingUp className="w-4 h-4 text-green-500" />;
      case 'negative': return <TrendingDown className="w-4 h-4 text-red-500" />;
      default: return <Minus className="w-4 h-4 text-yellow-500" />;
    }
  };

  const getSentimentEmoji = (sentiment: string) => {
    switch (sentiment) {
      case 'positive': return '😊';
      case 'negative': return '😞';
      default: return '😐';
    }
  };

  const getSentimentLabel = (sentiment: string) => {
    switch (sentiment) {
      case 'positive': return t('clientPortal.conversations.sentimentPositive');
      case 'negative': return t('clientPortal.conversations.sentimentNegative');
      default: return t('clientPortal.conversations.sentimentNeutral');
    }
  };

  const handleSelectConversation = (id: string) => {
    setSelectedConversationId(id);
    setAudioUrl(null);
    setAudioUnavailable(false);
    setActiveTab('overview');
  };

  // Parse transcript messages
  const parseTranscriptMessages = () => {
    if (!selectedConversation?.transcript) return [];
    
    try {
      const transcript = selectedConversation.transcript;
      if (Array.isArray(transcript)) {
        return transcript.map((msg: any) => ({
          role: msg.role || (msg.is_agent ? 'agent' : 'user'),
          message: msg.message || msg.text || msg.content || '',
          time: msg.time_in_call_secs,
        }));
      }
      return [];
    } catch {
      return [];
    }
  };

  const transcriptMessages = parseTranscriptMessages();

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <PortalPageHeader
        icon={MessageSquare}
        title={t('clientPortal.nav.conversations')}
        description={session?.agentName}
        gradient="blue-purple"
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-2">
              <RefreshCw className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={exportToCSV} className="gap-2">
              <Download className="h-4 w-4" />
              CSV
            </Button>
            <Button 
              variant={showFilters ? "default" : "outline"} 
              size="sm" 
              onClick={() => setShowFilters(!showFilters)}
              className="gap-2"
            >
              <Filter className="h-4 w-4" />
              {t('clientPortal.conversations.filters')}
              {activeFiltersCount > 0 && (
                <Badge variant="secondary" className="ml-1 h-5 w-5 p-0 flex items-center justify-center">
                  {activeFiltersCount}
                </Badge>
              )}
            </Button>
          </div>
        }
      />

      {/* Filters Panel */}
      {showFilters && (
        <Card className="bg-card/50 backdrop-blur-sm border-border/30">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-4">
              <h4 className="font-semibold">{t('clientPortal.conversations.advancedFilters')}</h4>
              <Button variant="ghost" size="sm" onClick={clearFilters}>
                <X className="h-4 w-4 mr-1" /> {t('common.reset')}
              </Button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">{t('clientPortal.conversations.duration')} (s)</label>
                <Slider
                  value={durationFilter}
                  onValueChange={(v) => setDurationFilter(v as [number, number])}
                  min={0}
                  max={600}
                  step={10}
                />
                <p className="text-xs text-muted-foreground">
                  {formatDuration(durationFilter[0])} - {formatDuration(durationFilter[1])}
                </p>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">{t('clientPortal.conversations.startDate')}</label>
                <Input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="bg-muted/30"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">{t('clientPortal.conversations.endDate')}</label>
                <Input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="bg-muted/30"
                />
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      )}

      {!isLoading && conversations.length === 0 && (
        <Card className="bg-card/50 backdrop-blur-sm border-border/30">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <AlertCircle className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">{t('clientPortal.conversations.noConversations')}</h3>
            <p className="text-muted-foreground text-center max-w-md">
              {t('clientPortal.conversations.noConversationsDesc')}
            </p>
          </CardContent>
        </Card>
      )}

      {conversations.length > 0 && (
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
                {filteredConversations.length} {t('clientPortal.conversations.conversationsOf')} {conversations.length}
              </p>
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="h-[600px]">
                <div className="p-3 space-y-2">
                  {filteredConversations.map((conversation, index) => (
                    <motion.div
                      key={conversation.conversation_id}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.02 }}
                      onClick={() => handleSelectConversation(conversation.conversation_id)}
                      className={`p-4 rounded-xl cursor-pointer transition-all border ${
                        selectedConversationId === conversation.conversation_id
                          ? 'bg-primary/10 border-primary/30 shadow-lg shadow-primary/5'
                          : 'bg-muted/20 border-border/30 hover:bg-muted/40 hover:border-border/50'
                      }`}
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary/20 to-secondary/20 flex items-center justify-center">
                            <User className="h-4 w-4 text-primary" />
                          </div>
                          <div>
                            <p className="font-medium text-sm truncate max-w-[160px]">
                              {conversation.caller_number || `${conversation.conversation_id.slice(0, 8)}...`}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {formatTimestamp(conversation.start_time_unix_secs, 'PPp')}
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
                        <span className="flex items-center gap-1">
                          <MessageSquare className="h-3 w-3" />
                          {conversation.message_count} msgs
                        </span>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>

          {/* Conversation Detail */}
          <Card className="lg:col-span-2 bg-card/50 backdrop-blur-sm border-border/30">
            {detailsLoading && selectedConversationId && (
              <div className="flex items-center justify-center h-[600px]">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            )}

            {!selectedConversationId && (
              <div className="flex flex-col items-center justify-center h-[600px] text-muted-foreground">
                <MessageSquare className="h-12 w-12 mb-4 opacity-50" />
                <p>{t('clientPortal.conversations.selectConversation')}</p>
              </div>
            )}

            {selectedConversation && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="h-full flex flex-col"
              >
                <CardHeader className="border-b border-border/30">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary to-secondary flex items-center justify-center">
                        <Phone className="h-6 w-6 text-white" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-lg">{t('clientPortal.conversations.conversation')}</h3>
                        <p className="text-sm text-muted-foreground">
                          {formatTimestamp(selectedConversation.start_time_unix_secs, 'PPPp')}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="gap-1">
                        <Clock className="h-3 w-3" />
                        {formatDuration(selectedConversation.call_duration_secs)}
                      </Badge>
                      <GlowBadge variant={getStatusVariant(selectedConversation.status)}>
                        {selectedConversation.status}
                      </GlowBadge>
                    </div>
                  </div>
                </CardHeader>

                <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
                  <TabsList className="mx-6 mt-4 grid w-auto grid-cols-4 bg-muted/30">
                    <TabsTrigger value="overview">{t('clientPortal.conversations.tabs.overview')}</TabsTrigger>
                    <TabsTrigger value="audio">{t('clientPortal.conversations.tabs.audio')}</TabsTrigger>
                    <TabsTrigger value="transcript">{t('clientPortal.conversations.tabs.transcript')}</TabsTrigger>
                    <TabsTrigger value="analysis" className="gap-1">
                      <Sparkles className="h-3 w-3" />
                      {t('clientPortal.conversations.tabs.aiAnalysis')}
                    </TabsTrigger>
                  </TabsList>

                  <div className="flex-1 overflow-auto p-6">
                    {/* Overview Tab */}
                    <TabsContent value="overview" className="mt-0 space-y-4">
                      <div className="grid grid-cols-3 gap-4">
                        {[
                          { label: t('clientPortal.conversations.messages'), value: selectedConversation.message_count, icon: MessageSquare },
                          { label: t('clientPortal.conversations.duration'), value: formatDuration(selectedConversation.call_duration_secs), icon: Clock },
                          { label: t('clientPortal.conversations.status'), value: selectedConversation.status, icon: TrendingUp },
                        ].map((metric) => (
                          <motion.div 
                            key={metric.label} 
                            className="p-4 rounded-xl bg-gradient-to-br from-muted/30 to-muted/10 border border-border/30"
                            whileHover={{ scale: 1.02 }}
                            transition={{ type: "spring", stiffness: 300 }}
                          >
                            <metric.icon className="h-4 w-4 text-primary mb-2" />
                            <p className="text-2xl font-bold">{metric.value}</p>
                            <p className="text-xs text-muted-foreground">{metric.label}</p>
                          </motion.div>
                        ))}
                      </div>

                      {/* AI Analysis Summary (if available) */}
                      {analysis && (
                        <motion.div 
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="grid grid-cols-2 gap-4"
                        >
                          <Card className="bg-gradient-to-br from-primary/10 to-purple-500/10 border-primary/20">
                            <CardContent className="p-4 flex items-center gap-4">
                              <SatisfactionScore score={analysis.satisfaction_score} size="sm" showLabel={false} />
                              <div>
                                <p className="text-sm font-medium">{t('clientPortal.conversations.satisfactionScore')}</p>
                                <p className="text-xs text-muted-foreground">{t('clientPortal.conversations.aiAnalysis')}</p>
                              </div>
                            </CardContent>
                          </Card>
                          <Card className="bg-gradient-to-br from-green-500/10 to-emerald-500/10 border-green-500/20">
                            <CardContent className="p-4 flex items-center gap-4">
                              <span className="text-4xl">{getSentimentEmoji(analysis.sentiment)}</span>
                              <div>
                                <p className="text-sm font-medium flex items-center gap-2">
                                  {getSentimentIcon(analysis.sentiment)}
                                  {getSentimentLabel(analysis.sentiment)}
                                </p>
                                <p className="text-xs text-muted-foreground">{t('clientPortal.conversations.overallSentiment')}</p>
                              </div>
                            </CardContent>
                          </Card>
                        </motion.div>
                      )}

                      {/* Quick Analysis Button */}
                      {!analysis && !isAnalyzing && (
                        <Card className="bg-gradient-to-br from-primary/5 to-purple-500/5 border-primary/20">
                          <CardContent className="p-6 text-center">
                            <Brain className="h-10 w-10 mx-auto mb-3 text-primary" />
                            <p className="text-sm text-muted-foreground mb-4">
                              {t('clientPortal.conversations.generateAnalysisDesc')}
                            </p>
                            <Button onClick={handleGenerateAnalysis} className="gap-2">
                              <Sparkles className="h-4 w-4" />
                              {t('clientPortal.conversations.generateAnalysis')}
                            </Button>
                          </CardContent>
                        </Card>
                      )}

                      {isAnalyzing && (
                        <Card className="bg-gradient-to-br from-primary/5 to-purple-500/5 border-primary/20">
                          <CardContent className="p-6 text-center">
                            <Loader2 className="h-10 w-10 mx-auto mb-3 text-primary animate-spin" />
                            <p className="text-sm text-muted-foreground">
                              {t('clientPortal.conversations.analyzingInProgress')}
                            </p>
                          </CardContent>
                        </Card>
                      )}
                    </TabsContent>

                    {/* Audio Tab */}
                    <TabsContent value="audio" className="mt-0">
                      <div className="space-y-4">
                        {isLoadingAudio && (
                          <div className="flex items-center justify-center py-12">
                            <Loader2 className="h-8 w-8 animate-spin text-primary" />
                            <span className="ml-2 text-muted-foreground">{t('clientPortal.conversations.loadingAudio')}</span>
                          </div>
                        )}

                        {audioUnavailable && !isLoadingAudio && (
                          <Card className="bg-muted/20 border-border/30">
                            <CardContent className="p-8 text-center">
                              <Volume2 className="h-12 w-12 mx-auto mb-4 text-muted-foreground/50" />
                              <p className="text-muted-foreground">{t('clientPortal.conversations.audioUnavailable')}</p>
                            </CardContent>
                          </Card>
                        )}

                        {audioUrl && !isLoadingAudio && (
                          <AdvancedAudioPlayer
                            audioUrl={audioUrl}
                            conversation={{
                              conversation_id: selectedConversation.conversation_id,
                              caller_number: selectedConversation.caller_number || '',
                              duration_seconds: selectedConversation.call_duration_secs,
                              satisfaction_score: analysis?.satisfaction_score,
                            }}
                            transcript={[]}
                          />
                        )}
                      </div>
                    </TabsContent>

                    {/* Transcript Tab */}
                    <TabsContent value="transcript" className="mt-0">
                      {transcriptMessages.length > 0 ? (
                        <ScrollArea className="h-[400px] pr-4">
                          <div className="space-y-3">
                            {transcriptMessages.map((msg, index) => {
                              const isAgent = msg.role === 'agent';
                              return (
                                <motion.div
                                  key={index}
                                  initial={{ opacity: 0, x: isAgent ? -20 : 20 }}
                                  animate={{ opacity: 1, x: 0 }}
                                  transition={{ duration: 0.3, delay: index * 0.03 }}
                                  className={`flex ${isAgent ? 'justify-start' : 'justify-end'}`}
                                >
                                  <div className={`max-w-[80%] ${isAgent ? 'mr-auto' : 'ml-auto'}`}>
                                    <div className={`flex items-center gap-2 mb-1 ${isAgent ? '' : 'flex-row-reverse'}`}>
                                      <div className={`w-6 h-6 rounded-full flex items-center justify-center ${
                                        isAgent ? 'bg-primary/20' : 'bg-secondary/20'
                                      }`}>
                                        {isAgent ? (
                                          <Bot className="w-3 h-3 text-primary" />
                                        ) : (
                                          <User className="w-3 h-3 text-secondary" />
                                        )}
                                      </div>
                                      <span className={`text-xs font-medium ${
                                        isAgent ? 'text-primary' : 'text-secondary'
                                      }`}>
                                        {isAgent ? t('clientPortal.conversations.aiAgent') : t('clientPortal.conversations.user')}
                                      </span>
                                      {msg.time !== undefined && (
                                        <span className="text-xs text-muted-foreground">
                                          {Math.floor(msg.time / 60)}:{String(Math.floor(msg.time % 60)).padStart(2, '0')}
                                        </span>
                                      )}
                                    </div>
                                    <div className={`p-3 rounded-lg ${
                                      isAgent 
                                        ? 'bg-primary/10 border border-primary/20 rounded-tl-none' 
                                        : 'bg-secondary/10 border border-secondary/20 rounded-tr-none'
                                    }`}>
                                      <p className="text-sm">{msg.message}</p>
                                    </div>
                                  </div>
                                </motion.div>
                              );
                            })}
                          </div>
                        </ScrollArea>
                      ) : (
                        <Card className="bg-muted/20 border-border/30">
                          <CardContent className="p-8 text-center">
                            <MessageSquare className="h-12 w-12 mx-auto mb-4 text-muted-foreground/50" />
                            <p className="text-muted-foreground">{t('clientPortal.conversations.noTranscript')}</p>
                          </CardContent>
                        </Card>
                      )}
                    </TabsContent>

                    {/* AI Analysis Tab */}
                    <TabsContent value="analysis" className="mt-0 space-y-6">
                      {!analysis && !isAnalyzing && (
                        <Card className="bg-gradient-to-br from-primary/5 to-purple-500/5 border-primary/20">
                          <CardContent className="p-8 text-center">
                            <Brain className="h-16 w-16 mx-auto mb-4 text-primary" />
                            <h3 className="text-lg font-semibold mb-2">{t('clientPortal.conversations.aiAnalysisTitle')}</h3>
                            <p className="text-muted-foreground mb-6 max-w-md mx-auto">
                              {t('clientPortal.conversations.aiAnalysisDescription')}
                            </p>
                            <Button onClick={handleGenerateAnalysis} size="lg" className="gap-2">
                              <Sparkles className="h-5 w-5" />
                              {t('clientPortal.conversations.generateAnalysis')}
                            </Button>
                          </CardContent>
                        </Card>
                      )}

                      {isAnalyzing && (
                        <Card className="bg-gradient-to-br from-primary/5 to-purple-500/5 border-primary/20">
                          <CardContent className="p-8 text-center">
                            <Loader2 className="h-16 w-16 mx-auto mb-4 text-primary animate-spin" />
                            <p className="text-muted-foreground">{t('clientPortal.conversations.analyzingInProgress')}</p>
                          </CardContent>
                        </Card>
                      )}

                      {analysis && (
                        <motion.div
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="space-y-6"
                        >
                          {/* Score & Sentiment */}
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <Card className="bg-gradient-to-br from-primary/10 to-purple-500/10 border-primary/20">
                              <CardContent className="p-6 flex flex-col items-center">
                                <Target className="h-5 w-5 text-primary mb-2" />
                                <p className="text-sm font-medium mb-4">{t('clientPortal.conversations.satisfactionScore')}</p>
                                <SatisfactionScore score={analysis.satisfaction_score} size="lg" />
                              </CardContent>
                            </Card>
                            <Card className="bg-gradient-to-br from-green-500/10 to-emerald-500/10 border-green-500/20">
                              <CardContent className="p-6">
                                <div className="flex items-center gap-2 mb-4">
                                  {getSentimentIcon(analysis.sentiment)}
                                  <p className="text-sm font-medium">{t('clientPortal.conversations.overallSentiment')}</p>
                                </div>
                                <div className="flex items-center gap-4">
                                  <span className="text-5xl">{getSentimentEmoji(analysis.sentiment)}</span>
                                  <div>
                                    <p className="text-xl font-bold">{getSentimentLabel(analysis.sentiment)}</p>
                                    <p className="text-xs text-muted-foreground">
                                      {t('clientPortal.conversations.confidence')}: {(analysis.confidence * 100).toFixed(0)}%
                                    </p>
                                  </div>
                                </div>
                              </CardContent>
                            </Card>
                          </div>

                          {/* Summary */}
                          {analysis.summary && (
                            <Card className="bg-card/50 border-border/30">
                              <CardContent className="p-6">
                                <div className="flex items-center gap-2 mb-3">
                                  <Brain className="h-5 w-5 text-primary" />
                                  <h4 className="font-semibold">{t('clientPortal.conversations.aiSummary')}</h4>
                                </div>
                                <p className="text-muted-foreground">{analysis.summary}</p>
                              </CardContent>
                            </Card>
                          )}

                          {/* Sentiment Timeline */}
                          {analysis.sentiment_timeline && analysis.sentiment_timeline.length > 0 && (
                            <Card className="bg-card/50 border-border/30">
                              <CardContent className="p-6">
                                <div className="flex items-center gap-2 mb-4">
                                  <TrendingUp className="h-5 w-5 text-primary" />
                                  <h4 className="font-semibold">{t('clientPortal.conversations.sentimentEvolution')}</h4>
                                </div>
                                <SentimentTimeline timeline={analysis.sentiment_timeline} />
                              </CardContent>
                            </Card>
                          )}

                          {/* Improvements */}
                          {analysis.improvements && analysis.improvements.length > 0 && (
                            <div>
                              <div className="flex items-center gap-2 mb-4">
                                <Lightbulb className="h-5 w-5 text-primary" />
                                <h4 className="font-semibold">{t('clientPortal.conversations.suggestions')}</h4>
                              </div>
                              <ImprovementsList improvements={analysis.improvements} />
                            </div>
                          )}
                        </motion.div>
                      )}
                    </TabsContent>
                  </div>
                </Tabs>
              </motion.div>
            )}
          </Card>
        </div>
      )}
    </motion.div>
  );
};

export default PortalConversations;
