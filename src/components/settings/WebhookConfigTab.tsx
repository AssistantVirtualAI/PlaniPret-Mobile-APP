import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useWebhookEndpoints, WEBHOOK_EVENT_TYPES } from '@/hooks/useWebhookEndpoints';
import { Plus, Trash2, Copy, RefreshCw, Eye, EyeOff, CheckCircle, XCircle, Clock } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';

const EVENT_LABELS: Record<string, string> = {
  'conversation.created': 'Conversation créée',
  'conversation.completed': 'Conversation terminée',
  'agent.created': 'Agent créé',
  'agent.updated': 'Agent mis à jour',
  'client.created': 'Client créé',
  'subscription.updated': 'Abonnement mis à jour',
};

export const WebhookConfigTab = () => {
  const { 
    endpoints, 
    deliveryLogs,
    isLoading, 
    createEndpoint, 
    updateEndpoint, 
    deleteEndpoint,
    regenerateSecret 
  } = useWebhookEndpoints();

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [newUrl, setNewUrl] = useState('');
  const [selectedEvents, setSelectedEvents] = useState<string[]>([]);
  const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({});

  const handleCreate = async () => {
    if (!newUrl) {
      toast.error('Veuillez entrer une URL');
      return;
    }
    
    try {
      new URL(newUrl);
    } catch {
      toast.error('URL invalide');
      return;
    }

    await createEndpoint.mutateAsync({ url: newUrl, events: selectedEvents });
    setNewUrl('');
    setSelectedEvents([]);
    setIsDialogOpen(false);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Copié !');
  };

  const toggleEvent = (event: string) => {
    setSelectedEvents(prev => 
      prev.includes(event) 
        ? prev.filter(e => e !== event)
        : [...prev, event]
    );
  };

  const getStatusIcon = (status: number | null) => {
    if (!status) return <Clock className="h-4 w-4 text-muted-foreground" />;
    if (status >= 200 && status < 300) return <CheckCircle className="h-4 w-4 text-green-500" />;
    return <XCircle className="h-4 w-4 text-destructive" />;
  };

  return (
    <div className="space-y-6">
      <Tabs defaultValue="endpoints">
        <TabsList>
          <TabsTrigger value="endpoints">Webhooks</TabsTrigger>
          <TabsTrigger value="logs">Logs de livraison</TabsTrigger>
        </TabsList>

        <TabsContent value="endpoints" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Webhooks</CardTitle>
                <CardDescription>Configurez vos webhooks sortants</CardDescription>
              </div>
              <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogTrigger asChild>
                  <Button>
                    <Plus className="h-4 w-4 mr-2" />
                    Ajouter un endpoint
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-lg">
                  <DialogHeader>
                    <DialogTitle>Ajouter un endpoint</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label>URL</Label>
                      <Input
                        value={newUrl}
                        onChange={(e) => setNewUrl(e.target.value)}
                        placeholder="https://your-server.com/webhook"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Événements</Label>
                      <div className="grid grid-cols-2 gap-2">
                        {WEBHOOK_EVENT_TYPES.map((event) => (
                          <div key={event} className="flex items-center space-x-2">
                            <Checkbox
                              id={event}
                              checked={selectedEvents.includes(event)}
                              onCheckedChange={() => toggleEvent(event)}
                            />
                            <label htmlFor={event} className="text-sm cursor-pointer">
                              {EVENT_LABELS[event] || event}
                            </label>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                      Annuler
                    </Button>
                    <Button onClick={handleCreate} disabled={createEndpoint.isPending}>
                      Créer
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="text-center py-8 text-muted-foreground">Chargement...</div>
              ) : endpoints.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">Aucun endpoint configuré</div>
              ) : (
                <div className="space-y-4">
                  {endpoints.map((endpoint) => (
                    <Card key={endpoint.id} className="bg-muted/30">
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 space-y-2">
                            <div className="flex items-center gap-2">
                              <code className="text-sm bg-background px-2 py-1 rounded">
                                {endpoint.url}
                              </code>
                              <Switch
                                checked={endpoint.is_active}
                                onCheckedChange={(checked) => 
                                  updateEndpoint.mutate({ id: endpoint.id, is_active: checked })
                                }
                              />
                              <Badge variant={endpoint.is_active ? 'default' : 'secondary'}>
                                {endpoint.is_active ? 'Actif' : 'Inactif'}
                              </Badge>
                            </div>
                            
                            <div className="flex items-center gap-2">
                              <span className="text-sm text-muted-foreground">Secret:</span>
                              <code className="text-xs bg-background px-2 py-1 rounded font-mono">
                                {showSecrets[endpoint.id] ? endpoint.secret : '••••••••••••••••'}
                              </code>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6"
                                onClick={() => setShowSecrets(prev => ({ ...prev, [endpoint.id]: !prev[endpoint.id] }))}
                              >
                                {showSecrets[endpoint.id] ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6"
                                onClick={() => copyToClipboard(endpoint.secret)}
                              >
                                <Copy className="h-3 w-3" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6"
                                onClick={() => regenerateSecret.mutate(endpoint.id)}
                              >
                                <RefreshCw className="h-3 w-3" />
                              </Button>
                            </div>

                            <div className="flex flex-wrap gap-1">
                              {endpoint.events.map((event) => (
                                <Badge key={event} variant="outline" className="text-xs">
                                  {EVENT_LABELS[event] || event}
                                </Badge>
                              ))}
                            </div>
                          </div>
                          
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-destructive hover:text-destructive"
                            onClick={() => deleteEndpoint.mutate(endpoint.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="logs">
          <Card>
            <CardHeader>
              <CardTitle>Logs de livraison</CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[500px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Statut</TableHead>
                      <TableHead>Événement</TableHead>
                      <TableHead>Tentatives</TableHead>
                      <TableHead>Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {deliveryLogs.map((log) => (
                      <TableRow key={log.id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {getStatusIcon(log.response_status)}
                            {log.response_status || '-'}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{EVENT_LABELS[log.event_type] || log.event_type}</Badge>
                        </TableCell>
                        <TableCell>{log.attempt_count}/3</TableCell>
                        <TableCell className="text-muted-foreground">
                          {format(new Date(log.created_at), 'dd/MM/yyyy HH:mm')}
                        </TableCell>
                      </TableRow>
                    ))}
                    {deliveryLogs.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center text-muted-foreground">
                          Aucun log disponible
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};
