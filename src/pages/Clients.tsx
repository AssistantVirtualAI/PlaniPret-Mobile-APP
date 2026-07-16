import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Plus, Key, Trash2, Users, Edit, MoreHorizontal, ExternalLink, Building2, TrendingUp, UserCheck, Bot, Crown } from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { PlatformBadge } from '@/components/agents/PlatformBadge';
import { ClientAvatar } from '@/components/clients/ClientAvatar';
import { ClientFilters, StatusFilter, SortField, SortOrder } from '@/components/clients/ClientFilters';
import { ClientMembersModal } from '@/components/clients/ClientMembersModal';
import { ClientLimitBanner, useClientLimit } from '@/components/billing/ClientLimitBanner';
import { ClientsDashboard } from '@/components/clients/ClientsDashboard';
import { ClientsExport } from '@/components/clients/ClientsExport';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from '@/context/OrganizationContext';
import { useToast } from '@/hooks/use-toast';
import { toast } from 'sonner';
import { useTranslation } from '@/hooks/useTranslation';
import { useLanguage } from '@/context/LanguageContext';

export default function Clients() {
  const { t } = useTranslation();
  const { language } = useLanguage();
  const navigate = useNavigate();
  const { selectedOrgId } = useOrganization();
  const { toast: toastHook } = useToast();
  const queryClient = useQueryClient();
  const { canCreateClient, clientCount, clientsIncluded, isSuperAdmin } = useClientLimit();
  
  // Filters state
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [sortField, setSortField] = useState<SortField>('created_at');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  
  // Modal states
  const [createOpen, setCreateOpen] = useState(false);
  const [membersModalOpen, setMembersModalOpen] = useState(false);
  const [selectedClient, setSelectedClient] = useState<{ id: string; name: string } | null>(null);
  
  // New client form
  const [newClient, setNewClient] = useState({
    name: '',
    email: '',
    username: '',
    password: '',
    assignedAgentId: '',
    language: 'fr',
    theme: 'light',
  });

  const { data: clients, isLoading } = useQuery({
    queryKey: ['clients', selectedOrgId],
    queryFn: async () => {
      if (!selectedOrgId) return [];
      
      const { data, error } = await supabase
        .from('clients_safe')
        .select(`
          *,
          assigned_agent:agents_safe!clients_assigned_agent_id_fkey(id, name, platform, platform_agent_id, config)
        `)
        .eq('organization_id', selectedOrgId);

      if (error) throw error;
      return data || [];
    },
    enabled: !!selectedOrgId,
  });

  const { data: agents } = useQuery({
    queryKey: ['agents', selectedOrgId],
    queryFn: async () => {
      if (!selectedOrgId) return [];
      
      const { data, error } = await supabase
        .from('agents_safe')
        .select('*')
        .eq('organization_id', selectedOrgId)
        .order('name');

      if (error) throw error;
      return data || [];
    },
    enabled: !!selectedOrgId,
  });

  // Filter and sort clients
  const filteredClients = useMemo(() => {
    if (!clients) return [];

    let result = [...clients];

    // Apply search filter
    if (search) {
      const searchLower = search.toLowerCase();
      result = result.filter(
        (client) =>
          client.name.toLowerCase().includes(searchLower) ||
          client.email?.toLowerCase().includes(searchLower) ||
          client.username?.toLowerCase().includes(searchLower)
      );
    }

    // Apply status filter
    if (statusFilter !== 'all') {
      result = result.filter((client) => client.status === statusFilter);
    }

    // Apply sorting
    result.sort((a, b) => {
      let comparison = 0;
      
      switch (sortField) {
        case 'name':
          comparison = a.name.localeCompare(b.name);
          break;
        case 'created_at':
          comparison = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
          break;
        case 'status':
          comparison = (a.status || '').localeCompare(b.status || '');
          break;
      }
      
      return sortOrder === 'asc' ? comparison : -comparison;
    });

    return result;
  }, [clients, search, statusFilter, sortField, sortOrder]);

  const deleteClientMutation = useMutation({
    mutationFn: async (clientId: string) => {
      const { error } = await supabase
        .from('clients')
        .delete()
        .eq('organization_id', selectedOrgId)
        .eq('id', clientId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      toast.success(t('clients.messages.deleteSuccess'));
    },
    onError: (error: any) => {
      toast.error(error.message || t('clients.messages.deleteError'));
    },
  });

  const toggleStatusMutation = useMutation({
    mutationFn: async ({ clientId, newStatus }: { clientId: string; newStatus: string }) => {
      const { error } = await supabase
        .from('clients')
        .update({ status: newStatus })
        .eq('organization_id', selectedOrgId)
        .eq('id', clientId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      toast.success(t('clients.messages.statusUpdated'));
    },
  });

  const handleCreate = async () => {
    const { name, email, username, password, assignedAgentId, language, theme } = newClient;

    if (!name || !email || !username || !password) {
      toastHook({
        title: t('common.error'),
        description: t('clients.messages.requiredFields'),
        variant: 'destructive',
      });
      return;
    }

    if (password.length < 8) {
      toastHook({
        title: t('common.error'),
        description: t('clients.messages.passwordTooShort'),
        variant: 'destructive',
      });
      return;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error(t('common.error'));

      // Create client entry
      const { data: newClientData, error: clientError } = await supabase
        .from('clients')
        .insert({
          organization_id: selectedOrgId,
          name,
          email,
          username,
          login_id: username,
          assigned_agent_id: assignedAgentId || null,
          language,
          theme,
          status: 'active',
          created_by: user.id,
        })
        .select('id')
        .single();

      if (clientError) throw clientError;

      toastHook({
        title: t('common.success'),
        description: t('clients.messages.createSuccess').replace('{name}', name),
      });

      setCreateOpen(false);
      setNewClient({ name: '', email: '', username: '', password: '', assignedAgentId: '', language: 'fr', theme: 'light' });
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      
      // Redirect to client details page
      if (newClientData?.id) {
        navigate(`/clients/${newClientData.id}`);
      }
    } catch (error: any) {
      console.error('Error creating client:', error);
      toastHook({
        title: t('common.error'),
        description: error.message || t('clients.messages.createError'),
        variant: 'destructive',
      });
    }
  };

  const handleOpenMembers = (client: { id: string; name: string }) => {
    setSelectedClient(client);
    setMembersModalOpen(true);
  };

  const handleSortChange = (field: SortField, order: SortOrder) => {
    setSortField(field);
    setSortOrder(order);
  };

  return (
    <AppLayout>
      <div className="p-6 lg:p-8 space-y-8 max-w-[1800px] mx-auto">
        {/* Premium Executive Header */}
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-card/95 via-card to-card/90 border border-border/50 shadow-2xl"
        >
          {/* Decorative background elements */}
          <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-secondary/5" />
          <div className="absolute -right-20 -top-20 w-80 h-80 rounded-full bg-gradient-to-br from-primary/10 to-transparent blur-3xl" />
          <div className="absolute -left-20 -bottom-20 w-60 h-60 rounded-full bg-gradient-to-tr from-secondary/10 to-transparent blur-3xl" />
          <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmYiIGZpbGwtb3BhY2l0eT0iMC4wMyI+PGNpcmNsZSBjeD0iMzAiIGN5PSIzMCIgcj0iMiIvPjwvZz48L2c+PC9zdmc+')] opacity-50" />
          
          <div className="relative z-10 p-8 lg:p-10">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
              <div className="space-y-3">
                <div className="flex items-center gap-4">
                  <motion.div 
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
                    className="relative"
                  >
                    <div className="p-4 rounded-2xl bg-gradient-to-br from-primary via-primary to-secondary shadow-xl shadow-primary/25">
                      <Building2 className="h-7 w-7 text-white" />
                    </div>
                    <div className="absolute -inset-1 bg-gradient-to-br from-primary to-secondary opacity-30 blur-lg rounded-2xl -z-10" />
                  </motion.div>
                  <div>
                    <h1 className="text-3xl lg:text-4xl font-bold tracking-tight">
                      <span className="bg-gradient-to-r from-foreground via-foreground/90 to-foreground/70 bg-clip-text text-transparent">
                        {t('clients.title')}
                      </span>
                    </h1>
                    <p className="text-muted-foreground mt-1">
                      {isSuperAdmin ? (
                        <span className="flex items-center gap-2">
                          <Crown className="h-4 w-4 text-amber-500" />
                          <span className="text-amber-600 dark:text-amber-400 font-medium">{t('roles.superAdmin')}</span>
                          <span className="text-muted-foreground">• {t('clients.superAdminDescription')}</span>
                          <span className="px-2 py-0.5 bg-primary/10 text-primary text-sm font-semibold rounded-full">{clientCount} {t('clients.activeClients')}</span>
                        </span>
                      ) : (
                        <span className="flex items-center gap-2">
                          {t('clients.description')}
                          <span className="px-2 py-0.5 bg-primary/10 text-primary text-sm font-semibold rounded-full">
                            {clientCount}/{String(clientsIncluded)}
                          </span>
                        </span>
                      )}
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <ClientsExport clients={clients || []} />
              
                <Dialog open={createOpen} onOpenChange={setCreateOpen}>
                  <DialogTrigger asChild>
                    <Button 
                      className="gap-2 h-12 px-6 bg-gradient-to-r from-primary to-secondary hover:from-primary/90 hover:to-secondary/90 shadow-lg shadow-primary/25 rounded-xl font-semibold transition-all duration-300 hover:shadow-xl hover:shadow-primary/30 hover:-translate-y-0.5" 
                      disabled={!canCreateClient}
                    >
                      <Plus className="h-5 w-5" />
                      {canCreateClient ? t('clients.newClient') : t('clients.limitReached')}
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-[600px] rounded-2xl">
                    <DialogHeader>
                      <DialogTitle className="flex items-center gap-2 text-xl">
                        <div className="p-2 rounded-xl bg-gradient-to-br from-primary/20 to-secondary/20">
                          <Users className="h-5 w-5 text-primary" />
                        </div>
                        {t('clients.modal.createTitle')}
                      </DialogTitle>
                      <DialogDescription>
                        {t('clients.modal.createDescription')}
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 mt-4">
                      <div>
                        <Label htmlFor="name">{t('clients.modal.clientName')} *</Label>
                        <Input
                          id="name"
                          value={newClient.name}
                          onChange={(e) =>
                            setNewClient({
                              ...newClient,
                              name: e.target.value,
                              username: e.target.value
                                .toLowerCase()
                                .replace(/[^a-z0-9]/g, ''),
                            })
                          }
                          placeholder="Ex: Jean Dupont"
                        />
                      </div>
                      <div>
                        <Label htmlFor="email">{t('clients.modal.email')} *</Label>
                        <Input
                          id="email"
                          type="email"
                          value={newClient.email}
                          onChange={(e) =>
                            setNewClient({ ...newClient, email: e.target.value })
                          }
                          placeholder="jean.dupont@example.com"
                        />
                      </div>
                      <div>
                        <Label htmlFor="username">{t('clients.modal.username')} *</Label>
                        <Input
                          id="username"
                          value={newClient.username}
                          onChange={(e) =>
                            setNewClient({ ...newClient, username: e.target.value })
                          }
                          placeholder="jeandupont"
                        />
                        <p className="text-xs text-muted-foreground mt-1">
                          {t('clients.modal.usernameHint')}
                        </p>
                      </div>
                      <div>
                        <Label htmlFor="password">{t('clients.modal.password')} *</Label>
                        <Input
                          id="password"
                          type="password"
                          value={newClient.password}
                          onChange={(e) =>
                            setNewClient({ ...newClient, password: e.target.value })
                          }
                          placeholder={t('clients.modal.passwordHint')}
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label htmlFor="language">{t('clients.modal.language')}</Label>
                          <Select
                            value={newClient.language}
                            onValueChange={(value) =>
                              setNewClient({ ...newClient, language: value })
                            }
                          >
                            <SelectTrigger id="language">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="fr">{t('languages.french')}</SelectItem>
                              <SelectItem value="en">{t('languages.english')}</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label htmlFor="theme">{t('clients.modal.theme')}</Label>
                          <Select
                            value={newClient.theme}
                            onValueChange={(value) =>
                              setNewClient({ ...newClient, theme: value })
                            }
                          >
                            <SelectTrigger id="theme">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="light">{t('clients.modal.themeLight')}</SelectItem>
                              <SelectItem value="dark">{t('clients.modal.themeDark')}</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      <div>
                        <Label htmlFor="agent">{t('clients.modal.assignAgent')}</Label>
                        <Select
                          value={newClient.assignedAgentId}
                          onValueChange={(value) =>
                            setNewClient({ ...newClient, assignedAgentId: value })
                          }
                        >
                          <SelectTrigger id="agent">
                            <SelectValue placeholder={t('clients.modal.chooseAgent')} />
                          </SelectTrigger>
                          <SelectContent>
                            {agents?.map((agent) => (
                              <SelectItem key={agent.id} value={agent.id}>
                                {agent.platform.toUpperCase()} - {agent.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <Button onClick={handleCreate} className="w-full">
                        {t('clients.modal.createButton')}
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Client limit banner (only for non-super admins) */}
        {!isSuperAdmin && (
          <div className="mb-2">
            <ClientLimitBanner />
          </div>
        )}

        {/* Dashboard avec statistiques */}
        <ClientsDashboard />

        {/* Premium Table Section */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.5 }}
          className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-card/95 via-card to-card/90 border border-border/50 shadow-xl p-6 space-y-6"
        >
          {/* Background decorations */}
          <div className="absolute -right-10 -bottom-10 w-40 h-40 rounded-full bg-gradient-to-br from-primary/5 to-transparent blur-2xl" />
          
          <div className="relative z-10">
            {/* Filters */}
            <ClientFilters
              search={search}
              onSearchChange={setSearch}
              statusFilter={statusFilter}
              onStatusFilterChange={setStatusFilter}
              sortField={sortField}
              sortOrder={sortOrder}
              onSortChange={handleSortChange}
              totalCount={clients?.length || 0}
              filteredCount={filteredClients.length}
            />
          </div>

          {/* Table */}
          <div className="relative z-10 border border-border/30 rounded-xl overflow-hidden bg-card/50 backdrop-blur-sm shadow-inner">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30 hover:bg-muted/30 border-b border-border/30">
                  <TableHead className="font-semibold text-foreground/80">{t('clients.table.client')}</TableHead>
                  <TableHead className="font-semibold text-foreground/80">{t('clients.table.loginId')}</TableHead>
                  <TableHead className="font-semibold text-foreground/80">{t('clients.table.assignedAgent')}</TableHead>
                  <TableHead className="font-semibold text-foreground/80">{t('clients.table.agentIdElevenlabs')}</TableHead>
                  <TableHead className="font-semibold text-foreground/80">{t('clients.table.status')}</TableHead>
                  <TableHead className="font-semibold text-foreground/80">{t('clients.table.createdAt')}</TableHead>
                  <TableHead className="text-right font-semibold text-foreground/80">{t('clients.table.actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-12">
                      <div className="flex items-center justify-center gap-2 text-muted-foreground">
                        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary"></div>
                        {t('clients.loading')}
                      </div>
                    </TableCell>
                  </TableRow>
                ) : filteredClients.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-12">
                      <div className="text-muted-foreground">
                        {clients?.length === 0
                          ? t('clients.empty.description')
                          : t('common.noResults')}
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredClients.map((client, index) => (
                    <motion.tr
                      key={client.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.03 }}
                      className="group hover:bg-primary/5 transition-colors"
                    >
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="relative">
                            <ClientAvatar name={client.name} />
                            <div className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-background ${client.status === 'active' ? 'bg-green-500' : 'bg-gray-400'}`} />
                          </div>
                          <div>
                            <div className="font-medium group-hover:text-primary transition-colors">{client.name}</div>
                            <div className="text-sm text-muted-foreground">{client.email}</div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        {client.login_id || client.username ? (
                          <code className="text-xs bg-primary/10 text-primary px-2 py-1 rounded font-mono border border-primary/20">
                            {client.login_id || client.username}
                          </code>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {client.assigned_agent ? (
                          <div className="flex items-center gap-2">
                            <PlatformBadge platform={client.assigned_agent.platform} />
                            <span className="text-sm font-medium">{client.assigned_agent.name}</span>
                          </div>
                        ) : (
                          <Badge variant="outline" className="text-muted-foreground border-dashed">
                            <Bot className="h-3 w-3 mr-1" />
                            {t('common.noData')}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {client.assigned_agent && (client.assigned_agent as any).config?.agent_id ? (
                          <code className="text-xs bg-secondary/50 px-2 py-1 rounded font-mono">
                            {(client.assigned_agent as any).config.agent_id}
                          </code>
                        ) : client.assigned_agent && (client.assigned_agent as any).platform_agent_id ? (
                          <code className="text-xs bg-secondary/50 px-2 py-1 rounded font-mono">
                            {(client.assigned_agent as any).platform_agent_id}
                          </code>
                        ) : (
                          <span className="text-muted-foreground text-xs">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={client.status === 'active' ? 'default' : 'secondary'}
                          className={
                            client.status === 'active'
                              ? 'bg-gradient-to-r from-green-500/20 to-emerald-500/20 text-green-600 border-green-500/30 shadow-sm'
                              : 'bg-gray-500/10 text-gray-500 border-gray-500/20'
                          }
                        >
                          <span className={`mr-1.5 h-1.5 w-1.5 rounded-full ${client.status === 'active' ? 'bg-green-500 animate-pulse' : 'bg-gray-400'}`} />
                          {client.status === 'active' ? t('common.active') : t('common.inactive')}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {new Date(client.created_at).toLocaleDateString(language === 'fr' ? 'fr-FR' : 'en-US', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="bg-popover border-border">
                            <DropdownMenuItem onClick={() => handleOpenMembers(client)}>
                              <Users className="mr-2 h-4 w-4" />
                              {t('clients.actions.manageMembers')}
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => navigate(`/clients/${client.id}`)}>
                              <Edit className="mr-2 h-4 w-4" />
                              {t('common.edit')}
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => navigate(`/clients/${client.id}?tab=access`)}>
                              <Key className="mr-2 h-4 w-4" />
                              {t('auth.buttons.forgotPassword')}
                            </DropdownMenuItem>
                            {client.assigned_agent && (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem 
                                  onClick={() => window.open(`/portal/${(client.assigned_agent as any).slug || (client.assigned_agent as any).id}`, '_blank')}
                                >
                                  <ExternalLink className="mr-2 h-4 w-4" />
                                  {t('clients.actions.accessPortal')}
                                </DropdownMenuItem>
                              </>
                            )}
                            <DropdownMenuItem
                              onClick={() =>
                                toggleStatusMutation.mutate({
                                  clientId: client.id,
                                  newStatus: client.status === 'active' ? 'inactive' : 'active',
                                })
                              }
                            >
                              {client.status === 'active' ? t('clients.actions.deactivate') : t('clients.actions.activate')}
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onClick={() => deleteClientMutation.mutate(client.id)}
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              {t('clients.actions.delete')}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </motion.tr>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </motion.div>
      </div>

      {/* Client Members Modal */}
      {selectedClient && (
        <ClientMembersModal
          open={membersModalOpen}
          onOpenChange={setMembersModalOpen}
          clientId={selectedClient.id}
          clientName={selectedClient.name}
          enforceMemberLimit={false}
        />
      )}
    </AppLayout>
  );
}
