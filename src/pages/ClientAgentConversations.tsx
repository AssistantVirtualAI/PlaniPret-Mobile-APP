import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useClientAgentAccess } from '@/hooks/useClientAgentAccess';
import { ClientPlatformConversations } from '@/components/client-portal/ClientPlatformConversations';
import { useClientElevenLabsConversations, useClientElevenLabsConversationDetails, useClientElevenLabsAudio } from '@/hooks/useClientElevenLabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Slider } from '@/components/ui/slider';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { 
  MessageSquare, 
  Play, 
  Clock, 
  User,
  Bot,
  ChevronLeft,
  ChevronRight,
  Volume2,
  Loader2,
  Search,
  SlidersHorizontal,
  X,
  Download,
  FileSpreadsheet,
  TrendingUp,
  TrendingDown,
  Minus
} from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { AdvancedAudioPlayer } from '@/components/audio/AdvancedAudioPlayer';
import { toast } from 'sonner';

const ClientAgentConversations = () => {
  const { clientId, agentId } = useParams();
  const { apiKey, platformAgentId, agentName, platform, organizationId } = useClientAgentAccess(clientId, agentId);

  // For Retell/Vapi, use unified platform conversations list
  if (platform && platform !== 'elevenlabs') {
    return (
      <ClientPlatformConversations
        platform={platform}
        apiKey={apiKey}
        platformAgentId={platformAgentId}
        organizationId={organizationId}
        agentName={agentName}
      />
    );
  }
  
  const [page, setPage] = useState(1);
  const [selectedConversation, setSelectedConversation] = useState<string | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  
  // Advanced filters
  const [searchQuery, setSearchQuery] = useState('');
  const [durationRange, setDurationRange] = useState<[number, number]>([0, 600]);
  const [dateFrom, setDateFrom] = useState<Date | undefined>(undefined);
  const [dateTo, setDateTo] = useState<Date | undefined>(undefined);
  const [datePreset, setDatePreset] = useState<string | null>(null);

  // Date preset helper
  const applyDatePreset = (preset: string) => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
    let fromDate: Date;

    switch (preset) {
      case '7d':
        fromDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case '30d':
        fromDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      case '60d':
        fromDate = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
        break;
      default:
        return;
    }

    setDateFrom(fromDate);
    setDateTo(today);
    setDatePreset(preset);
  };

  const clearDatePreset = () => {
    setDatePreset(null);
    setDateFrom(undefined);
    setDateTo(undefined);
  };

  const { data: conversationsData, isLoading } = useClientElevenLabsConversations({
    apiKey,
    agentId: platformAgentId,
    organizationId,
  }, page, 20);

  const { data: conversationDetails, isLoading: detailsLoading, error: detailsError, refetch: refetchDetails } = useClientElevenLabsConversationDetails({
    apiKey,
    agentId: platformAgentId,
    organizationId,
  }, selectedConversation || undefined);

  const audioMutation = useClientElevenLabsAudio();
  const [audioLoadRequested, setAudioLoadRequested] = useState(false);

  const allConversations = conversationsData?.conversations || [];
  
  // Apply client-side filters
  const filteredConversations = allConversations.filter((conv: any) => {
    // Search filter
    if (searchQuery) {
      const searchLower = searchQuery.toLowerCase();
      const callerId = (conv.metadata?.caller_id || '').toLowerCase();
      const transcript = (conv.transcript || '').toLowerCase();
      if (!callerId.includes(searchLower) && !transcript.includes(searchLower)) {
        return false;
      }
    }
    
    // Duration filter
    const duration = conv.call_duration_secs || 0;
    if (duration < durationRange[0] || duration > durationRange[1]) {
      return false;
    }
    
    // Date filter
    if (dateFrom) {
      const convDate = new Date(conv.start_time_unix_secs * 1000);
      if (convDate < dateFrom) return false;
    }
    if (dateTo) {
      const convDate = new Date(conv.start_time_unix_secs * 1000);
      if (convDate > dateTo) return false;
    }
    
    return true;
  });

  const totalPages = Math.ceil((conversationsData?.total || 0) / 20);

  const [audioUnavailable, setAudioUnavailable] = useState(false);

  const handlePlayAudio = async (conversationId: string) => {
    if (!platformAgentId) return;
    
    setAudioUnavailable(false);
    
    try {
      const result = await audioMutation.mutateAsync({
        apiKey: apiKey || undefined,
        agentId: platformAgentId,
        organizationId: organizationId || undefined,
        conversationId,
        format: 'mp3'
      });
      
      if (result?.audio_unavailable) {
        setAudioUnavailable(true);
        toast.error("L'audio n'est pas disponible pour cette conversation");
      } else if (result?.audio_url) {
        setAudioUrl(result.audio_url);
      }
    } catch (error) {
      console.error('Error fetching audio:', error);
      toast.error("Erreur lors du chargement de l'audio");
    }
  };

  const exportToCSV = () => {
    if (!filteredConversations.length) {
      toast.error('Aucune donnée à exporter');
      return;
    }

    const headers = ['ID', 'Appelant', 'Durée', 'Statut', 'Date'];
    const csvContent = [
      headers.join(','),
      ...filteredConversations.map((conv: any) => [
        conv.conversation_id,
        `"${conv.metadata?.caller_id || 'Inconnu'}"`,
        conv.call_duration_secs ? `${Math.floor(conv.call_duration_secs / 60)}:${(conv.call_duration_secs % 60).toString().padStart(2, '0')}` : 'N/A',
        conv.status,
        format(new Date(conv.start_time_unix_secs * 1000), 'dd/MM/yyyy HH:mm', { locale: fr })
      ].join(','))
    ].join('\n');

    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `conversations_${agentName}_${format(new Date(), 'yyyy-MM-dd')}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success('Export CSV téléchargé');
  };

  const clearFilters = () => {
    setSearchQuery('');
    setDurationRange([0, 600]);
    setDateFrom(undefined);
    setDateTo(undefined);
    setDatePreset(null);
  };

  const activeFiltersCount = [
    searchQuery,
    durationRange[0] > 0 || durationRange[1] < 600,
    dateFrom || dateTo || datePreset
  ].filter(Boolean).length;

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getSentimentIcon = (sentiment?: string) => {
    switch (sentiment) {
      case 'positive':
        return <TrendingUp className="w-4 h-4 text-green-500" />;
      case 'negative':
        return <TrendingDown className="w-4 h-4 text-destructive" />;
      default:
        return <Minus className="w-4 h-4 text-muted-foreground" />;
    }
  };

  // Guard transcript: ensure it's always an array to prevent crashes
  const transcriptRaw = conversationDetails?.transcript;
  const transcript = Array.isArray(transcriptRaw) ? transcriptRaw : [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Conversations</h1>
          <p className="text-muted-foreground">Historique des appels de {agentName}</p>
        </div>
        <Button variant="outline" className="gap-2" onClick={exportToCSV}>
          <FileSpreadsheet className="w-4 h-4" />
          Export CSV
        </Button>
      </div>

      {/* Advanced Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-3">
            {/* Search */}
            <div className="flex-1 min-w-64 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Rechercher par appelant ou dans la transcription..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>

            {/* Date Presets */}
            <div className="flex items-center gap-1">
              <Button 
                variant={datePreset === '7d' ? 'default' : 'outline'} 
                size="sm"
                onClick={() => datePreset === '7d' ? clearDatePreset() : applyDatePreset('7d')}
              >
                7 jours
              </Button>
              <Button 
                variant={datePreset === '30d' ? 'default' : 'outline'} 
                size="sm"
                onClick={() => datePreset === '30d' ? clearDatePreset() : applyDatePreset('30d')}
              >
                30 jours
              </Button>
              <Button 
                variant={datePreset === '60d' ? 'default' : 'outline'} 
                size="sm"
                onClick={() => datePreset === '60d' ? clearDatePreset() : applyDatePreset('60d')}
              >
                60 jours
              </Button>
            </div>

            {/* Duration Filter */}
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="gap-2">
                  <SlidersHorizontal className="w-4 h-4" />
                  Durée
                  {(durationRange[0] > 0 || durationRange[1] < 600) && (
                    <Badge variant="secondary" className="text-xs">
                      {formatDuration(durationRange[0])} - {formatDuration(durationRange[1])}
                    </Badge>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-80 bg-background border">
                <div className="space-y-4">
                  <h4 className="font-medium">Filtrer par durée</h4>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm text-muted-foreground">
                      <span>{formatDuration(durationRange[0])}</span>
                      <span>{formatDuration(durationRange[1])}</span>
                    </div>
                    <Slider
                      value={durationRange}
                      onValueChange={(v) => setDurationRange([v[0], v[1]])}
                      max={600}
                      step={10}
                      className="w-full"
                    />
                  </div>
                </div>
              </PopoverContent>
            </Popover>

            {/* Custom Date Range */}
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="gap-2">
                  Dates personnalisées
                  {(dateFrom || dateTo) && !datePreset && (
                    <Badge variant="secondary" className="text-xs">
                      {dateFrom ? format(dateFrom, 'dd/MM', { locale: fr }) : '...'} - {dateTo ? format(dateTo, 'dd/MM', { locale: fr }) : '...'}
                    </Badge>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-4 bg-background border" align="start">
                <div className="space-y-4">
                  <h4 className="font-medium text-sm">Plage de dates</h4>
                  <div className="flex gap-4">
                    <div className="space-y-2">
                      <label className="text-xs text-muted-foreground">Du</label>
                      <Calendar
                        mode="single"
                        selected={dateFrom}
                        onSelect={(date) => {
                          setDateFrom(date);
                          setDatePreset(null);
                        }}
                        locale={fr}
                        className="pointer-events-auto"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs text-muted-foreground">Au</label>
                      <Calendar
                        mode="single"
                        selected={dateTo}
                        onSelect={(date) => {
                          setDateTo(date);
                          setDatePreset(null);
                        }}
                        locale={fr}
                        className="pointer-events-auto"
                      />
                    </div>
                  </div>
                </div>
              </PopoverContent>
            </Popover>

            {/* Clear Filters */}
            {activeFiltersCount > 0 && (
              <Button variant="ghost" onClick={clearFilters} className="gap-2">
                <X className="w-4 h-4" />
                Effacer ({activeFiltersCount})
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Conversations List */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            {filteredConversations.length} conversation{filteredConversations.length !== 1 ? 's' : ''}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-20 w-full" />
              ))}
            </div>
          ) : filteredConversations.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">
              Aucune conversation trouvée
            </p>
          ) : (
            <>
              <div className="space-y-3">
                {filteredConversations.map((conv: any) => (
                  <div
                    key={conv.conversation_id}
                    className="flex items-center justify-between p-4 rounded-lg border hover:bg-muted/50 cursor-pointer transition-colors"
                    onClick={() => {
                      setSelectedConversation(conv.conversation_id);
                      setAudioUrl(null);
                      setAudioLoadRequested(false);
                      setAudioUnavailable(false);
                    }}
                  >
                    <div className="flex items-center gap-4">
                      <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                        <User className="h-6 w-6 text-primary" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-medium">
                            {conv.metadata?.caller_id || 'Appelant inconnu'}
                          </p>
                          {getSentimentIcon(conv.analysis?.sentiment)}
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {format(new Date(conv.start_time_unix_secs * 1000), 'PPp', { locale: fr })}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <div className="flex items-center gap-1 text-sm">
                          <Clock className="h-4 w-4" />
                          {conv.call_duration_secs 
                            ? formatDuration(conv.call_duration_secs)
                            : 'N/A'
                          }
                        </div>
                        <Badge variant={conv.status === 'done' ? 'default' : 'secondary'}>
                          {conv.status === 'done' ? 'Terminé' : conv.status}
                        </Badge>
                      </div>
                      <Button 
                        variant="ghost" 
                        size="icon"
                        onClick={(e) => {
                          e.stopPropagation();
                          handlePlayAudio(conv.conversation_id);
                        }}
                        disabled={audioMutation.isPending}
                      >
                        {audioMutation.isPending ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Play className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-center gap-2 mt-6">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page === 1}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="text-sm text-muted-foreground">
                    Page {page} sur {totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Conversation Detail Modal with Advanced Audio Player */}
      <Dialog open={!!selectedConversation} onOpenChange={() => {
        setSelectedConversation(null);
        setAudioUrl(null);
        setAudioLoadRequested(false);
        setAudioUnavailable(false);
      }}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto bg-background">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5" />
              Détails de la conversation
            </DialogTitle>
          </DialogHeader>
          
          {detailsLoading ? (
            <div className="space-y-3 p-4">
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-40 w-full" />
            </div>
          ) : detailsError ? (
            <div className="p-8 text-center text-muted-foreground">
              <MessageSquare className="h-12 w-12 mx-auto mb-4 text-destructive/50" />
              <p className="text-destructive">Erreur lors du chargement des détails</p>
              <p className="text-sm mt-2">{(detailsError as Error)?.message || 'Une erreur est survenue'}</p>
              <Button 
                variant="outline" 
                className="mt-4"
                onClick={() => refetchDetails()}
              >
                Réessayer
              </Button>
            </div>
          ) : !conversationDetails ? (
            <div className="p-8 text-center text-muted-foreground">
              <MessageSquare className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Aucun détail disponible pour cette conversation</p>
              <Button 
                variant="outline" 
                className="mt-4"
                onClick={() => refetchDetails()}
              >
                Réessayer
              </Button>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Metadata */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="p-3 bg-muted rounded-lg">
                  <p className="text-sm text-muted-foreground">Appelant</p>
                  <p className="font-medium">{conversationDetails?.metadata?.caller_id || 'Inconnu'}</p>
                </div>
                <div className="p-3 bg-muted rounded-lg">
                  <p className="text-sm text-muted-foreground">Durée</p>
                  <p className="font-medium">
                    {conversationDetails?.call_duration_secs 
                      ? formatDuration(conversationDetails.call_duration_secs)
                      : 'N/A'}
                  </p>
                </div>
                <div className="p-3 bg-muted rounded-lg">
                  <p className="text-sm text-muted-foreground">Satisfaction</p>
                  <p className="font-medium">
                    {conversationDetails?.analysis?.satisfaction_score 
                      ? `${(conversationDetails.analysis.satisfaction_score * 100).toFixed(0)}%`
                      : 'N/A'}
                  </p>
                </div>
                <div className="p-3 bg-muted rounded-lg">
                  <p className="text-sm text-muted-foreground">Sentiment</p>
                  <div className="flex items-center gap-2">
                    {getSentimentIcon(conversationDetails?.analysis?.sentiment)}
                    <span className="font-medium capitalize">
                      {conversationDetails?.analysis?.sentiment || 'N/A'}
                    </span>
                  </div>
                </div>
              </div>

              {/* AI Analysis Section */}
              {conversationDetails?.analysis && (
                <div className="space-y-3 p-4 bg-primary/5 rounded-lg border border-primary/10">
                  <h4 className="font-medium flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-primary" />
                    Analyse AI
                  </h4>
                  
                  {/* Summary */}
                  {conversationDetails.analysis.summary && (
                    <div>
                      <p className="text-sm text-muted-foreground mb-1">Résumé</p>
                      <p className="text-sm">{conversationDetails.analysis.summary}</p>
                    </div>
                  )}
                  
                  {/* Data Collection Results */}
                  {conversationDetails.analysis.data_collection_results && 
                   Object.keys(conversationDetails.analysis.data_collection_results).length > 0 && (
                    <div>
                      <p className="text-sm text-muted-foreground mb-1">Informations collectées</p>
                      <div className="grid grid-cols-2 gap-2">
                        {Object.entries(conversationDetails.analysis.data_collection_results).map(([key, value]: [string, any]) => (
                          <div key={key} className="text-sm bg-background p-2 rounded">
                            <span className="text-muted-foreground">{key}:</span>{' '}
                            <span className="font-medium">{String(value?.value || value || 'N/A')}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  {/* Evaluation Criteria Results */}
                  {conversationDetails.analysis.evaluation_criteria_results && 
                   Object.keys(conversationDetails.analysis.evaluation_criteria_results).length > 0 && (
                    <div>
                      <p className="text-sm text-muted-foreground mb-1">Évaluations</p>
                      <div className="space-y-1">
                        {Object.entries(conversationDetails.analysis.evaluation_criteria_results).map(([key, value]: [string, any]) => (
                          <div key={key} className="flex items-center justify-between text-sm bg-background p-2 rounded">
                            <span>{key}</span>
                            <Badge variant={value?.result === 'success' ? 'default' : value?.result === 'failure' ? 'destructive' : 'secondary'}>
                              {value?.result || String(value || 'N/A')}
                            </Badge>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  {/* Show message if no detailed analysis */}
                  {!conversationDetails.analysis.summary && 
                   !conversationDetails.analysis.data_collection_results &&
                   !conversationDetails.analysis.evaluation_criteria_results && (
                    <p className="text-sm text-muted-foreground">
                      L'analyse détaillée n'est pas disponible pour cette conversation.
                    </p>
                  )}
                </div>
              )}

              {/* Load Audio Button - Only show if audio not yet loaded */}
              {!audioUrl && !audioMutation.isPending && !audioUnavailable && (
                <div className="p-4 bg-muted/50 rounded-lg text-center">
                  <Button 
                    onClick={() => {
                      if (selectedConversation) {
                        setAudioLoadRequested(true);
                        handlePlayAudio(selectedConversation);
                      }
                    }}
                    className="gap-2"
                  >
                    <Volume2 className="h-4 w-4" />
                    Charger l'audio
                  </Button>
                  <p className="text-xs text-muted-foreground mt-2">
                    Cliquez pour charger et écouter l'enregistrement
                  </p>
                </div>
              )}

              {/* Audio Unavailable State */}
              {audioUnavailable && (
                <div className="p-4 bg-muted rounded-lg text-center">
                  <Volume2 className="h-6 w-6 mx-auto mb-2 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">
                    L'audio n'est pas disponible pour cette conversation
                  </p>
                </div>
              )}

              {/* Audio Loading State */}
              {audioMutation.isPending && (
                <div className="p-6 bg-muted rounded-lg text-center">
                  <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">Chargement de l'audio...</p>
                </div>
              )}

              {/* Audio Error State */}
              {audioLoadRequested && !audioMutation.isPending && !audioUrl && !audioUnavailable && audioMutation.isError && (
                <div className="p-4 bg-destructive/10 rounded-lg text-center">
                  <p className="text-sm text-destructive">Impossible de charger l'audio</p>
                  <Button 
                    variant="outline" 
                    size="sm"
                    className="mt-2"
                    onClick={() => selectedConversation && handlePlayAudio(selectedConversation)}
                  >
                    Réessayer
                  </Button>
                </div>
              )}

              {/* Advanced Audio Player */}
              {audioUrl && selectedConversation && (
                <AdvancedAudioPlayer
                  audioUrl={audioUrl}
                  conversation={{
                    conversation_id: selectedConversation,
                    caller_number: conversationDetails?.metadata?.caller_id,
                    duration_seconds: conversationDetails?.call_duration_secs,
                    satisfaction_score: conversationDetails?.analysis?.satisfaction_score,
                  }}
                  transcript={transcript.map((msg: any, index: number) => ({
                    speaker: msg.role === 'agent' ? 'agent' : 'caller',
                    text: msg.message,
                    timestamp: msg.time_in_call_secs ? msg.time_in_call_secs * 1000 : index * 5000,
                  }))}
                />
              )}

              {/* Transcript */}
              {transcript.length > 0 && (
                <div className="space-y-3">
                  <h4 className="font-medium">Transcription</h4>
                  <ScrollArea className="max-h-64">
                    <div className="space-y-3 pr-4">
                      {transcript.map((msg: any, index: number) => (
                        <div
                          key={index}
                          className={`flex gap-3 ${msg.role === 'agent' ? 'justify-start' : 'justify-end'}`}
                        >
                          <div
                            className={`max-w-[80%] p-3 rounded-lg ${
                              msg.role === 'agent'
                                ? 'bg-primary/10 text-foreground'
                                : 'bg-muted text-foreground'
                            }`}
                          >
                            <div className="flex items-center gap-2 mb-1">
                              {msg.role === 'agent' ? (
                                <Bot className="h-4 w-4" />
                              ) : (
                                <User className="h-4 w-4" />
                              )}
                              <span className="text-xs font-medium">
                                {msg.role === 'agent' ? 'Agent' : 'Utilisateur'}
                              </span>
                              {msg.time_in_call_secs && (
                                <span className="text-xs text-muted-foreground">
                                  {formatDuration(msg.time_in_call_secs)}
                                </span>
                              )}
                            </div>
                            <p className="text-sm">{msg.message}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ClientAgentConversations;
