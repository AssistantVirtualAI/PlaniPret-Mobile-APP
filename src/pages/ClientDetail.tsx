import { useParams, useNavigate } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowLeft, User, Bot, Plug, Shield, Link, Code, MessageSquare, Phone } from 'lucide-react';
import { useClientDetail } from '@/hooks/useClientDetail';
import { ClientOverviewTab } from '@/components/clients/ClientOverviewTab';
import { ClientAgentsTab } from '@/components/clients/ClientAgentsTab';
import { ClientSolutionsTab } from '@/components/clients/ClientSolutionsTab';
import { ClientAccessTab } from '@/components/clients/ClientAccessTab';
import { ClientUrlTab } from '@/components/clients/ClientUrlTab';
import { ClientCssTab } from '@/components/clients/ClientCssTab';
import { ClientConversationsTab } from '@/components/clients/ClientConversationsTab';
import { ClientTelephonyTab } from '@/components/clients/ClientTelephonyTab';

const ClientDetail = () => {
  const { clientId } = useParams<{ clientId: string }>();
  const navigate = useNavigate();
  
  const {
    client,
    clientMembers,
    assignedAgents,
    availableAgents,
    isLoading,
    updateClient,
    assignAgent,
    unassignAgent,
    isUpdating,
  } = useClientDetail(clientId);

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

  if (!client) {
    return (
      <AppLayout>
        <div className="flex flex-col items-center justify-center h-[60vh]">
          <p className="text-muted-foreground mb-4">Client non trouvé</p>
          <Button onClick={() => navigate('/clients')}>
            Retour aux clients
          </Button>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/clients')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">{client.name}</h1>
            <p className="text-muted-foreground">{client.email || 'Aucun email'}</p>
          </div>
        </div>

        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList className="grid w-full grid-cols-8">
            <TabsTrigger value="overview" className="flex items-center gap-2">
              <User className="h-4 w-4" />
              <span className="hidden sm:inline">Aperçu</span>
            </TabsTrigger>
            <TabsTrigger value="conversations" className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4" />
              <span className="hidden sm:inline">Conversations</span>
            </TabsTrigger>
            <TabsTrigger value="agents" className="flex items-center gap-2">
              <Bot className="h-4 w-4" />
              <span className="hidden sm:inline">Agents</span>
            </TabsTrigger>
            <TabsTrigger value="telephony" className="flex items-center gap-2">
              <Phone className="h-4 w-4" />
              <span className="hidden sm:inline">Téléphonie</span>
            </TabsTrigger>
            <TabsTrigger value="solutions" className="flex items-center gap-2">
              <Plug className="h-4 w-4" />
              <span className="hidden sm:inline">Solutions</span>
            </TabsTrigger>
            <TabsTrigger value="access" className="flex items-center gap-2">
              <Shield className="h-4 w-4" />
              <span className="hidden sm:inline">Accès</span>
            </TabsTrigger>
            <TabsTrigger value="url" className="flex items-center gap-2">
              <Link className="h-4 w-4" />
              <span className="hidden sm:inline">URL</span>
            </TabsTrigger>
            <TabsTrigger value="css" className="flex items-center gap-2">
              <Code className="h-4 w-4" />
              <span className="hidden sm:inline">CSS</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview">
            <ClientOverviewTab
              client={client}
              members={clientMembers || []}
              onUpdate={updateClient}
              isUpdating={isUpdating}
            />
          </TabsContent>

          <TabsContent value="conversations">
            <ClientConversationsTab clientId={clientId!} />
          </TabsContent>

          <TabsContent value="agents">
            <ClientAgentsTab
              clientId={clientId!}
              assignedAgents={assignedAgents || []}
              availableAgents={availableAgents || []}
              onAssign={assignAgent}
              onUnassign={unassignAgent}
            />
          </TabsContent>

          <TabsContent value="telephony">
            <ClientTelephonyTab
              clientId={clientId!}
              organizationId={(client as any).organization_id}
            />
          </TabsContent>



          <TabsContent value="solutions">
            <ClientSolutionsTab
              clientId={clientId!}
              assignedAgents={assignedAgents || []}
            />
          </TabsContent>

          <TabsContent value="access">
            <ClientAccessTab
              client={client}
              onUpdate={updateClient}
              isUpdating={isUpdating}
              hasPassword={(client as any)?.hasPassword ?? false}
            />
          </TabsContent>

          <TabsContent value="url">
            <ClientUrlTab client={client} />
          </TabsContent>

          <TabsContent value="css">
            <ClientCssTab
              client={client}
              onUpdate={updateClient}
              isUpdating={isUpdating}
            />
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
};

export default ClientDetail;
