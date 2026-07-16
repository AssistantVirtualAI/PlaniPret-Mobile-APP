import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/context/OrganizationContext";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "@/hooks/use-toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useTranslation } from "@/hooks/useTranslation";
import { 
  Shield, 
  Zap, 
  Calendar, 
  Mail, 
  MessageSquare, 
  BarChart3, 
  FileText, 
  Users,
  Plus,
  Trash2,
  Settings,
  ExternalLink,
  Search,
  GitBranch,
  Play,
  Pause,
  Edit
} from "lucide-react";

interface MarketplaceApp {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  category: string;
  requiresHipaa: boolean;
  features: string[];
}

const marketplaceApps: MarketplaceApp[] = [
  {
    id: "zapier",
    name: "Zapier",
    description: "Connect your agents to over 5,000 applications",
    icon: <Zap className="h-6 w-6" />,
    category: "Automation",
    requiresHipaa: false,
    features: ["Webhooks", "Triggers", "Automated actions"]
  },
  {
    id: "calendly",
    name: "Calendly",
    description: "Automatic appointment scheduling",
    icon: <Calendar className="h-6 w-6" />,
    category: "Scheduling",
    requiresHipaa: false,
    features: ["Online booking", "Automatic reminders", "Calendar sync"]
  },
  {
    id: "mailchimp",
    name: "Mailchimp",
    description: "Automated email marketing",
    icon: <Mail className="h-6 w-6" />,
    category: "Marketing",
    requiresHipaa: false,
    features: ["Email campaigns", "Segmentation", "Analytics"]
  },
  {
    id: "slack",
    name: "Slack",
    description: "Real-time notifications and alerts",
    icon: <MessageSquare className="h-6 w-6" />,
    category: "Communication",
    requiresHipaa: false,
    features: ["Notifications", "Dedicated channels", "Custom alerts"]
  },
  {
    id: "hubspot",
    name: "HubSpot CRM",
    description: "Automatic CRM synchronization",
    icon: <Users className="h-6 w-6" />,
    category: "CRM",
    requiresHipaa: true,
    features: ["Contacts", "Deals", "Automatic notes"]
  },
  {
    id: "analytics",
    name: "Google Analytics",
    description: "Advanced performance tracking",
    icon: <BarChart3 className="h-6 w-6" />,
    category: "Analytics",
    requiresHipaa: false,
    features: ["Events", "Conversions", "Custom reports"]
  },
  {
    id: "notion",
    name: "Notion",
    description: "Automatic documentation and notes",
    icon: <FileText className="h-6 w-6" />,
    category: "Productivity",
    requiresHipaa: true,
    features: ["Automatic pages", "Database", "Templates"]
  },
  {
    id: "make",
    name: "Make (Integromat)",
    description: "Complex visual automations",
    icon: <Settings className="h-6 w-6" />,
    category: "Automation",
    requiresHipaa: false,
    features: ["Scenarios", "Modules", "Advanced filters"]
  }
];

