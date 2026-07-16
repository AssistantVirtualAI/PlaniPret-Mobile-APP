import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  ArrowLeft, Bot, Key, Palette, BarChart3, Play, Code, Brain, 
  Activity, Users, Settings2, Wrench, Webhook, Phone 
} from 'lucide-react';
import { useAgentSettings } from '@/hooks/useAgentSettings';
import { AgentOverviewTab } from '@/components/agents/AgentOverviewTab';
import { AgentCredentialsTab } from '@/components/agents/AgentCredentialsTab';
import { AgentWidgetTab } from '@/components/agents/AgentWidgetTab';
import { AgentAnalyticsTab } from '@/components/agents/AgentAnalyticsTab';
import { AgentPrototypeTab } from '@/components/agents/AgentPrototypeTab';
import { AgentEmbedTab } from '@/components/agents/AgentEmbedTab';
import { AgentAnalyticsWidget } from '@/components/agents/AgentAnalyticsWidget';
import { AgentKnowledgePromptTab } from '@/components/agents/AgentKnowledgePromptTab';
import { AgentClientsTab } from '@/components/agents/AgentClientsTab';
import { AgentRealtimeAnalytics } from '@/components/agents/AgentRealtimeAnalytics';
import { AgentFullConfigTab } from '@/components/agents/AgentFullConfigTab';
import { AgentMCPConfigTab } from '@/components/agents/AgentMCPConfigTab';
import { AgentPlatformWebhooksTab } from '@/components/agents/AgentPlatformWebhooksTab';
import { AgentTwilioSection } from '@/components/agents/AgentTwilioSection';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';

interface NavSection {
  title: string;
  items: {
    id: string;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
  }[];
}

