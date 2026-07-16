import { useMemo, useState } from 'react';
import { useClientPlatformConversations } from '@/hooks/useClientPlatformData';
import type { Platform } from '@/hooks/useClientAgentAccess';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, MessageSquare, RefreshCw, Search, Clock, AlertCircle } from 'lucide-react';
import { format } from 'date-fns';
import { enUS, fr } from 'date-fns/locale';
import { useTranslation } from '@/hooks/useTranslation';

type Props = {
  platform: Platform;
  apiKey: string | null;
  platformAgentId: string | null;
  organizationId: string | null;
  agentName: string | null;
};

export function ClientPlatformConversations({
  platform,
  apiKey,
  platformAgentId,
  organizationId,
  agentName,
}: Props) {
  const { t, language } = useTranslation();
  const [searchTerm, setSearchTerm] = useState('');

  const { data, isLoading, error, refetch } = useClientPlatformConversations(
    {
      apiKey,
      agentId: platformAgentId,
      platform,
      organizationId,
      enabled: true,
    },
    1,
    500
  );

  const conversations = data?.conversations || [];

  const filtered = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return conversations;
    return conversations.filter((c) => c.conversation_id.toLowerCase().includes(q));
  }, [conversations, searchTerm]);

  const dateLocale = language === 'fr' ? fr : enUS;

  const formatTimestamp = (unixSecs: number | undefined) => {
    if (!unixSecs || isNaN(unixSecs)) return t('common.unknownDate');
    try {
      const d = new Date(unixSecs * 1000);
      if (isNaN(d.getTime())) return t('common.unknownDate');
      return format(d, 'PPp', { locale: dateLocale });
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Conversations</h1>
        <p className="text-muted-foreground">
          {agentName ? `Historique des appels de ${agentName}` : 'Historique des appels'}
        </p>
      </div>

      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={t('common.search')}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        <Button variant="outline" onClick={() => refetch()}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Actualiser
        </Button>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      )}

      {error && (
        <Card>
          <CardContent className="py-6 text-sm text-muted-foreground">
            Impossible de charger les conversations. Vérifiez l'intégration et réessayez.
          </CardContent>
        </Card>
      )}

      {!isLoading && !error && filtered.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <AlertCircle className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">{t('clientPortal.conversations.noConversations')}</h3>
          </CardContent>
        </Card>
      )}

      {!isLoading && !error && filtered.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5" />
              {filtered.length} conversation{filtered.length !== 1 ? 's' : ''}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[600px] pr-4">
              <div className="space-y-3">
                {filtered.map((conv) => (
                  <div
                    key={conv.conversation_id}
                    className="flex items-center justify-between p-4 rounded-lg border"
                  >
                    <div>
                      <p className="font-medium">{conv.conversation_id.slice(0, 12)}…</p>
                      <p className="text-sm text-muted-foreground">
                        {formatTimestamp(conv.start_time_unix_secs)}
                      </p>
                    </div>
                    <div className="text-right text-sm text-muted-foreground">
                      <div className="flex items-center justify-end gap-2">
                        <Clock className="h-4 w-4" />
                        {formatDuration(conv.call_duration_secs)}
                      </div>
                      <div className="text-xs capitalize">{conv.status}</div>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