export default function Workflows() {
  const navigate = useNavigate();
  const { selectedOrg } = useOrganization();
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const [hipaaModalOpen, setHipaaModalOpen] = useState(false);
  const [selectedApp, setSelectedApp] = useState<MarketplaceApp | null>(null);
  const [hipaaAccepted, setHipaaAccepted] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState("visual");

  const filteredMarketplaceApps = marketplaceApps.filter(app =>
    app.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    app.category.toLowerCase().includes(searchQuery.toLowerCase()) ||
    app.description.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const { data: installedWorkflows, isLoading } = useQuery({
    queryKey: ['workflows', selectedOrg?.id],
    queryFn: async () => {
      if (!selectedOrg?.id) return [];
      const { data, error } = await supabase
        .from('workflows')
        .select('*')
        .eq('organization_id', selectedOrg.id)
        .order('installed_at', { ascending: false });
      
      if (error) throw error;
      return data;
    },
    enabled: !!selectedOrg?.id
  });

  const { data: organization } = useQuery({
    queryKey: ['organization-hipaa', selectedOrg?.id],
    queryFn: async () => {
      if (!selectedOrg?.id) return null;
      const { data, error } = await supabase
        .from('organizations')
        .select('hipaa_enabled')
        .eq('id', selectedOrg.id)
        .single();
      
      if (error) throw error;
      return data;
    },
    enabled: !!selectedOrg?.id
  });

  const installMutation = useMutation({
    mutationFn: async (app: MarketplaceApp) => {
      if (!selectedOrg?.id) throw new Error("No organization");
      
      const { error } = await supabase
        .from('workflows')
        .insert({
          organization_id: selectedOrg.id,
          app_name: app.id,
          config: { name: app.name, category: app.category },
          is_active: true
        });
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workflows'] });
      toast({ title: t('workflows.appInstalled') });
      setHipaaModalOpen(false);
      setSelectedApp(null);
      setHipaaAccepted(false);
    },
    onError: () => {
      toast({ title: t('common.error'), description: t('workflows.installError'), variant: "destructive" });
    }
  });

  const uninstallMutation = useMutation({
    mutationFn: async (workflowId: string) => {
      const { error } = await supabase
        .from('workflows')
        .delete()
        .eq('id', workflowId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workflows'] });
      toast({ title: t('workflows.appUninstalled') });
    }
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      const { error } = await supabase
        .from('workflows')
        .update({ is_active: isActive })
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workflows'] });
    }
  });

  const handleInstall = (app: MarketplaceApp) => {
    if (app.requiresHipaa && !organization?.hipaa_enabled) {
      setSelectedApp(app);
      setHipaaModalOpen(true);
    } else {
      installMutation.mutate(app);
    }
  };

  const confirmHipaaInstall = () => {
    if (selectedApp && hipaaAccepted) {
      installMutation.mutate(selectedApp);
    }
  };

  const isInstalled = (appId: string) => {
    return installedWorkflows?.some(w => w.app_name === appId);
  };

  const getAppDetails = (appName: string) => {
    return marketplaceApps.find(a => a.id === appName);
  };

  // Filter visual workflows (have config.type === 'visual-workflow')
  const visualWorkflows = installedWorkflows?.filter(w => {
    const config = w.config as { type?: string } | null;
    return config?.type === 'visual-workflow';
  }) || [];

  // Filter marketplace integrations (not visual workflows)
  const marketplaceWorkflows = installedWorkflows?.filter(w => {
    const config = w.config as { type?: string } | null;
    return config?.type !== 'visual-workflow';
  }) || [];

  return (
    <AppLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">{t('workflows.title')}</h1>
            <p className="text-muted-foreground">
              {t('workflows.description')}
            </p>
          </div>
          <Button onClick={() => navigate('/workflow-builder/new')}>
            <Plus className="h-4 w-4 mr-2" />
            {t('workflows.newWorkflow')}
          </Button>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="visual" className="flex items-center gap-2">
              <GitBranch className="h-4 w-4" />
              {t('workflows.tabs.visual')}
            </TabsTrigger>
            <TabsTrigger value="marketplace" className="flex items-center gap-2">
              <Zap className="h-4 w-4" />
              {t('workflows.tabs.marketplace')}
            </TabsTrigger>
          </TabsList>

          {/* Visual Workflows Tab */}
          <TabsContent value="visual" className="space-y-6">
            {visualWorkflows.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <GitBranch className="h-12 w-12 text-muted-foreground mb-4" />
                  <h3 className="text-lg font-medium mb-2">{t('workflows.noWorkflows')}</h3>
                  <p className="text-sm text-muted-foreground mb-4 text-center max-w-md">
                    {t('workflows.description')}
                  </p>
                  <Button onClick={() => navigate('/workflow-builder/new')}>
                    <Plus className="h-4 w-4 mr-2" />
                    {t('workflows.createFirst')}
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {visualWorkflows.map((workflow) => {
                  const config = workflow.config as { name?: string; nodes?: unknown[] } | null;
                  const nodeCount = config?.nodes?.length || 0;
                  return (
                    <Card key={workflow.id} className="hover:shadow-md transition-shadow">
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex items-center gap-3">
                            <div className="p-2 bg-primary/10 rounded-lg text-primary">
                              <GitBranch className="h-5 w-5" />
                            </div>
                            <div>
                              <p className="font-medium">{config?.name || t('workflows.noName')}</p>
                              <p className="text-xs text-muted-foreground">
                                {nodeCount} {t('workflows.nodes')}
                              </p>
                            </div>
                          </div>
                          <Badge variant={workflow.is_active ? "default" : "secondary"}>
                            {workflow.is_active ? t('workflows.active') : t('workflows.inactive')}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            className="flex-1"
                            onClick={() => navigate(`/workflow-builder/${workflow.id}`)}
                          >
                            <Edit className="h-3 w-3 mr-1" />
                            {t('workflows.edit')}
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => toggleMutation.mutate({ id: workflow.id, isActive: !workflow.is_active })}
                          >
                            <Edit className="h-3 w-3 mr-1" />
                            Edit
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => toggleMutation.mutate({ id: workflow.id, isActive: !workflow.is_active })}
                          >
                            {workflow.is_active ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => uninstallMutation.mutate(workflow.id)}
                          >
                            <Trash2 className="h-3 w-3 text-destructive" />
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>

          {/* Marketplace Tab */}
          <TabsContent value="marketplace" className="space-y-6">
            {/* Installed Marketplace Apps */}
            {marketplaceWorkflows.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Installed applications</CardTitle>
                  <CardDescription>
                    Manage your active integrations
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {marketplaceWorkflows.map((workflow) => {
                      const app = getAppDetails(workflow.app_name);
                      return (
                        <div
                          key={workflow.id}
                          className="flex items-center justify-between p-4 border rounded-lg"
                        >
                          <div className="flex items-center gap-4">
                            <div className="p-2 bg-primary/10 rounded-lg text-primary">
                              {app?.icon || <Zap className="h-6 w-6" />}
                            </div>
                            <div>
                              <p className="font-medium">{app?.name || workflow.app_name}</p>
                              <p className="text-sm text-muted-foreground">
                                {app?.category || "Application"}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-4">
                            <div className="flex items-center gap-2">
                              <span className="text-sm text-muted-foreground">
                                {workflow.is_active ? "Active" : "Inactive"}
                              </span>
                              <Switch
                                checked={workflow.is_active || false}
                                onCheckedChange={(checked) => 
                                  toggleMutation.mutate({ id: workflow.id, isActive: checked })
                                }
                              />
                            </div>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => uninstallMutation.mutate(workflow.id)}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Marketplace Grid */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-lg">Marketplace</CardTitle>
                    <CardDescription>
                      Discover and install new integrations
                    </CardDescription>
                  </div>
                  <div className="relative w-64">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search applications..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-9"
                    />
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {filteredMarketplaceApps.map((app) => (
                    <Card key={app.id} className="relative overflow-hidden">
                      {app.requiresHipaa && (
                        <div className="absolute top-2 right-2">
                          <Badge variant="outline" className="text-xs">
                            <Shield className="h-3 w-3 mr-1" />
                            HIPAA
                          </Badge>
                        </div>
                      )}
                      <CardContent className="p-4 space-y-4">
                        <div className="flex items-start gap-3">
                          <div className="p-2 bg-primary/10 rounded-lg text-primary">
                            {app.icon}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium truncate">{app.name}</p>
                            <p className="text-xs text-muted-foreground">{app.category}</p>
                          </div>
                        </div>
                        <p className="text-sm text-muted-foreground line-clamp-2">
                          {app.description}
                        </p>
                        <div className="flex flex-wrap gap-1">
                          {app.features.slice(0, 2).map((feature) => (
                            <Badge key={feature} variant="secondary" className="text-xs">
                              {feature}
                            </Badge>
                          ))}
                        </div>
                        <Button
                          className="w-full"
                          variant={isInstalled(app.id) ? "secondary" : "default"}
                          disabled={isInstalled(app.id)}
                          onClick={() => handleInstall(app)}
                        >
                          {isInstalled(app.id) ? (
                            "Installed"
                          ) : (
                            <>
                              <Plus className="h-4 w-4 mr-1" />
                              Install
                            </>
                          )}
                        </Button>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* HIPAA Modal */}
        <Dialog open={hipaaModalOpen} onOpenChange={setHipaaModalOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5 text-primary" />
                HIPAA compliance required
              </DialogTitle>
              <DialogDescription>
                The {selectedApp?.name} application requires HIPAA compliance because it may process protected health data.
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-4 py-4">
              <div className="p-4 bg-muted rounded-lg space-y-2">
                <h4 className="font-medium">HIPAA requirements:</h4>
                <ul className="text-sm text-muted-foreground space-y-1">
                  <li>• Data encryption in transit and at rest</li>
                  <li>• Data access audit logging</li>
                  <li>• Strict access controls</li>
                  <li>• Business Associate Agreement (BAA)</li>
                </ul>
              </div>
              
              <div className="flex items-start gap-3">
                <Checkbox
                  id="hipaa-accept"
                  checked={hipaaAccepted}
                  onCheckedChange={(checked) => setHipaaAccepted(checked as boolean)}
                />
                <label htmlFor="hipaa-accept" className="text-sm">
                  I confirm that my organization meets HIPAA requirements and that I am authorized to enable this integration.
                </label>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setHipaaModalOpen(false)}>
                Cancel
              </Button>
              <Button onClick={confirmHipaaInstall} disabled={!hipaaAccepted}>
                Confirm and install
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}