const AgentSettingsPage = () => {
  const { agentId } = useParams<{ agentId: string }>();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('overview');
  
  const {
    agent,
    client,
    conversations,
    analytics,
    integration,
    isLoading,
    isLoadingAnalytics,
    updateAgent,
    testConnection,
    isUpdating,
    isTesting,
  } = useAgentSettings(agentId);

  if (isLoading) {
    return (
      <AppLayout>
        <div className="space-y-6">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-[600px] w-full" />
        </div>
      </AppLayout>
    );
  }

  if (!agent) {
    return (
      <AppLayout>
        <div className="flex flex-col items-center justify-center h-[60vh]">
          <p className="text-muted-foreground mb-4">Agent not found</p>
          <Button onClick={() => navigate('/agents')}>
            Retour aux agents
          </Button>
        </div>
      </AppLayout>
    );
  }

  const platformAgentId = (agent.config as Record<string, any>)?.agent_id || agent.platform_agent_id;

  const navSections: NavSection[] = [
    {
      title: 'General',
      items: [
        { id: 'overview', label: 'Overview', icon: Bot },
        { id: 'config', label: 'Connection', icon: Key },
        { id: 'clients', label: 'Clients', icon: Users },
      ],
    },
    {
      title: 'Configuration',
      items: [
        { id: 'advanced', label: 'Settings', icon: Settings2 },
        { id: 'knowledge', label: 'Knowledge base', icon: Brain },
        { id: 'mcp', label: 'MCP servers', icon: Wrench },
        { id: 'webhooks', label: 'Webhooks', icon: Webhook },
      ],
    },
    {
      title: 'Appearance',
      items: [
        { id: 'widget', label: 'Widget', icon: Palette },
        { id: 'embed', label: 'Integration', icon: Code },
      ],
    },
    {
      title: 'Performance',
      items: [
        { id: 'analytics', label: 'Analytics', icon: BarChart3 },
        { id: 'prototype', label: 'Test', icon: Play },
      ],
    },
  ];

  const renderContent = () => {
    switch (activeTab) {
      case 'overview':
        return (
          <AgentOverviewTab
            agent={agent}
            client={client}
            analytics={analytics}
            isLoadingAnalytics={isLoadingAnalytics}
          />
        );
      case 'config':
        return (
          <div className="space-y-6">
            <AgentCredentialsTab
              agent={agent}
              integration={integration}
              onUpdate={updateAgent}
              onTestConnection={testConnection}
              isUpdating={isUpdating}
              isTesting={isTesting}
            />
            {['elevenlabs', 'vapi', 'retell'].includes(agent.platform) && (
              <AgentTwilioSection
                agentId={agentId!}
                agentName={agent.name}
                currentTwilioNumber={(agent as any).twilio_number || null}
                organizationId={agent.organization_id}
              />
            )}
          </div>
        );
      case 'advanced':
        return (
          <AgentFullConfigTab
            agentId={agentId!}
            platformAgentId={platformAgentId}
            platform={agent.platform}
            organizationId={agent.organization_id}
          />
        );
      case 'knowledge':
        return <AgentKnowledgePromptTab agent={agent} />;
      case 'mcp':
        return <AgentMCPConfigTab agentId={agentId!} />;
      case 'webhooks':
        return <AgentPlatformWebhooksTab agentId={agentId!} platform={agent.platform} />;
      case 'widget':
        return (
          <AgentWidgetTab
            agent={agent}
            onUpdate={updateAgent}
            isUpdating={isUpdating}
          />
        );
      case 'analytics':
        return (
          <div className="space-y-6">
            <AgentRealtimeAnalytics 
              agentId={agentId!}
              platformAgentId={platformAgentId}
            />
            <AgentAnalyticsTab
              conversations={conversations || []}
              analytics={analytics}
              isLoadingAnalytics={isLoadingAnalytics}
            />
          </div>
        );
      case 'clients':
        return (
          <AgentClientsTab 
            agentId={agentId!} 
            organizationId={agent.organization_id}
          />
        );
      case 'prototype':
        return (
          <div className="space-y-6">
            <AgentAnalyticsWidget agentId={agentId!} agentName={agent.name} />
            <AgentPrototypeTab agent={agent} />
          </div>
        );
      case 'embed':
        return <AgentEmbedTab agent={agent} />;
      default:
        return null;
    }
  };

  return (
    <AppLayout>
      <div className="flex flex-col lg:flex-row gap-6 min-h-[calc(100vh-8rem)]">
        {/* Sidebar Navigation */}
        <motion.aside 
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          className="lg:w-64 flex-shrink-0"
        >
          <div className="lg:sticky lg:top-6 space-y-5">
            {/* Agent Header Card */}
            <div className="p-4 rounded-xl border border-border/50 bg-card/80 backdrop-blur-sm">
              <button 
                onClick={() => navigate('/agents')}
                className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-3"
              >
                <ArrowLeft className="h-4 w-4" />
                Retour aux agents
              </button>
              <h1 className="text-lg font-bold truncate">{agent.name}</h1>
              <div className="flex items-center gap-2 mt-2">
                <Badge variant="outline" className="text-xs capitalize">
                  {agent.platform}
                </Badge>
                {platformAgentId && (
                  <span className="text-xs text-muted-foreground font-mono truncate max-w-[120px]">
                    {platformAgentId}
                  </span>
                )}
              </div>
            </div>

            {/* Navigation */}
            <ScrollArea className="lg:max-h-[calc(100vh-16rem)]">
              <nav className="space-y-5">
                {navSections.map((section) => (
                  <div key={section.title}>
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70 mb-1.5 px-3">
                      {section.title}
                    </p>
                    <div className="space-y-0.5">
                      {section.items.map((item) => {
                        const isActive = activeTab === item.id;
                        return (
                          <button
                            key={item.id}
                            onClick={() => setActiveTab(item.id)}
                            className={cn(
                              'w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all duration-150',
                              isActive
                                ? 'bg-primary/10 text-primary font-medium shadow-sm'
                                : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
                            )}
                          >
                            <item.icon className={cn(
                              'h-4 w-4 flex-shrink-0',
                              isActive ? 'text-primary' : 'text-muted-foreground/70'
                            )} />
                            {item.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </nav>
            </ScrollArea>
          </div>
        </motion.aside>

        {/* Main Content */}
        <motion.main 
          key={activeTab}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.15 }}
          className="flex-1 min-w-0"
        >
          {renderContent()}
        </motion.main>
      </div>
    </AppLayout>
  );
};

export default AgentSettingsPage;
