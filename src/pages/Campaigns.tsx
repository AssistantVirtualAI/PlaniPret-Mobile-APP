import { useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useOutboundCampaigns, useCampaignCalls } from '@/hooks/useOutboundCampaigns';
import { useFeatureAccess } from '@/hooks/useFeatureAccess';
import { FeatureGate } from '@/components/billing/FeatureGate';
import { Plus, Play, Pause, StopCircle, Phone, Users, Clock, CheckCircle, XCircle, RefreshCw, Trash2, Eye } from 'lucide-react';
import { format } from 'date-fns';
import { fr, enUS } from 'date-fns/locale';
import { useTranslation } from '@/hooks/useTranslation';

const getStatusConfig = (t: (key: string) => string): Record<string, { label: string; color: string; icon: React.ElementType }> => ({
  draft: { label: t('common.pending'), color: 'bg-muted text-muted-foreground', icon: Clock },
  scheduled: { label: t('common.pending'), color: 'bg-blue-500/20 text-blue-500', icon: Clock },
  running: { label: t('common.active'), color: 'bg-emerald-500/20 text-emerald-500', icon: Play },
  paused: { label: t('common.pending'), color: 'bg-yellow-500/20 text-yellow-500', icon: Pause },
  completed: { label: t('common.success'), color: 'bg-primary/20 text-primary', icon: CheckCircle },
  cancelled: { label: t('common.error'), color: 'bg-destructive/20 text-destructive', icon: XCircle },
});

