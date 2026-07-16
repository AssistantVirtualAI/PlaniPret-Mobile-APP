import { Calendar, Check, Loader2, X } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useCalendarIntegration } from '@/hooks/useCalendarIntegration';

export const CalendarIntegrationCard = () => {
  const { integration, isLoading, isConnected, connectGoogle, disconnect } = useCalendarIntegration();

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center p-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Calendar className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-lg">Google Calendar</CardTitle>
              <CardDescription>
                Synchronisez les rendez-vous avec votre calendrier
              </CardDescription>
            </div>
          </div>
          {isConnected ? (
            <Badge variant="default" className="gap-1">
              <Check className="h-3 w-3" />
              Connecté
            </Badge>
          ) : (
            <Badge variant="secondary">Non configuré</Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {isConnected ? (
          <div className="space-y-4">
            <div className="p-3 rounded-lg bg-muted/50">
              <p className="text-sm text-muted-foreground">
                Calendrier ID: <span className="font-mono">{integration?.calendar_id || 'primary'}</span>
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Dernière mise à jour: {new Date(integration?.updated_at).toLocaleDateString('fr-FR')}
              </p>
            </div>
            <Button 
              variant="destructive" 
              size="sm"
              onClick={() => disconnect.mutate()}
              disabled={disconnect.isPending}
            >
              {disconnect.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <X className="h-4 w-4 mr-2" />
              )}
              Déconnecter
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Connectez votre Google Calendar pour permettre aux agents de réserver des rendez-vous directement dans votre calendrier.
            </p>
            <Button 
              onClick={() => connectGoogle.mutate()}
              disabled={connectGoogle.isPending}
            >
              {connectGoogle.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Calendar className="h-4 w-4 mr-2" />
              )}
              Connecter Google Calendar
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
