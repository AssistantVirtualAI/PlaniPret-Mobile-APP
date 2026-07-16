import { useState, useEffect, useMemo, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AdvancedAudioPlayer } from '@/components/audio/AdvancedAudioPlayer';
import { ConversationMetrics } from './ConversationMetrics';
import { SentimentTimeline } from './SentimentTimeline';
import { ImprovementsList } from './ImprovementCard';
import { SatisfactionScore, SatisfactionBadge } from './SatisfactionScore';
import { SmartTagsList } from './SmartTags';
import { CustomTagPicker } from './CustomTagPicker';
import { useConversationDetails } from '@/hooks/useConversationDetails';
import { useEnhancedConversationAnalysis } from '@/hooks/useEnhancedConversationAnalysis';
import { ConversationCardSkeleton } from '@/components/LoadingSkeleton';
import { Brain, Sparkles, TrendingUp, TrendingDown, Minus, Target, Lightbulb, Tag, Bot, User } from 'lucide-react';
import { motion } from 'framer-motion';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  normalizeTranscript,
  transcriptToAudioPlayerFormat,
  type TranscriptMessage
} from '@/lib/transcript/normalizeElevenLabsTranscript';

interface ConversationDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  conversationId: string;
}

export function ConversationDetailModal({
  isOpen,
  onClose,
  conversationId
}: ConversationDetailModalProps) {
  const [activeTab, setActiveTab] = useState('overview');
  const { data: conversation, isLoading, error } = useConversationDetails(conversationId);
  const { analysis, isAnalyzing, generateAnalysis, error: analysisError } = useEnhancedConversationAnalysis(conversationId);

  const autoAnalyzeAttemptedRef = useRef(false);

  // Générer l'analyse automatiquement dès l'ouverture si elle n'existe pas (sans boucle infinie)
  useEffect(() => {
    if (!isOpen) {
      autoAnalyzeAttemptedRef.current = false;
      return;
    }

    if (analysisError) return;

    if (conversationId !== '' && isOpen && conversation && !analysis && !isAnalyzing && !autoAnalyzeAttemptedRef.current) {
      autoAnalyzeAttemptedRef.current = true;
      generateAnalysis({});
    }
  }, [isOpen, conversationId, conversation, analysis, isAnalyzing, analysisError, generateAnalysis]);

  // Extraire le nom du client depuis les métadonnées
  const clientName = useMemo(() => {
    if (!conversation?.metadata) return 'Inconnu';
    const meta = conversation.metadata as any;
    return meta?.caller_name || meta?.customer_name || meta?.user_name || meta?.name || 'Inconnu';
  }, [conversation?.metadata]);

  // Normalize and deduplicate transcript messages using shared utility
  const transcriptMessages = useMemo((): TranscriptMessage[] => {
    if (!conversation) return [];
    return normalizeTranscript({
      metadata: conversation.metadata,
      user_messages: conversation.user_messages,
      agent_messages: conversation.agent_messages,
      transcript: conversation.transcript
    });
  }, [conversation]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const getSentimentIcon = (sentiment: string) => {
    switch (sentiment) {
      case 'positive':
        return <TrendingUp className="w-4 h-4 text-success" />;
      case 'negative':
        return <TrendingDown className="w-4 h-4 text-destructive" />;
      default:
        return <Minus className="w-4 h-4 text-muted-foreground" />;
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
      case 'positive': return 'Positif';
      case 'negative': return 'Négatif';
      default: return 'Neutre';
    }
  };

  const getSentimentColor = (sentiment: string) => {
    switch (sentiment) {
      case 'positive': return 'text-green-400';
      case 'negative': return 'text-red-400';
      default: return 'text-yellow-400';
    }
  };

  // Calculer le score à afficher (analyse > conversation)
  const displayScore = analysis?.satisfaction_score ?? conversation?.satisfaction_score;
  const displaySentiment = analysis?.sentiment ?? conversation?.sentiment;

  if (isLoading) {
    return (
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-w-4xl max-h-[90vh]">
          <ConversationCardSkeleton />
        </DialogContent>
      </Dialog>
    );
  }

  if (error || !conversation) {
    return (
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Erreur</DialogTitle>
          </DialogHeader>
          <p className="text-destructive">Impossible de charger la conversation.</p>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden glass-card animate-in fade-in-0 zoom-in-95">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="text-xl font-bold gradient-text">
              {conversation.title}
            </DialogTitle>
            <div className="flex items-center gap-2">
              {displayScore !== null && displayScore !== undefined && (
                <SatisfactionBadge score={displayScore} />
              )}
              {displaySentiment && (
                <Badge variant="outline" className={getSentimentColor(displaySentiment)}>
                  {getSentimentEmoji(displaySentiment)} {getSentimentLabel(displaySentiment)}
                </Badge>
              )}
            </div>
          </div>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 overflow-hidden">
          <TabsList className="grid w-full grid-cols-4 glass-card">
            <TabsTrigger value="overview">
              Overview
            </TabsTrigger>
            <TabsTrigger value="audio">
              Audio
            </TabsTrigger>
            <TabsTrigger value="transcript">
              Transcript
            </TabsTrigger>
            <TabsTrigger value="analysis">
              <Sparkles className="w-4 h-4 mr-2" />
              AI Analysis
            </TabsTrigger>
          </TabsList>

          <div className="mt-4 overflow-y-auto max-h-[calc(90vh-200px)]">
            <TabsContent value="overview" className="space-y-4">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4 }}
              >
                {/* Score de satisfaction et Sentiment en haut */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                  <Card className="glass-card">
                    <CardHeader className="pb-2">
                      <CardTitle className="flex items-center gap-2 text-primary text-sm">
                        <Target className="w-4 h-4" />
                        Score de Satisfaction
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="flex justify-center py-2">
                      {displayScore !== null && displayScore !== undefined ? (
                        <SatisfactionScore score={displayScore} size="md" />
                      ) : isAnalyzing ? (
                        <div className="flex flex-col items-center gap-2">
                          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
                          <span className="text-xs text-muted-foreground">Analyse en cours...</span>
                        </div>
                      ) : (
                        <span className="text-muted-foreground text-sm">En attente d'analyse</span>
                      )}
                    </CardContent>
                  </Card>

                  <Card className="glass-card">
                    <CardHeader className="pb-2">
                      <CardTitle className="flex items-center gap-2 text-sm">
                        {displaySentiment ? getSentimentIcon(displaySentiment) : <Minus className="w-4 h-4" />}
                        Sentiment Global
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="flex items-center justify-center py-4">
                      {displaySentiment ? (
                        <div className="flex items-center gap-3">
                          <span className="text-4xl">{getSentimentEmoji(displaySentiment)}</span>
                          <div>
                            <p className={`font-medium text-lg ${getSentimentColor(displaySentiment)}`}>
                              {getSentimentLabel(displaySentiment)}
                            </p>
                            {analysis?.confidence && (
                              <p className="text-xs text-muted-foreground">
                                Confiance: {(analysis.confidence * 100).toFixed(0)}%
                              </p>
                            )}
                          </div>
                        </div>
                      ) : isAnalyzing ? (
                        <div className="flex flex-col items-center gap-2">
                          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
                          <span className="text-xs text-muted-foreground">Analyse en cours...</span>
                        </div>
                      ) : (
                        <span className="text-muted-foreground text-sm">En attente d'analyse</span>
                      )}
                    </CardContent>
                  </Card>
                </div>

                <ConversationMetrics conversation={conversation} analysis={analysis} />
              </motion.div>

              {/* Résumé IA */}
              {analysis && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, delay: 0.2 }}
                >
                  <Card className="glass-card">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Brain className="w-5 h-5 text-primary" />
                        Résumé IA
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-muted-foreground">{analysis.summary}</p>
                    </CardContent>
                  </Card>
                </motion.div>
              )}
            </TabsContent>

            <TabsContent value="audio">
              {conversation.audio_url ? (
                <AdvancedAudioPlayer
                  audioUrl={conversation.audio_url}
                  conversation={{
                    conversation_id: conversation.id,
                    caller_number: '',
                    duration_seconds: conversation.duration,
                    satisfaction_score: conversation.satisfaction_score,
                  }}
                  transcript={
                    typeof conversation.transcript === 'string'
                      ? []
                      : (conversation.transcript as any)?.segments || []
                  }
                />
              ) : (
                <Card className="p-8 text-center glass-card">
                  <p className="text-muted-foreground">Aucun enregistrement audio disponible</p>
                </Card>
              )}
            </TabsContent>

            <TabsContent value="transcript" className="space-y-4">
              {transcriptMessages.length > 0 ? (
                <ScrollArea className="h-[500px] pr-4">
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
                                {isAgent ? 'Agent IA' : clientName}
                              </span>
                              {msg.time_in_call_secs !== undefined && (
                                <span className="text-xs text-muted-foreground">
                                  {Math.floor(msg.time_in_call_secs / 60)}:{String(Math.floor(msg.time_in_call_secs % 60)).padStart(2, '0')}
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
                <Card className="p-8 text-center glass-card">
                  <p className="text-muted-foreground">Aucune transcription disponible</p>
                </Card>
              )}
            </TabsContent>

            <TabsContent value="analysis" className="space-y-4">
              {!analysis && !isAnalyzing && (
                <Card className="p-8 text-center glass-card">
                  <Brain className="w-12 h-12 mx-auto mb-4 text-primary" />
                  <p className="text-muted-foreground mb-4">
                    Générez une analyse IA complète de cette conversation avec score de satisfaction et recommandations d'amélioration
                  </p>
                  <Button onClick={() => generateAnalysis({})} className="gap-2">
                    <Sparkles className="w-4 h-4" />
                    Générer l'Analyse
                  </Button>
                </Card>
              )}

              {isAnalyzing && (
                <Card className="p-8 text-center glass-card">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4" />
                  <p className="text-muted-foreground">Analyse en cours...</p>
                </Card>
              )}

              {analysis && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4 }}
                  className="space-y-6"
                >
                  {/* Score de satisfaction et Sentiment global */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Card className="glass-card">
                      <CardHeader className="pb-2">
                        <CardTitle className="flex items-center gap-2 text-primary">
                          <Target className="w-5 h-5" />
                          Score de Satisfaction
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="flex justify-center py-4">
                        <SatisfactionScore score={analysis.satisfaction_score} size="lg" />
                      </CardContent>
                    </Card>

                    <Card className="glass-card">
                      <CardHeader className="pb-2">
                        <CardTitle className="flex items-center gap-2">
                          {getSentimentIcon(analysis.sentiment)}
                          Analyse de Sentiment
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <div className="flex items-center gap-3">
                          <span className="text-3xl">{getSentimentEmoji(analysis.sentiment)}</span>
                          <div>
                            <p className={`font-medium text-lg ${getSentimentColor(analysis.sentiment)}`}>
                              {getSentimentLabel(analysis.sentiment)}
                            </p>
                            <p className="text-sm text-muted-foreground">
                              Confiance: {(analysis.confidence * 100).toFixed(0)}%
                            </p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </div>

                  {/* Timeline du sentiment */}
                  {analysis.sentiment_timeline && analysis.sentiment_timeline.length > 0 && (
                    <Card className="glass-card">
                      <CardHeader>
                        <CardTitle className="text-secondary">Évolution du Sentiment</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <SentimentTimeline timeline={analysis.sentiment_timeline} />
                      </CardContent>
                    </Card>
                  )}

                  {/* Custom Tags */}
                  <Card className="glass-card">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Tag className="w-5 h-5 text-primary" />
                        Tags
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <CustomTagPicker conversationId={conversationId} />
                    </CardContent>
                  </Card>

                  {/* Smart Tags */}
                  {(analysis as any).smart_tags && (analysis as any).smart_tags.length > 0 && (
                    <Card className="glass-card">
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                          <Tag className="w-5 h-5 text-primary" />
                          Catégories Intelligentes
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <SmartTagsList tags={(analysis as any).smart_tags} />
                      </CardContent>
                    </Card>
                  )}

                  {/* Topics et Intentions */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {analysis.topics && analysis.topics.length > 0 && (
                      <Card className="glass-card">
                        <CardHeader>
                          <CardTitle className="text-secondary">Topics Détectés</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="flex flex-wrap gap-2">
                            {analysis.topics.map((topic, index) => (
                              <Badge key={index} variant="outline">
                                {topic}
                              </Badge>
                            ))}
                          </div>
                        </CardContent>
                      </Card>
                    )}

                    {analysis.intentions && analysis.intentions.length > 0 && (
                      <Card className="glass-card">
                        <CardHeader>
                          <CardTitle className="text-accent">Intentions</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="flex flex-wrap gap-2">
                            {analysis.intentions.map((intention, index) => (
                              <Badge key={index} variant="outline">
                                {intention}
                              </Badge>
                            ))}
                          </div>
                        </CardContent>
                      </Card>
                    )}
                  </div>

                  {/* Recommandations d'amélioration */}
                  <Card className="glass-card">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-primary">
                        <Lightbulb className="w-5 h-5" />
                        Recommandations d'Amélioration
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ImprovementsList improvements={analysis.improvements || []} />
                    </CardContent>
                  </Card>

                  {/* Action Items */}
                  {analysis.actionItems && analysis.actionItems.length > 0 && (
                    <Card className="glass-card">
                      <CardHeader>
                        <CardTitle className="text-yellow-500">Action Items</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <ul className="space-y-2">
                          {analysis.actionItems.map((item, index) => (
                            <li key={index} className="flex items-center gap-2 text-sm">
                              <span className="w-2 h-2 bg-yellow-500 rounded-full" />
                              {item}
                            </li>
                          ))}
                        </ul>
                      </CardContent>
                    </Card>
                  )}
                </motion.div>
              )}
            </TabsContent>
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
