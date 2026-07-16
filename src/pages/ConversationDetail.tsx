import { useParams, useNavigate } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowLeft, Phone, Clock, Star, MessageSquare } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { AdvancedAudioPlayer } from '@/components/audio/AdvancedAudioPlayer';
import { useConversationDetails } from '@/hooks/useConversationDetails';
import { ConversationCardSkeleton } from '@/components/LoadingSkeleton';

const ConversationDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data: conversation, isLoading, error } = useConversationDetails(id || '');

  const getSentimentIcon = (sentiment: string) => {
    if (sentiment === 'positive') return '😊';
    if (sentiment === 'negative') return '😟';
    return '😐';
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (isLoading) {
    return (
      <AppLayout>
        <div className="container mx-auto p-6">
          <div className="space-y-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <ConversationCardSkeleton key={i} />
            ))}
          </div>
        </div>
      </AppLayout>
    );
  }

  if (error || !conversation) {
    return (
      <AppLayout>
        <div className="container mx-auto p-6">
          <Card className="glass-card">
            <CardContent className="pt-6">
              <p className="text-center text-muted-foreground">
                Conversation not found or error loading data.
              </p>
              <div className="flex justify-center mt-4">
                <Button onClick={() => navigate('/conversations')}>
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Back to Conversations
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </AppLayout>
    );
  }

  // Parse transcript into segments
  const transcriptSegments = conversation.transcript ? 
    conversation.transcript.split('\n').map((line, index) => {
      const [speaker, ...textParts] = line.split(':');
      return {
        speaker: speaker.toLowerCase().includes('agent') ? 'agent' as const : 'caller' as const,
        text: textParts.join(':').trim(),
        timestamp: index * 10000, // Mock timestamps
        confidence: 0.95
      };
    }).filter(seg => seg.text) : [];

  // Mock analysis data
  const analysis = {
    summary: conversation.metadata?.summary || 'Conversation analysis not available.',
    emotions: {
      positive: conversation.sentiment === 'positive' ? 60 : conversation.sentiment === 'negative' ? 20 : 40,
      neutral: 30,
      negative: conversation.sentiment === 'negative' ? 50 : 10
    },
    keyTopics: conversation.keywords || [],
    resolution: conversation.status === 'completed' ? 'Resolved' : 'In Progress',
    nextSteps: conversation.metadata?.next_steps || 'No next steps defined'
  };

  return (
    <AppLayout>
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="outline" size="icon" onClick={() => navigate('/conversations')}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h1 className="text-3xl font-bold">{conversation.title}</h1>
              <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Clock className="h-4 w-4" />
                  {new Date(conversation.created_at).toLocaleString()}
                </span>
                <span className="flex items-center gap-1">
                  <Phone className="h-4 w-4" />
                  {conversation.platform || 'Phone'}
                </span>
                <Badge variant="outline">
                  {getSentimentIcon(conversation.sentiment)} {conversation.sentiment}
                </Badge>
                {conversation.satisfaction_score && (
                  <Badge variant="outline">
                    <Star className="h-3 w-3 mr-1" />
                    {(conversation.satisfaction_score * 100).toFixed(0)}%
                  </Badge>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <Tabs defaultValue="overview" className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="audio">Audio</TabsTrigger>
            <TabsTrigger value="transcript">Transcript</TabsTrigger>
            <TabsTrigger value="analysis">Analysis</TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card className="glass-card">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <MessageSquare className="h-5 w-5" />
                    Key Information
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Duration:</span>
                    <span className="font-semibold">{formatDuration(conversation.duration || 0)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Status:</span>
                    <Badge variant="outline">
                      {conversation.status}
                    </Badge>
                  </div>
                  {conversation.satisfaction_score && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Satisfaction:</span>
                      <div className="flex items-center gap-2">
                        <Progress value={conversation.satisfaction_score * 100} className="w-20" />
                        <span className="font-semibold">{(conversation.satisfaction_score * 100).toFixed(0)}%</span>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className="glass-card">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Star className="h-5 w-5" />
                    Sentiment
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-center text-6xl">
                    {getSentimentIcon(conversation.sentiment)}
                  </div>
                  <p className="text-center mt-2 text-muted-foreground capitalize">
                    {conversation.sentiment}
                  </p>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Audio Tab */}
          <TabsContent value="audio">
            {conversation.audio_url ? (
              <AdvancedAudioPlayer
                audioUrl={conversation.audio_url}
                conversation={{
                  conversation_id: conversation.id,
                  duration_seconds: conversation.duration,
                  satisfaction_score: conversation.satisfaction_score,
                }}
                transcript={transcriptSegments}
              />
            ) : (
              <Card className="glass-card">
                <CardContent className="pt-6">
                  <p className="text-center text-muted-foreground">
                    No audio recording available for this conversation.
                  </p>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Transcript Tab */}
          <TabsContent value="transcript">
            <Card className="glass-card">
              <CardHeader>
                <CardTitle>Complete Transcript</CardTitle>
              </CardHeader>
              <CardContent>
                {conversation.transcript ? (
                  <div className="space-y-3">
                    {conversation.transcript.split('\n').map((line, index) => (
                      <div key={index} className="p-3 rounded-lg bg-accent/10">
                        <p className="text-foreground whitespace-pre-wrap">{line}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-center text-muted-foreground">
                    No transcript available for this conversation.
                  </p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Analysis Tab */}
          <TabsContent value="analysis" className="space-y-4">
            <Card className="glass-card">
              <CardHeader>
                <CardTitle>Analysis Summary</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">{analysis.summary}</p>
              </CardContent>
            </Card>

            <Card className="glass-card">
              <CardHeader>
                <CardTitle>Emotion Distribution</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <div className="flex justify-between mb-1">
                    <span className="text-green-500">Positive</span>
                    <span>{analysis.emotions.positive}%</span>
                  </div>
                  <Progress value={analysis.emotions.positive} className="h-2" />
                </div>
                <div>
                  <div className="flex justify-between mb-1">
                    <span className="text-muted-foreground">Neutral</span>
                    <span>{analysis.emotions.neutral}%</span>
                  </div>
                  <Progress value={analysis.emotions.neutral} className="h-2" />
                </div>
                <div>
                  <div className="flex justify-between mb-1">
                    <span className="text-red-500">Negative</span>
                    <span>{analysis.emotions.negative}%</span>
                  </div>
                  <Progress value={analysis.emotions.negative} className="h-2" />
                </div>
              </CardContent>
            </Card>

            <Card className="glass-card">
              <CardHeader>
                <CardTitle>Resolution</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{analysis.resolution}</Badge>
                  </div>
                  <p className="text-muted-foreground mt-2">
                    Next steps: {analysis.nextSteps}
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
};

export default ConversationDetail;
