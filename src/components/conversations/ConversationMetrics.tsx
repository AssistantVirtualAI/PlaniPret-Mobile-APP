import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Phone, TrendingUp, Clock } from 'lucide-react';
import type { ConversationDetails } from '@/hooks/useConversationDetails';
import type { ConversationAnalysis } from '@/hooks/useConversationAnalysis';

interface ConversationMetricsProps {
  conversation: ConversationDetails;
  analysis?: ConversationAnalysis;
}

export function ConversationMetrics({ conversation, analysis }: ConversationMetricsProps) {
  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {/* Informations générales */}
      <Card className="glass-card border-primary/30">
        <CardHeader>
          <CardTitle className="text-primary flex items-center gap-2">
            <Phone className="w-5 h-5" />
            Informations Générales
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Plateforme:</span>
            <Badge variant="outline">{conversation.platform || 'N/A'}</Badge>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Durée:</span>
            <span>{formatDuration(conversation.duration || 0)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Statut:</span>
            <Badge variant={conversation.status === 'completed' ? 'default' : 'destructive'}>
              {conversation.status}
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* Métriques de performance */}
      {analysis && (
        <Card className="glass-card border-secondary/30">
          <CardHeader>
            <CardTitle className="text-secondary flex items-center gap-2">
              <TrendingUp className="w-5 h-5" />
              Métriques de Performance
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Temps de parole:</span>
              <span>{analysis.callMetrics.talkTime}%</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Silence:</span>
              <span>{analysis.callMetrics.silenceTime}%</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Interruptions:</span>
              <span>{analysis.callMetrics.interruptionCount}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Mots/minute:</span>
              <span>{analysis.callMetrics.wordsPerMinute}</span>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
