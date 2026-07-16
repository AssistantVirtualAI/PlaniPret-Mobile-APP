import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useClient } from '@/context/ClientContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Search, MessageSquare, Clock, ThumbsUp, ThumbsDown, Minus, ChevronLeft, ChevronRight } from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { fr } from 'date-fns/locale';

const ClientConversations = () => {
  const { session } = useClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [selectedConversation, setSelectedConversation] = useState<any>(null);
  const pageSize = 10;

  const { data, isLoading } = useQuery({
    queryKey: ['client-conversations', session?.clientId, page, search],
    queryFn: async () => {
      if (!session?.clientId) return { data: [], count: 0 };

      let query = supabase
        .from('conversations')
        .select('*', { count: 'exact' })
        .eq('client_id', session.clientId)
        .order('created_at', { ascending: false });

      if (search) {
        query = query.ilike('title', `%${search}%`);
      }

      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;
      query = query.range(from, to);

      const { data, count, error } = await query;
      if (error) throw error;

      return { data: data || [], count: count || 0 };
    },
    enabled: !!session?.clientId,
  });

  const totalPages = Math.ceil((data?.count || 0) / pageSize);

  const getSentimentIcon = (sentiment: string | null) => {
    switch (sentiment) {
      case 'positive':
        return <ThumbsUp className="h-4 w-4 text-green-500" />;
      case 'negative':
        return <ThumbsDown className="h-4 w-4 text-red-500" />;
      default:
        return <Minus className="h-4 w-4 text-gray-500" />;
    }
  };

  const formatDuration = (seconds: number | null) => {
    if (!seconds) return '-';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Mes Conversations</h1>
        <p className="text-muted-foreground">
          {data?.count || 0} conversation{(data?.count || 0) > 1 ? 's' : ''}
        </p>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Rechercher une conversation..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          className="pl-10"
        />
      </div>

      {/* Conversations List */}
      <Card className="bg-card/50 backdrop-blur-sm border-border/50">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-4 p-6">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-20 bg-muted/50 animate-pulse rounded-lg" />
              ))}
            </div>
          ) : data?.data.length === 0 ? (
            <div className="text-center py-12">
              <MessageSquare className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">Aucune conversation trouvée</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {data?.data.map((conversation) => (
                <div
                  key={conversation.id}
                  className="p-4 hover:bg-muted/50 cursor-pointer transition-colors"
                  onClick={() => setSelectedConversation(conversation)}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium text-foreground truncate">
                        {conversation.title}
                      </h3>
                      <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {formatDuration(conversation.duration)}
                        </span>
                        <span>
                          {formatDistanceToNow(new Date(conversation.created_at), {
                            addSuffix: true,
                            locale: fr,
                          })}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {getSentimentIcon(conversation.sentiment)}
                      {conversation.satisfaction_score && (
                        <Badge variant="outline">
                          {conversation.satisfaction_score}/5
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
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
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}

      {/* Conversation Detail Modal */}
      <Dialog open={!!selectedConversation} onOpenChange={() => setSelectedConversation(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{selectedConversation?.title}</DialogTitle>
          </DialogHeader>
          {selectedConversation && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Durée</p>
                  <p className="font-medium">{formatDuration(selectedConversation.duration)}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Satisfaction</p>
                  <p className="font-medium">{selectedConversation.satisfaction_score || '-'}/5</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Date</p>
                  <p className="font-medium">
                    {format(new Date(selectedConversation.created_at), 'dd MMMM yyyy HH:mm', { locale: fr })}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Sentiment</p>
                  <div className="flex items-center gap-2">
                    {getSentimentIcon(selectedConversation.sentiment)}
                    <span className="capitalize">{selectedConversation.sentiment || 'Neutre'}</span>
                  </div>
                </div>
              </div>

              {selectedConversation.transcript && (
                <div>
                  <p className="text-sm text-muted-foreground mb-2">Transcription</p>
                  <div className="bg-muted/50 p-4 rounded-lg whitespace-pre-wrap text-sm">
                    {selectedConversation.transcript}
                  </div>
                </div>
              )}

              {selectedConversation.keywords && selectedConversation.keywords.length > 0 && (
                <div>
                  <p className="text-sm text-muted-foreground mb-2">Mots-clés</p>
                  <div className="flex flex-wrap gap-2">
                    {selectedConversation.keywords.map((kw: string, i: number) => (
                      <Badge key={i} variant="secondary">{kw}</Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ClientConversations;
