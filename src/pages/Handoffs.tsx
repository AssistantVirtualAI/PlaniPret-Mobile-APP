import { useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Users, Clock, CheckCircle, XCircle, MessageSquare, Phone, AlertCircle } from 'lucide-react';
import { useHandoffs } from '@/hooks/useHandoffs';
import { useTranslation } from '@/hooks/useTranslation';
import { HandoffRequestCard } from '@/components/handoff/HandoffRequestCard';
import { HandoffChatPanel } from '@/components/handoff/HandoffChatPanel';
import { TableSkeleton } from '@/components/LoadingSkeleton';

export default function Handoffs() {
  const { t } = useTranslation();
  const { handoffs, stats, isLoading, acceptHandoff, rejectHandoff, completeHandoff, isAvailable, setAvailability } = useHandoffs();
  const [selectedHandoff, setSelectedHandoff] = useState<string | null>(null);

  const pendingHandoffs = handoffs.filter(h => h.status === 'pending');
  const activeHandoffs = handoffs.filter(h => h.status === 'accepted');
  const completedHandoffs = handoffs.filter(h => h.status === 'completed' || h.status === 'rejected');

  const selectedHandoffData = handoffs.find(h => h.id === selectedHandoff);

  if (isLoading) {
    return (
      <AppLayout>
        <div className="p-6 space-y-6">
          <h1 className="text-3xl font-bold">{t('handoffs.title')}</h1>
          <TableSkeleton rows={5} />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">{t('handoffs.title')}</h1>
            <p className="text-muted-foreground mt-1">
              {t('handoffs.description')}
            </p>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Switch
                id="availability"
                checked={isAvailable}
                onCheckedChange={setAvailability}
              />
              <Label htmlFor="availability">
                {isAvailable ? t('handoffs.available') : t('handoffs.unavailable')}
              </Label>
            </div>
            {pendingHandoffs.length > 0 && (
              <Badge variant="destructive" className="animate-pulse">
                {pendingHandoffs.length} {t('handoffs.pending')}
              </Badge>
            )}
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="glass-card">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-yellow-500/10 text-yellow-500">
                  <Clock className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{stats.pending}</p>
                  <p className="text-xs text-muted-foreground">{t('handoffs.stats.pending')}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="glass-card">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-blue-500/10 text-blue-500">
                  <MessageSquare className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{stats.active}</p>
                  <p className="text-xs text-muted-foreground">{t('handoffs.stats.active')}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="glass-card">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-green-500/10 text-green-500">
                  <CheckCircle className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{stats.completed}</p>
                  <p className="text-xs text-muted-foreground">{t('handoffs.stats.completed')}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="glass-card">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-purple-500/10 text-purple-500">
                  <Clock className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{stats.avgResponseTime}s</p>
                  <p className="text-xs text-muted-foreground">{t('handoffs.stats.avgTime')}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left panel - Requests list */}
          <div className="lg:col-span-1 space-y-4">
            <Tabs defaultValue="pending">
              <TabsList className="w-full">
                <TabsTrigger value="pending" className="flex-1">
                  {t('handoffs.tabs.pending')} ({pendingHandoffs.length})
                </TabsTrigger>
                <TabsTrigger value="active" className="flex-1">
                  {t('handoffs.tabs.active')} ({activeHandoffs.length})
                </TabsTrigger>
              </TabsList>
              <TabsContent value="pending" className="space-y-3 mt-4">
                {pendingHandoffs.length === 0 ? (
                  <Card className="glass-card">
                    <CardContent className="p-6 text-center">
                      <CheckCircle className="h-10 w-10 mx-auto text-muted-foreground mb-2" />
                      <p className="text-muted-foreground">{t('handoffs.empty.noPending')}</p>
                    </CardContent>
                  </Card>
                ) : (
                  pendingHandoffs.map(handoff => (
                    <HandoffRequestCard
                      key={handoff.id}
                      handoff={handoff}
                      onAccept={() => {
                        acceptHandoff.mutate(handoff.id);
                        setSelectedHandoff(handoff.id);
                      }}
                      onReject={() => rejectHandoff.mutate(handoff.id)}
                      isSelected={selectedHandoff === handoff.id}
                      onClick={() => setSelectedHandoff(handoff.id)}
                    />
                  ))
                )}
              </TabsContent>
              <TabsContent value="active" className="space-y-3 mt-4">
                {activeHandoffs.length === 0 ? (
                  <Card className="glass-card">
                    <CardContent className="p-6 text-center">
                      <Users className="h-10 w-10 mx-auto text-muted-foreground mb-2" />
                      <p className="text-muted-foreground">{t('handoffs.empty.noActive')}</p>
                    </CardContent>
                  </Card>
                ) : (
                  activeHandoffs.map(handoff => (
                    <HandoffRequestCard
                      key={handoff.id}
                      handoff={handoff}
                      isActive
                      isSelected={selectedHandoff === handoff.id}
                      onClick={() => setSelectedHandoff(handoff.id)}
                    />
                  ))
                )}
              </TabsContent>
            </Tabs>
          </div>

          {/* Right panel - Chat */}
          <div className="lg:col-span-2">
            {selectedHandoffData ? (
              <HandoffChatPanel
                handoff={selectedHandoffData}
                onComplete={() => {
                  completeHandoff.mutate(selectedHandoffData.id);
                  setSelectedHandoff(null);
                }}
              />
            ) : (
              <Card className="glass-card h-[600px] flex items-center justify-center">
                <CardContent className="text-center">
                  <MessageSquare className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
                  <h3 className="text-lg font-medium mb-2">{t('handoffs.selectConversation')}</h3>
                  <p className="text-muted-foreground">
                    {t('handoffs.selectToChat')}
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