const Campaigns = () => {
  const { t, language } = useTranslation();
  const { campaigns, isLoading, createCampaign, controlCampaign, deleteCampaign, refetch } = useOutboundCampaigns();
  const { canAccessFeature } = useFeatureAccess();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [selectedCampaign, setSelectedCampaign] = useState<string | null>(null);
  const [newCampaign, setNewCampaign] = useState({
    name: '',
    description: '',
    phone_numbers: '',
  });
  const STATUS_CONFIG = getStatusConfig(t);
  const dateLocale = language === 'fr' ? fr : enUS;

  const { data: campaignCalls } = useCampaignCalls(selectedCampaign);

  const handleCreate = async () => {
    const phoneNumbers = newCampaign.phone_numbers
      .split('\n')
      .map(p => p.trim())
      .filter(p => p.length > 0);

    if (!newCampaign.name || phoneNumbers.length === 0) {
      return;
    }

    await createCampaign.mutateAsync({
      name: newCampaign.name,
      description: newCampaign.description || undefined,
      phone_numbers: phoneNumbers,
    });

    setNewCampaign({ name: '', description: '', phone_numbers: '' });
    setIsCreateOpen(false);
  };

  const getProgressPercent = (campaign: typeof campaigns[0]) => {
    if (campaign.total_calls === 0) return 0;
    return Math.round((campaign.completed_calls / campaign.total_calls) * 100);
  };

  if (!canAccessFeature('outbound_campaigns')) {
    return (
      <AppLayout>
        <div className="container mx-auto px-6 py-8">
          <FeatureGate feature="outbound_campaigns">
            <div />
          </FeatureGate>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="container mx-auto px-6 py-8 space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-foreground">{t('campaigns.title')}</h1>
            <p className="text-muted-foreground mt-1">
              {t('campaigns.description')}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              disabled={isLoading}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
              {t('campaigns.refresh')}
            </Button>
            <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="gap-2">
                  <Plus className="h-4 w-4" />
                  {t('campaigns.newCampaign')}
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{t('campaigns.modal.createTitle')}</DialogTitle>
                  <DialogDescription>
                    {t('campaigns.modal.createDesc')}
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>{t('campaigns.modal.campaignName')}</Label>
                    <Input
                      placeholder="Ex: Campagne de relance Q1"
                      value={newCampaign.name}
                      onChange={(e) => setNewCampaign(prev => ({ ...prev, name: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>{t('campaigns.modal.description')}</Label>
                    <Input
                      placeholder={t('campaigns.modal.description')}
                      value={newCampaign.description}
                      onChange={(e) => setNewCampaign(prev => ({ ...prev, description: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>{t('campaigns.modal.phoneNumbers')}</Label>
                    <Textarea
                      placeholder="+33612345678&#10;+33698765432&#10;..."
                      rows={6}
                      value={newCampaign.phone_numbers}
                      onChange={(e) => setNewCampaign(prev => ({ ...prev, phone_numbers: e.target.value }))}
                    />
                    <p className="text-xs text-muted-foreground">
                      {newCampaign.phone_numbers.split('\n').filter(p => p.trim()).length} {t('campaigns.modal.numbersCount')}
                    </p>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
                    {t('common.cancel')}
                  </Button>
                  <Button 
                    onClick={handleCreate}
                    disabled={createCampaign.isPending || !newCampaign.name}
                  >
                    {t('common.create')}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{t('campaigns.stats.activeCampaigns')}</p>
                  <p className="text-3xl font-bold">
                    {campaigns.filter(c => c.status === 'running').length}
                  </p>
                </div>
                <div className="p-3 rounded-lg bg-emerald-500/10">
                  <Play className="h-6 w-6 text-emerald-500" />
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{t('campaigns.stats.totalCalls')}</p>
                  <p className="text-3xl font-bold">
                    {campaigns.reduce((sum, c) => sum + c.total_calls, 0)}
                  </p>
                </div>
                <div className="p-3 rounded-lg bg-primary/10">
                  <Phone className="h-6 w-6 text-primary" />
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{t('campaigns.stats.successfulCalls')}</p>
                  <p className="text-3xl font-bold">
                    {campaigns.reduce((sum, c) => sum + c.successful_calls, 0)}
                  </p>
                </div>
                <div className="p-3 rounded-lg bg-emerald-500/10">
                  <CheckCircle className="h-6 w-6 text-emerald-500" />
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{t('campaigns.stats.successRate')}</p>
                  <p className="text-3xl font-bold">
                    {(() => {
                      const total = campaigns.reduce((sum, c) => sum + c.completed_calls, 0);
                      const success = campaigns.reduce((sum, c) => sum + c.successful_calls, 0);
                      return total > 0 ? Math.round((success / total) * 100) : 0;
                    })()}%
                  </p>
                </div>
                <div className="p-3 rounded-lg bg-primary/10">
                  <Users className="h-6 w-6 text-primary" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Campaigns Table */}
        <Card>
          <CardHeader>
            <CardTitle>{t('campaigns.title')}</CardTitle>
            <CardDescription>{t('campaigns.description')}</CardDescription>
          </CardHeader>
          <CardContent>
            {campaigns.length === 0 ? (
              <div className="text-center py-12">
                <Phone className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="font-semibold text-lg mb-2">{t('campaigns.noCampaigns')}</h3>
                <p className="text-muted-foreground mb-4">
                  {t('campaigns.createFirst')}
                </p>
                <Button onClick={() => setIsCreateOpen(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  {t('campaigns.newCampaign')}
                </Button>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('campaigns.table.campaign')}</TableHead>
                    <TableHead>{t('campaigns.table.status')}</TableHead>
                    <TableHead>{t('campaigns.table.progress')}</TableHead>
                    <TableHead>{t('campaigns.table.calls')}</TableHead>
                    <TableHead>{t('campaigns.table.success')}</TableHead>
                    <TableHead>{t('campaigns.table.createdAt')}</TableHead>
                    <TableHead className="text-right">{t('campaigns.table.actions')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {campaigns.map((campaign) => {
                    const StatusIcon = STATUS_CONFIG[campaign.status]?.icon || Clock;
                    return (
                      <TableRow key={campaign.id}>
                        <TableCell>
                          <div>
                            <p className="font-medium">{campaign.name}</p>
                            {campaign.description && (
                              <p className="text-xs text-muted-foreground">{campaign.description}</p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge className={STATUS_CONFIG[campaign.status]?.color}>
                            <StatusIcon className="h-3 w-3 mr-1" />
                            {STATUS_CONFIG[campaign.status]?.label}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="w-32 space-y-1">
                            <Progress value={getProgressPercent(campaign)} className="h-2" />
                            <p className="text-xs text-muted-foreground">
                              {campaign.completed_calls}/{campaign.total_calls}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell>{campaign.phone_numbers.length}</TableCell>
                        <TableCell>
                          <span className="text-emerald-500">{campaign.successful_calls}</span>
                          {campaign.failed_calls > 0 && (
                            <span className="text-destructive ml-2">/ {campaign.failed_calls}</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {format(new Date(campaign.created_at), 'dd MMM yyyy', { locale: dateLocale })}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            {campaign.status === 'draft' && (
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => controlCampaign.mutate({ campaign_id: campaign.id, action: 'start' })}
                              >
                                <Play className="h-4 w-4 text-emerald-500" />
                              </Button>
                            )}
                            {campaign.status === 'running' && (
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => controlCampaign.mutate({ campaign_id: campaign.id, action: 'pause' })}
                              >
                                <Pause className="h-4 w-4 text-yellow-500" />
                              </Button>
                            )}
                            {campaign.status === 'paused' && (
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => controlCampaign.mutate({ campaign_id: campaign.id, action: 'resume' })}
                              >
                                <Play className="h-4 w-4 text-emerald-500" />
                              </Button>
                            )}
                            {['running', 'paused'].includes(campaign.status) && (
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => controlCampaign.mutate({ campaign_id: campaign.id, action: 'cancel' })}
                              >
                                <StopCircle className="h-4 w-4 text-destructive" />
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => setSelectedCampaign(campaign.id)}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            {campaign.status === 'draft' && (
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => deleteCampaign.mutate(campaign.id)}
                              >
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Campaign Details Dialog */}
        <Dialog open={!!selectedCampaign} onOpenChange={() => setSelectedCampaign(null)}>
          <DialogContent className="max-w-3xl">
            <DialogHeader>
              <DialogTitle>{t('campaigns.details.title')}</DialogTitle>
              <DialogDescription>
                {t('campaigns.details.description')}
              </DialogDescription>
            </DialogHeader>
            <div className="max-h-96 overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('campaigns.details.number')}</TableHead>
                    <TableHead>{t('campaigns.table.status')}</TableHead>
                    <TableHead>{t('campaigns.details.duration')}</TableHead>
                    <TableHead>{t('campaigns.details.result')}</TableHead>
                    <TableHead>{t('campaigns.details.calledAt')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {campaignCalls?.map((call) => (
                    <TableRow key={call.id}>
                      <TableCell className="font-mono">{call.phone_number}</TableCell>
                      <TableCell>
                        <Badge variant={call.status === 'completed' ? 'default' : 'secondary'}>
                          {call.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {call.duration ? `${Math.floor(call.duration / 60)}m ${call.duration % 60}s` : '-'}
                      </TableCell>
                      <TableCell>{call.outcome || '-'}</TableCell>
                      <TableCell>
                        {call.called_at 
                          ? format(new Date(call.called_at), 'dd/MM HH:mm', { locale: fr })
                          : '-'
                        }
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
};

export default Campaigns;
