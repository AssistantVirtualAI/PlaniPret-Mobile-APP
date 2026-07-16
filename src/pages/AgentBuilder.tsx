import { useState, useCallback, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AgentBuilderSidebar } from '@/components/agent-builder/AgentBuilderSidebar';
import { AgentBuilderCanvas } from '@/components/agent-builder/AgentBuilderCanvas';
import { AgentPreviewPanel } from '@/components/agent-builder/AgentPreviewPanel';
import { AgentBuilderWizard } from '@/components/agent-builder/AgentBuilderWizard';
import { DeployAgentModal } from '@/components/agent-builder/DeployAgentModal';
import { useAgentBuilder, AgentBuilderConfig } from '@/hooks/useAgentBuilder';
import { useOrganization } from '@/context/OrganizationContext';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { ArrowLeft, Save, Sparkles, Eye, Wand2, Settings2 } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from '@/hooks/useTranslation';

type BuilderMode = 'wizard' | 'advanced';

export default function AgentBuilder() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { agentId } = useParams<{ agentId?: string }>();
  const { selectedOrgId } = useOrganization();
  const [selectedClientId, setSelectedClientId] = useState<string | undefined>(undefined);
  const [mode, setMode] = useState<BuilderMode>('wizard');
  const [showDeployModal, setShowDeployModal] = useState(false);
  
  const {
    config,
    agentName,
    setAgentName,
    updateConfig,
    saveAgent,
    loadAgent,
    updateAgent,
    isSaving,
  } = useAgentBuilder();

  const isEditMode = !!agentId;

  // Load agent data if editing - switch to advanced mode for editing
  useEffect(() => {
    if (agentId) {
      loadAgent(agentId);
      setMode('advanced');
    }
  }, [agentId, loadAgent]);

  // Fetch clients for assignment
  const { data: clients } = useQuery({
    queryKey: ['clients', selectedOrgId],
    queryFn: async () => {
      if (!selectedOrgId) return [];
      const { data, error } = await supabase
        .from('clients')
        .select('id, name')
        .eq('organization_id', selectedOrgId)
        .eq('status', 'active')
        .order('name');
      if (error) throw error;
      return data || [];
    },
    enabled: !!selectedOrgId,
  });

  const onDragStart = useCallback((event: React.DragEvent, nodeType: string) => {
    event.dataTransfer.setData('application/agentbuilder', nodeType);
    event.dataTransfer.effectAllowed = 'move';
  }, []);

  const handleConfigChange = useCallback((newConfig: AgentBuilderConfig) => {
    updateConfig(newConfig);
  }, [updateConfig]);

  const handleWizardConfigChange = useCallback((updates: Partial<AgentBuilderConfig>) => {
    updateConfig(updates);
  }, [updateConfig]);

  const handleSave = async () => {
    if (isEditMode && agentId) {
      const success = await updateAgent(agentId);
      if (success) {
        navigate(`/agent-settings/${agentId}`);
      }
    } else {
      const newAgentId = await saveAgent(selectedClientId || undefined);
      if (newAgentId) {
        navigate(`/agent-settings/${newAgentId}`);
      }
      return newAgentId;
    }
    return null;
  };

  const handleWizardComplete = () => {
    setShowDeployModal(true);
  };

  const handleDeploy = async () => {
    const newAgentId = await saveAgent(selectedClientId || undefined);
    return newAgentId;
  };

  const handlePreview = () => {
    if (!config.systemPrompt) {
      toast.error(t('messages.configurePromptFirst'));
      return;
    }
    toast.success(t('messages.usePreviewPanel'));
  };

  // Wizard mode (default for new agents)
  if (mode === 'wizard' && !isEditMode) {
    return (
      <AppLayout>
        <div className="flex flex-col h-[calc(100vh-4rem)]">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b bg-card">
            <div className="flex items-center gap-4">
              <Button variant="ghost" size="icon" onClick={() => navigate('/agents')}>
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <div>
                <h1 className="text-xl font-bold flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-primary" />
                  {t('pages.agentBuilder.createAgent')}
                </h1>
                <p className="text-sm text-muted-foreground">
                  {t('pages.agentBuilder.configureStepByStep')}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Tabs value={mode} onValueChange={(v) => setMode(v as BuilderMode)}>
                <TabsList>
                  <TabsTrigger value="wizard" className="flex items-center gap-2">
                    <Wand2 className="h-4 w-4" />
                    {t('pages.agentBuilder.assistant')}
                  </TabsTrigger>
                  <TabsTrigger value="advanced" className="flex items-center gap-2">
                    <Settings2 className="h-4 w-4" />
                    {t('pages.agentBuilder.advanced')}
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
          </div>

          {/* Wizard Content */}
          <div className="flex-1 overflow-hidden">
            <AgentBuilderWizard
              config={config}
              agentName={agentName}
              onConfigChange={handleWizardConfigChange}
              onAgentNameChange={setAgentName}
              onComplete={handleWizardComplete}
              isSaving={isSaving}
            />
          </div>

          {/* Deploy Modal */}
          <DeployAgentModal
            open={showDeployModal}
            onOpenChange={setShowDeployModal}
            agentName={agentName}
            config={config}
            onDeploy={handleDeploy}
            isSaving={isSaving}
          />
        </div>
      </AppLayout>
    );
  }

  // Advanced mode (canvas view)
  return (
    <AppLayout>
      <div className="flex flex-col h-[calc(100vh-4rem)]">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b bg-card">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate('/agents')}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-xl font-bold flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-primary" />
                {isEditMode ? t('pages.agentBuilder.editAgent') : 'Agent Builder'}
              </h1>
              <p className="text-sm text-muted-foreground">
                {isEditMode ? t('pages.agentBuilder.editConfiguration') : t('pages.agentBuilder.advancedMode')}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {!isEditMode && (
              <Tabs value={mode} onValueChange={(v) => setMode(v as BuilderMode)}>
                <TabsList>
                  <TabsTrigger value="wizard" className="flex items-center gap-2">
                    <Wand2 className="h-4 w-4" />
                    {t('pages.agentBuilder.assistant')}
                  </TabsTrigger>
                  <TabsTrigger value="advanced" className="flex items-center gap-2">
                    <Settings2 className="h-4 w-4" />
                    {t('pages.agentBuilder.advanced')}
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            )}
            <Button variant="outline" onClick={handlePreview}>
              <Eye className="mr-2 h-4 w-4" />
              {t('pages.agentBuilder.preview')}
            </Button>
            <Button onClick={handleSave} disabled={isSaving}>
              <Save className="mr-2 h-4 w-4" />
              {isSaving ? t('pages.agentBuilder.saving') : isEditMode ? t('pages.agentBuilder.updateAgent') : t('pages.agentBuilder.createTheAgent')}
            </Button>
          </div>
        </div>

        {/* Config Panel */}
        <div className="border-b bg-card p-4">
          <div className="flex items-end gap-4 max-w-3xl">
            <div className="flex-1">
              <Label htmlFor="agentName">{t('pages.agentBuilder.agentName')} *</Label>
              <Input
                id="agentName"
                placeholder={t('pages.agentBuilder.agentName')}
                value={agentName}
                onChange={(e) => setAgentName(e.target.value)}
                className="mt-1"
              />
            </div>
            {!isEditMode && (
              <div className="w-64">
                <Label>{t('pages.agentBuilder.assignToClient')}</Label>
                <Select
                  value={selectedClientId}
                  onValueChange={(v) => setSelectedClientId(v === 'none' ? undefined : v)}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder={t('pages.agentBuilder.noClient')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{t('pages.agentBuilder.noClient')}</SelectItem>
                    {clients?.map((client) => (
                      <SelectItem key={client.id} value={client.id}>
                        {client.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        </div>

        {/* Main Builder Area */}
        <div className="flex flex-1 overflow-hidden">
          <AgentBuilderSidebar onDragStart={onDragStart} />
          <AgentBuilderCanvas onConfigChange={handleConfigChange} />
          
          {/* Preview Panel */}
          <div className="w-80 border-l p-4 overflow-hidden flex flex-col">
            <AgentPreviewPanel
              systemPrompt={config.systemPrompt}
              firstMessage={config.firstMessage}
              temperature={config.temperature}
              maxTokens={config.maxTokens}
            />
          </div>
        </div>
      </div>
    </AppLayout>
  );
}