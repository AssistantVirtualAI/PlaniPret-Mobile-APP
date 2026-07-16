import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { useConversation } from '@11labs/react';
import { supabase } from '@/integrations/supabase/client';
import { Mic, MicOff, Volume2, Loader2, X, Minimize2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface AgentData {
  id: string;
  name: string;
  description: string | null;
  avatar_url: string | null;
  platform_agent_id: string | null;
  platform: string;
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
}

const WidgetIframe = () => {
  const { agentId } = useParams<{ agentId: string }>();
  const [agent, setAgent] = useState<AgentData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<TranscriptMessage[]>([]);
  const [isMinimized, setIsMinimized] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);

  // ElevenLabs useConversation hook
  const conversation = useConversation({
    onConnect: () => {
      console.log('Connected to ElevenLabs');
      setIsConnecting(false);
      window.parent.postMessage({ type: 'widget-connected' }, '*');
    },
    onDisconnect: () => {
      console.log('Disconnected from ElevenLabs');
      window.parent.postMessage({ type: 'widget-disconnected' }, '*');
    },
    onMessage: (message) => {
      console.log('Message received:', message);
      if (message.message) {
        const role = message.source === 'ai' ? 'agent' : 'user';
        setTranscript(prev => [...prev, { role, text: message.message }]);
      }
    },
    onError: (error) => {
      console.error('Conversation error:', error);
      const errorMessage = typeof error === 'string' ? error : (error as any)?.message || 'Inconnue';
      setError('Erreur: ' + errorMessage);
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
        .select('id, name, description, avatar_url, platform_agent_id, platform, theme_config')
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

  // Send status updates to parent
  const isConnected = conversation.status === 'connected';
  const isSpeaking = conversation.isSpeaking;

  useEffect(() => {
    window.parent.postMessage({ 
      type: 'widget-status', 
      status: isConnected ? (isSpeaking ? 'speaking' : 'listening') : 'idle',
      isConnected 
    }, '*');
  }, [isConnected, isSpeaking]);

  const handleStartConversation = useCallback(async () => {
    if (!agent) return;

    if (agent.platform !== 'elevenlabs') {
      setError('Agent non configuré avec ElevenLabs');
      return;
    }

    if (!agent.platform_agent_id) {
      setError('Agent ID ElevenLabs manquant');
      return;
    }

    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
      
      setIsConnecting(true);
      setError(null);
      
      const { data, error: urlError } = await supabase.functions.invoke('elevenlabs-signed-url', {
        body: { agentId: agent.id }
      });

      if (urlError || !data?.signedUrl) {
        throw new Error(urlError?.message || 'URL de connexion non disponible');
      }

      await conversation.startSession({
        signedUrl: data.signedUrl,
      });

    } catch (err: any) {
      console.error('Error starting conversation:', err);
      setError(err.message || 'Erreur de connexion');
      setIsConnecting(false);
    }
  }, [agent, conversation]);

  const handleEndConversation = useCallback(async () => {
    try {
      await conversation.endSession();
      
      // Save transcript to database (only if user is authenticated)
      if (agent && transcript.length > 0) {
        const transcriptText = transcript.map(m => `${m.role === 'agent' ? agent.name : 'User'}: ${m.text}`).join('\n');
        const userMessages = transcript.filter(m => m.role === 'user').map(m => ({ text: m.text }));
        const agentMessages = transcript.filter(m => m.role === 'agent').map(m => ({ text: m.text }));
        
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
              user_id: userData.user.id,
            }]);
          
          if (saveError) {
            console.error('Error saving conversation:', saveError);
          } else {
            console.log('Conversation saved successfully');
          }
        }
      }
    } catch (err) {
      console.error('Error ending conversation:', err);
    }
  }, [conversation, agent, transcript]);

  const handleClose = () => {
    if (isConnected) {
      handleEndConversation();
    }
    window.parent.postMessage({ type: 'widget-close' }, '*');
  };

  const handleMinimize = () => {
    setIsMinimized(true);
    window.parent.postMessage({ type: 'widget-minimize' }, '*');
  };

  const themeConfig = agent?.theme_config || {};
  const primaryColor = themeConfig.primaryColor || '#8B5CF6';

  // Get status display
  const getStatusText = () => {
    if (isConnecting) return 'Connexion...';
    if (!isConnected) return 'En ligne';
    if (isSpeaking) return 'Parle...';
    return 'Écoute...';
  };

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-card">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (error && !agent) {
    return (
      <div className="h-screen flex items-center justify-center bg-card p-4">
        <p className="text-sm text-destructive text-center">{error}</p>
      </div>
    );
  }

  if (!agent) return null;

  if (isMinimized) {
    return (
      <button
        onClick={() => setIsMinimized(false)}
        className={cn(
          "w-14 h-14 rounded-full shadow-lg flex items-center justify-center transition-transform hover:scale-110",
          isConnected && "ring-2 ring-green-400 ring-offset-2"
        )}
        style={{ backgroundColor: primaryColor }}
      >
        {agent.avatar_url ? (
          <img src={agent.avatar_url} alt={agent.name} className="w-full h-full rounded-full object-cover" />
        ) : (
          <Volume2 className="h-6 w-6 text-white" />
        )}
      </button>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-card overflow-hidden">
      {/* Header */}
      <div 
        className="p-3 flex items-center gap-3 text-white shrink-0"
        style={{ backgroundColor: primaryColor }}
      >
        {agent.avatar_url ? (
          <img 
            src={agent.avatar_url} 
            alt={agent.name}
            className={cn(
              "w-10 h-10 rounded-full border-2 border-white/30 object-cover",
              isSpeaking && "ring-2 ring-white animate-pulse"
            )}
          />
        ) : (
          <div className={cn(
            "w-10 h-10 rounded-full border-2 border-white/30 bg-white/20 flex items-center justify-center",
            isSpeaking && "ring-2 ring-white animate-pulse"
          )}>
            <Volume2 className="h-5 w-5" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm truncate">{agent.name}</p>
          <div className="flex items-center gap-1">
            <div className={cn(
              "w-2 h-2 rounded-full",
              !isConnected && !isConnecting && "bg-white/50",
              isConnecting && "bg-yellow-400 animate-pulse",
              isConnected && !isSpeaking && "bg-green-400 animate-pulse",
              isSpeaking && "bg-white animate-pulse"
            )} />
            <span className="text-xs opacity-80">{getStatusText()}</span>
          </div>
        </div>
        <button 
          onClick={handleMinimize}
          className="p-1 hover:bg-white/20 rounded transition-colors"
        >
          <Minimize2 className="h-4 w-4" />
        </button>
        <button 
          onClick={handleClose}
          className="p-1 hover:bg-white/20 rounded transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Error display */}
      {error && (
        <div className="p-2 bg-destructive/10 text-destructive text-xs text-center">
          {error}
        </div>
      )}

      {/* Voice visualization */}
      {isConnected && (
        <div className="h-8 flex items-center justify-center gap-1 bg-muted/30 border-b border-border">
          {[...Array(7)].map((_, i) => (
            <div
              key={i}
              className={cn(
                "w-1 rounded-full transition-all duration-100",
                isSpeaking ? "bg-primary" : "bg-muted-foreground/30"
              )}
              style={{
                height: isSpeaking ? `${Math.random() * 16 + 4}px` : '4px',
              }}
            />
          ))}
        </div>
      )}

      {/* Transcript */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2 bg-muted/20">
        {transcript.length === 0 ? (
          <div className="h-full flex items-center justify-center">
            <p className="text-xs text-muted-foreground text-center px-4">
              Appuyez sur le microphone pour démarrer
            </p>
          </div>
        ) : (
          transcript.map((msg, index) => (
            <div 
              key={index} 
              className={cn(
                "text-xs p-2 rounded-lg max-w-[85%]",
                msg.role === 'agent' 
                  ? "bg-muted text-foreground" 
                  : "bg-primary/10 text-foreground ml-auto"
              )}
            >
              {msg.text}
            </div>
          ))
        )}
      </div>

      {/* Controls */}
      <div className="p-3 border-t border-border flex justify-center shrink-0">
        {!isConnected ? (
          <Button
            size="sm"
            className="w-12 h-12 rounded-full"
            style={{ backgroundColor: primaryColor }}
            onClick={handleStartConversation}
            disabled={isConnecting}
          >
            {isConnecting ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <Mic className="h-5 w-5" />
            )}
          </Button>
        ) : (
          <Button
            size="sm"
            variant="destructive"
            className="w-12 h-12 rounded-full"
            onClick={handleEndConversation}
          >
            <MicOff className="h-5 w-5" />
          </Button>
        )}
      </div>
    </div>
  );
};

export default WidgetIframe;
