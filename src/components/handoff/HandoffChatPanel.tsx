import { useState, useRef, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Send, CheckCircle, User, Bot, Clock, FileText } from 'lucide-react';
import { HandoffRequest, useHandoffs } from '@/hooks/useHandoffs';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

interface HandoffChatPanelProps {
  handoff: HandoffRequest;
  onComplete: () => void;
}

export function HandoffChatPanel({ handoff, onComplete }: HandoffChatPanelProps) {
  const [message, setMessage] = useState('');
  const { sendMessage } = useHandoffs();
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [handoff.chat_messages]);

  const handleSend = async () => {
    if (!message.trim()) return;

    await sendMessage.mutateAsync({
      handoffId: handoff.id,
      message: message.trim()
    });
    setMessage('');
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <Card className="glass-card h-[600px] flex flex-col">
      <CardHeader className="border-b border-border/50 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-full bg-primary/10">
              <User className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-lg">
                {handoff.customer_info?.name || 'Client'}
              </CardTitle>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                {handoff.customer_info?.email && (
                  <span>{handoff.customer_info.email}</span>
                )}
                {handoff.customer_info?.phone && (
                  <span>• {handoff.customer_info.phone}</span>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline">
              <Clock className="mr-1 h-3 w-3" />
              {format(new Date(handoff.requested_at), 'HH:mm', { locale: fr })}
            </Badge>
            {handoff.status === 'accepted' && (
              <Button size="sm" onClick={onComplete}>
                <CheckCircle className="mr-2 h-4 w-4" />
                Terminer
              </Button>
            )}
          </div>
        </div>
      </CardHeader>

      {/* Transcript snapshot */}
      {handoff.transcript_snapshot && (
        <div className="px-4 py-2 bg-muted/30 border-b border-border/50">
          <details className="text-sm">
            <summary className="cursor-pointer flex items-center gap-2 text-muted-foreground">
              <FileText className="h-4 w-4" />
              Voir le contexte IA
            </summary>
            <div className="mt-2 p-3 bg-background/50 rounded-lg text-xs max-h-[100px] overflow-y-auto">
              {handoff.transcript_snapshot}
            </div>
          </details>
        </div>
      )}

      {/* Messages */}
      <ScrollArea className="flex-1 p-4" ref={scrollRef}>
        <div className="space-y-4">
          {(!handoff.chat_messages || handoff.chat_messages.length === 0) && (
            <div className="text-center py-8">
              <Bot className="h-12 w-12 mx-auto text-muted-foreground mb-2" />
              <p className="text-muted-foreground">
                Commencez la conversation avec le client
              </p>
            </div>
          )}

          {handoff.chat_messages?.map((msg, index) => (
            <div
              key={index}
              className={`flex ${msg.role === 'agent' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[80%] rounded-2xl px-4 py-2 ${
                  msg.role === 'agent'
                    ? 'bg-primary text-primary-foreground rounded-br-md'
                    : 'bg-muted rounded-bl-md'
                }`}
              >
                <p className="text-sm">{msg.content}</p>
                <p className={`text-xs mt-1 ${
                  msg.role === 'agent' ? 'text-primary-foreground/70' : 'text-muted-foreground'
                }`}>
                  {format(new Date(msg.timestamp), 'HH:mm', { locale: fr })}
                </p>
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>

      {/* Input */}
      {handoff.status === 'accepted' && (
        <div className="p-4 border-t border-border/50">
          <div className="flex gap-2">
            <Input
              placeholder="Écrivez votre message..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={handleKeyPress}
              className="flex-1"
            />
            <Button onClick={handleSend} disabled={!message.trim() || sendMessage.isPending}>
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {handoff.status === 'completed' && (
        <div className="p-4 border-t border-border/50 bg-green-500/10">
          <p className="text-center text-sm text-green-600 flex items-center justify-center gap-2">
            <CheckCircle className="h-4 w-4" />
            Cette conversation est terminée
          </p>
        </div>
      )}
    </Card>
  );
}
