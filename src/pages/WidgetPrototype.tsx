import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { useConversation } from '@11labs/react';
import { supabase } from '@/integrations/supabase/client';
import { Mic, MicOff, Volume2, Loader2, UserRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface AgentData {
  id: string;
  name: string;
  description: string | null;
  avatar_url: string | null;
  branding_url: string | null;
  platform_agent_id: string | null;
  platform: string;
  organization_id: string;
  theme_config: {
    primaryColor?: string;
    secondaryColor?: string;
    textColor?: string;
    borderRadius?: string;
  } | null;
}

interface TranscriptMessage {
  role: 'agent' | 'user';
  text: string;
  timestamp: Date;
}

// Keywords that trigger handoff to human
const HANDOFF_KEYWORDS = [
  'parler à un humain',
  'parler a un humain',
  'agent humain',
  'personne réelle',
  'personne reelle',
  'talk to human',
  'speak to human',
  'real person',
  'human agent',
  'représentant',
  'representant',
  'conseiller',
  'opérateur',
  'operateur',
  'transfert',
  'escalade',
];

const WidgetPrototype = () => {
  const { agentId } = useParams<{ agentId: string }>();
  const [agent, setAgent] = useState<AgentData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<TranscriptMessage[]>([]);
  const [isConnecting, setIsConnecting] = useState(false);
  const [handoffRequested, setHandoffRequested] = useState(false);

  // Check if message contains handoff keywords
  const checkForHandoffTrigger = useCallback((message: string) => {
    const lowerMessage = message.toLowerCase();
    return HANDOFF_KEYWORDS.some(keyword => lowerMessage.includes(keyword));
  }, []);

  // Request handoff to human agent
  const requestHandoff = useCallback(async (reason: string) => {
    if (!agent || handoffRequested) return;

    setHandoffRequested(true);
    
    try {
      const transcriptText = transcript.map(m => 
        `${m.role === 'agent' ? agent.name : 'User'}: ${m.text}`
      ).join('\n');

      const { data, error: handoffError } = await supabase.functions.invoke('request-handoff', {
        body: {
          organizationId: agent.organization_id,
          agentId: agent.id,
          reason,
          priority: 'normal',
          customerInfo: {
            name: 'Widget User',
          },
          transcriptSnapshot: transcriptText,
        }
      });

      if (handoffError) throw handoffError;

      toast.success('Demande de transfert envoyée ! Un agent humain vous contactera bientôt.');
      
      setTranscript(prev => [...prev, {
        role: 'agent',
        text: '🤝 Votre demande de parler à un agent humain a été enregistrée. Un conseiller vous contactera très bientôt.',
        timestamp: new Date(),
      }]);

    } catch (err) {
      console.error('Error requesting handoff:', err);
      toast.error('Impossible de transférer vers un agent humain');
      setHandoffRequested(false);
    }
  }, [agent, transcript, handoffRequested]);

  // ElevenLabs useConversation hook
  const conversation = useConversation({
    onConnect: () => {
      console.log('Connected to ElevenLabs');
      setIsConnecting(false);
    },
    onDisconnect: () => {
      console.log('Disconnected from ElevenLabs');
    },
    onMessage: (message) => {
      console.log('Message received:', message);
      if (message.message) {
        const role = message.source === 'ai' ? 'agent' : 'user';
        const text = message.message;
        
        setTranscript(prev => [...prev, {
          role,
          text,
          timestamp: new Date(),
        }]);

        // Check for handoff trigger in user messages
        if (role === 'user' && checkForHandoffTrigger(text)) {
          requestHandoff(`User said: "${text}"`);
        }
      }
    },
    onError: (error) => {
      console.error('Conversation error:', error);
      const errorMessage = typeof error === 'string' ? error : (error as any)?.message || 'Inconnue';
      setError('Erreur de connexion: ' + errorMessage);
      setIsConnecting(false);
    },
  });

  useEffect(() => {
    const fetchAgent = async () => {
      if (!agentId) {
        setError('Agent ID manquant');
        setLoading(false);
        return;
      }

      const { data, error: fetchError } = await supabase
        .from('agents_safe')
        .select('id, name, description, avatar_url, branding_url, platform_agent_id, platform, organization_id, theme_config')
        .eq('id', agentId)
        .single();

      if (fetchError || !data) {
        setError('Agent non trouvé');
        setLoading(false);
        return;
      }

      setAgent({
        ...data,
        theme_config: data.theme_config as AgentData['theme_config']
      });
      setLoading(false);
    };

    fetchAgent();
  }, [agentId]);

  const handleStartConversation = useCallback(async () => {
    if (!agent) return;

    if (agent.platform !== 'elevenlabs') {
      setError('Cet agent n\'est pas configuré avec ElevenLabs');
      return;
    }

    if (!agent.platform_agent_id) {
      setError('Agent ID ElevenLabs non configuré');
      return;
    }

    try {
      // Request microphone permission
      await navigator.mediaDevices.getUserMedia({ audio: true });
      
      setIsConnecting(true);
      setError(null);
      setHandoffRequested(false);
      
      // Get signed URL from edge function
      const { data, error: urlError } = await supabase.functions.invoke('elevenlabs-signed-url', {
        body: { agentId: agent.id }
      });

      if (urlError || !data?.signedUrl) {
        throw new Error(urlError?.message || 'Impossible d\'obtenir l\'URL de connexion');
      }

      // Start conversation with signed URL
      await conversation.startSession({
        signedUrl: data.signedUrl,
      });

    } catch (err: any) {
      console.error('Error starting conversation:', err);
      setError(err.message || 'Erreur lors du démarrage de la conversation');
      setIsConnecting(false);
    }
  }, [agent, conversation]);

  const handleEndConversation = useCallback(async () => {
    try {
      await conversation.endSession();
      
      // Save transcript to database
      if (agent && transcript.length > 0) {
        const transcriptText = transcript.map(m => `${m.role === 'agent' ? agent.name : 'User'}: ${m.text}`).join('\n');
        const userMessages = transcript.filter(m => m.role === 'user').map(m => ({ text: m.text, timestamp: m.timestamp.toISOString() }));
        const agentMessages = transcript.filter(m => m.role === 'agent').map(m => ({ text: m.text, timestamp: m.timestamp.toISOString() }));
        
        const { data: userData } = await supabase.auth.getUser();
        if (userData.user) {
          const { error: saveError } = await supabase
            .from('conversations')
            .insert([{
              title: `Conversation avec ${agent.name}`,
              agent_id: agent.id,
              platform: 'elevenlabs',
              status: 'completed',
              transcript: transcriptText,
              user_messages: userMessages,
              agent_messages: agentMessages,
              duration: Math.floor((new Date().getTime() - (transcript[0]?.timestamp?.getTime() || Date.now())) / 1000),
              user_id: userData.user.id,
            }]);
          
          if (saveError) {
            console.error('Error saving conversation:', saveError);
          } else {
            console.log('Conversation saved successfully');
          }
        }
      }
      
      setTranscript(prev => [...prev, {
        role: 'agent',
        text: '--- Conversation terminée ---',
        timestamp: new Date(),
      }]);
    } catch (err) {
      console.error('Error ending conversation:', err);
    }
  }, [conversation, agent, transcript]);

  // Manual handoff button handler
  const handleManualHandoff = useCallback(() => {
    requestHandoff('User clicked handoff button');
  }, [requestHandoff]);

  const themeConfig = agent?.theme_config || {};
  const primaryColor = themeConfig.primaryColor || '#8B5CF6';
  const borderRadius = themeConfig.borderRadius || '12px';

  const isConnected = conversation.status === 'connected';
  const isSpeaking = conversation.isSpeaking;

  // Determine current status
  const getStatusInfo = () => {
    if (handoffRequested) return { text: 'Transfert en cours...', color: 'bg-yellow-500' };
    if (isConnecting) return { text: 'Connexion...', color: 'bg-yellow-500' };
    if (!isConnected) return { text: 'Prêt à démarrer', color: 'bg-muted-foreground' };
    if (isSpeaking) return { text: 'En train de parler...', color: 'bg-primary' };
    return { text: 'En écoute...', color: 'bg-green-500' };
  };

  const statusInfo = getStatusInfo();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error && !agent) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-destructive mb-2">Erreur</h1>
          <p className="text-muted-foreground">{error}</p>
        </div>
      </div>
    );
  }

  if (!agent) return null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-muted flex flex-col">
      {/* Header with branding */}
      {agent.branding_url && (
        <header className="p-4 flex justify-center border-b border-border/50">
          <img 
            src={agent.branding_url} 
            alt="Logo" 
            className="h-8 object-contain"
          />
        </header>
      )}

      {/* Main content */}
      <main className="flex-1 flex flex-col items-center justify-center p-6">
        <div 
          className="w-full max-w-md bg-card border border-border shadow-2xl overflow-hidden"
          style={{ borderRadius }}
        >
          {/* Agent header */}
          <div 
            className="p-6 text-white text-center"
            style={{ backgroundColor: primaryColor }}
          >
            {agent.avatar_url ? (
              <img 
                src={agent.avatar_url} 
                alt={agent.name}
                className={cn(
                  "w-20 h-20 rounded-full mx-auto mb-4 border-4 border-white/30 object-cover transition-all",
                  isSpeaking && "ring-4 ring-white/50 animate-pulse"
                )}
              />
            ) : (
              <div className={cn(
                "w-20 h-20 rounded-full mx-auto mb-4 border-4 border-white/30 bg-white/20 flex items-center justify-center transition-all",
                isSpeaking && "ring-4 ring-white/50 animate-pulse"
              )}>
                <Volume2 className="h-10 w-10" />
              </div>
            )}
            <h1 className="text-xl font-bold">{agent.name}</h1>
            {agent.description && (
              <p className="text-sm opacity-80 mt-1">{agent.description}</p>
            )}
          </div>

          {/* Status indicator */}
          <div className="p-4 border-b border-border">
            <div className="flex items-center justify-center gap-2">
              <div className={cn(
                "w-3 h-3 rounded-full animate-pulse",
                statusInfo.color
              )} />
              <span className="text-sm text-muted-foreground">
                {statusInfo.text}
              </span>
            </div>
          </div>

          {/* Error message */}
          {error && (
            <div className="p-3 bg-destructive/10 border-b border-destructive/20">
              <p className="text-sm text-destructive text-center">{error}</p>
            </div>
          )}

          {/* Transcript area */}
          <div className="h-48 overflow-y-auto p-4 space-y-2 bg-muted/30">
            {transcript.length === 0 ? (
              <p className="text-center text-muted-foreground text-sm">
                Cliquez sur le microphone pour démarrer la conversation
              </p>
            ) : (
              transcript.map((msg, index) => (
                <div 
                  key={index} 
                  className={cn(
                    "text-sm p-2 rounded-lg",
                    msg.role === 'agent' 
                      ? "bg-primary/10 text-foreground" 
                      : "bg-muted text-foreground ml-auto max-w-[80%]"
                  )}
                >
                  <span className="font-medium">
                    {msg.role === 'agent' ? agent.name : 'Vous'}:
                  </span>{' '}
                  {msg.text}
                </div>
              ))
            )}
          </div>

          {/* Voice visualization when speaking */}
          {isConnected && (
            <div className="h-12 flex items-center justify-center gap-1 bg-muted/20 border-t border-border">
              {[...Array(5)].map((_, i) => (
                <div
                  key={i}
                  className={cn(
                    "w-1 rounded-full transition-all duration-150",
                    isSpeaking 
                      ? "bg-primary animate-pulse" 
                      : "bg-muted-foreground/30"
                  )}
                  style={{
                    height: isSpeaking ? `${Math.random() * 24 + 8}px` : '8px',
                    animationDelay: `${i * 100}ms`,
                  }}
                />
              ))}
            </div>
          )}

          {/* Controls */}
          <div className="p-6 flex justify-center gap-4">
            {!isConnected ? (
              <Button
                size="lg"
                className="w-16 h-16 rounded-full"
                style={{ backgroundColor: primaryColor }}
                onClick={handleStartConversation}
                disabled={isConnecting}
              >
                {isConnecting ? (
                  <Loader2 className="h-8 w-8 animate-spin" />
                ) : (
                  <Mic className="h-8 w-8" />
                )}
              </Button>
            ) : (
              <>
                <Button
                  size="lg"
                  variant="outline"
                  className="w-14 h-14 rounded-full"
                  onClick={handleManualHandoff}
                  disabled={handoffRequested}
                  title="Parler à un humain"
                >
                  <UserRound className="h-6 w-6" />
                </Button>
                <Button
                  size="lg"
                  variant="destructive"
                  className="w-16 h-16 rounded-full"
                  onClick={handleEndConversation}
                >
                  <MicOff className="h-8 w-8" />
                </Button>
              </>
            )}
          </div>

          {/* Handoff hint */}
          {isConnected && !handoffRequested && (
            <div className="px-6 pb-4 text-center">
              <p className="text-xs text-muted-foreground">
                Dites "parler à un humain" ou cliquez sur l'icône pour être transféré
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <p className="mt-6 text-xs text-muted-foreground">
          Propulsé par AVA Statistics
        </p>
      </main>
    </div>
  );
};

export default WidgetPrototype;
