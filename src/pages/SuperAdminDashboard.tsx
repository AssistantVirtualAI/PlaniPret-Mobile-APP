import { AppLayout } from '@/components/layout/AppLayout';
import { usePermissions } from '@/hooks/usePermissions';
import { useSuperAdminStats } from '@/hooks/useSuperAdminStats';
import { useLanguage } from '@/context/LanguageContext';
import { Navigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { 
  Building2, Users, CreditCard, TrendingUp, AlertTriangle, 
  Crown, RefreshCw, Search, ArrowUpRight, Clock, CheckCircle2,
  XCircle, Shield
} from 'lucide-react';
import { motion } from 'framer-motion';
import { format } from 'date-fns';
import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { KeyRound } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';

const SuperAdminDashboard = () => {
  const { isSuperAdmin } = usePermissions();
  const { language } = useLanguage();
  const { stats, organizations, isLoading, refetch } = useSuperAdminStats();
  const [searchQuery, setSearchQuery] = useState('');
  const [unifying, setUnifying] = useState(false);

  const handleUnifyPasswords = async () => {
    if (!confirm('This will overwrite the portal login password of every activated user with their current phone (SIP) password, so the same password works on portal, desktop, mobile and the phone. Continue?')) return;
    setUnifying(true);
    try {
      const { data, error } = await supabase.functions.invoke('unify-passwords-backfill', { body: {} });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).message || (data as any).error);
      const d: any = data;
      toast.success(`Unified ${d.updated}/${d.total} users (${d.skipped} skipped, ${d.errors?.length || 0} errors)`);
    } catch (e: any) {
      toast.error(e?.message || 'Failed to unify passwords');
    } finally {
      setUnifying(false);
    }
  };

  const texts = {
    title: language === 'fr' ? 'Tableau de bord Super Admin' : 'Super Admin Dashboard',
    description: language === 'fr' 
      ? 'Gérez toutes les organisations et abonnements'
      : 'Manage all organizations and subscriptions',
    organizations: {
      title: language === 'fr' ? 'Organisations' : 'Organizations',
      total: language === 'fr' ? 'Total Organisations' : 'Total Organizations',
      active: language === 'fr' ? 'Actives' : 'Active',
      inactive: language === 'fr' ? 'Inactives' : 'Inactive',
      thisMonth: language === 'fr' ? 'Ce mois' : 'This Month',
      thisWeek: language === 'fr' ? 'Cette semaine' : 'This Week',
      today: language === 'fr' ? 'Aujourd\'hui' : 'Today',
    },
    subscriptions: {
      title: language === 'fr' ? 'Abonnements' : 'Subscriptions',
      active: language === 'fr' ? 'Abonnements Actifs' : 'Active Subscriptions',
      trials: language === 'fr' ? 'Essais Actifs' : 'Active Trials',
      expiringSoon: language === 'fr' ? 'Essais Expirant Bientôt' : 'Trials Expiring Soon',
      byPlan: language === 'fr' ? 'Par Plan' : 'By Plan',
    },
    table: {
      organization: language === 'fr' ? 'Organisation' : 'Organization',
      plan: language === 'fr' ? 'Plan' : 'Plan',
      status: language === 'fr' ? 'Statut' : 'Status',
      created: language === 'fr' ? 'Créée le' : 'Created',
      trialEnds: language === 'fr' ? 'Fin essai' : 'Trial Ends',
      clients: language === 'fr' ? 'Clients' : 'Clients',
      actions: language === 'fr' ? 'Actions' : 'Actions',
    },
    charts: {
      organizationsGrowth: language === 'fr' ? 'Croissance des Organisations' : 'Organizations Growth',
      planDistribution: language === 'fr' ? 'Distribution des Plans' : 'Plan Distribution',
    },
    search: language === 'fr' ? 'Rechercher organisations...' : 'Search organizations...',
    refresh: language === 'fr' ? 'Actualiser' : 'Refresh',
    accessDenied: language === 'fr' ? 'Accès Refusé' : 'Access Denied',
    accessDeniedDesc: language === 'fr' 
      ? 'Vous devez être Super Admin pour accéder à cette page'
      : 'You must be a Super Admin to access this page',
    viewDetails: language === 'fr' ? 'Voir détails' : 'View Details',
    noOrganizations: language === 'fr' ? 'Aucune organisation' : 'No organizations',
  };

  // Check super admin access - show loading state while fetching stats
  if (isLoading && organizations.length === 0) {
    return (
      <AppLayout>
        <div className="space-y-6">
          <Skeleton className="h-12 w-96" />
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-32" />)}
          </div>
        </div>
      </AppLayout>
    );
  }

  // Check super admin access
  if (!isSuperAdmin) {
    return <Navigate to="/dashboard" replace />;
  }

  const PLAN_COLORS: Record<string, string> = {
    trial: 'hsl(var(--warning))',
    starter: 'hsl(var(--primary))',
    growth: 'hsl(var(--secondary))',
    ultimate: 'hsl(var(--accent))',
    enterprise: 'hsl(var(--destructive))',
  };

  const planDistributionData = Object.entries(stats?.planDistribution || {}).map(([name, value]) => ({
    name: name.charAt(0).toUpperCase() + name.slice(1),
    value,
    color: PLAN_COLORS[name] || 'hsl(var(--muted))',
  }));

  const filteredOrganizations = organizations.filter(org => 
    org.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    org.slug?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getStatusBadge = (status: string | null) => {
    if (!status) return <Badge variant="outline" className="text-muted-foreground">N/A</Badge>;
    
    switch (status) {
      case 'active':
        return <Badge className="bg-success/20 text-success border-success/30"><CheckCircle2 className="w-3 h-3 mr-1" /> Active</Badge>;
      case 'trialing':
        return <Badge className="bg-warning/20 text-warning border-warning/30"><Clock className="w-3 h-3 mr-1" /> Trial</Badge>;
      case 'canceled':
        return <Badge className="bg-destructive/20 text-destructive border-destructive/30"><XCircle className="w-3 h-3 mr-1" /> Canceled</Badge>;
      case 'past_due':
        return <Badge className="bg-destructive/20 text-destructive border-destructive/30"><AlertTriangle className="w-3 h-3 mr-1" /> Past Due</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getPlanBadge = (plan: string | null) => {
    if (!plan) return <Badge variant="outline">Free</Badge>;
    
    const planColors: Record<string, string> = {
      starter: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
      growth: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
      ultimate: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
      enterprise: 'bg-rose-500/20 text-rose-400 border-rose-500/30',
    };
    
    return (
      <Badge className={planColors[plan] || 'bg-muted'}>
        {plan === 'ultimate' && <Crown className="w-3 h-3 mr-1" />}
        {plan.charAt(0).toUpperCase() + plan.slice(1)}
      </Badge>
    );
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col md:flex-row md:items-center md:justify-between gap-4"
        >
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/20">
              <Shield className="w-8 h-8 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
                {texts.title}
                <Badge className="bg-gradient-to-r from-amber-500 to-orange-500 text-white border-0">
                  <Crown className="w-3 h-3 mr-1" />
                  Super Admin
                </Badge>
              </h1>
              <p className="text-muted-foreground">{texts.description}</p>
            </div>
          </div>
          
          <div className="flex gap-2">
            <Button onClick={handleUnifyPasswords} disabled={unifying} variant="outline" className="gap-2">
              <KeyRound className={`w-4 h-4 ${unifying ? 'animate-pulse' : ''}`} />
              {unifying ? 'Unifying…' : 'Unify Passwords'}
            </Button>
            <Button onClick={() => refetch()} variant="outline" className="gap-2">
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
              {texts.refresh}
            </Button>
          </div>
        </motion.div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
            <Card className="bg-gradient-to-br from-blue-500/10 to-blue-500/5 border-blue-500/20">
              <CardHeader className="pb-2">
                <CardDescription className="flex items-center gap-2">
                  <Building2 className="w-4 h-4" />
                  {texts.organizations.total}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{stats?.totalOrganizations || 0}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  +{stats?.newThisMonth || 0} {texts.organizations.thisMonth.toLowerCase()}
                </p>
              </CardContent>
            </Card>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
            <Card className="bg-gradient-to-br from-green-500/10 to-green-500/5 border-green-500/20">
              <CardHeader className="pb-2">
                <CardDescription className="flex items-center gap-2">
                  <CreditCard className="w-4 h-4" />
                  {texts.subscriptions.active}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{stats?.activeSubscriptions || 0}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  {stats?.activeOrganizations || 0} {texts.organizations.active.toLowerCase()}
                </p>
              </CardContent>
            </Card>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
            <Card className="bg-gradient-to-br from-amber-500/10 to-amber-500/5 border-amber-500/20">
              <CardHeader className="pb-2">
                <CardDescription className="flex items-center gap-2">
                  <Clock className="w-4 h-4" />
                  {texts.subscriptions.trials}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{stats?.activeTrials || 0}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  {stats?.trialsExpiringSoon || 0} {texts.subscriptions.expiringSoon.toLowerCase()}
                </p>
              </CardContent>
            </Card>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}>
            <Card className="bg-gradient-to-br from-purple-500/10 to-purple-500/5 border-purple-500/20">
              <CardHeader className="pb-2">
                <CardDescription className="flex items-center gap-2">
                  <Users className="w-4 h-4" />
                  {language === 'fr' ? 'Utilisateurs actifs' : 'Active Users'}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{stats?.totalMembers || 0}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  {stats?.totalClients || 0} {language === 'fr' ? 'clients' : 'clients'} · {(stats?.totalCreditsUsed || 0).toLocaleString()} {language === 'fr' ? 'crédits utilisés' : 'credits used'}
                </p>
              </CardContent>
            </Card>
          </motion.div>
        </div>

        {/* Charts Row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-primary" />
                  {texts.charts.organizationsGrowth}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-[250px]">
                  {stats?.growthData && stats.growthData.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={stats.growthData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis dataKey="month" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                        <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
                        <Tooltip 
                          contentStyle={{ 
                            backgroundColor: 'hsl(var(--card))', 
                            border: '1px solid hsl(var(--border))',
                            borderRadius: '8px'
                          }} 
                        />
                        <Line 
                          type="monotone" 
                          dataKey="organizations" 
                          stroke="hsl(var(--primary))" 
                          strokeWidth={2}
                          dot={{ fill: 'hsl(var(--primary))' }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="flex items-center justify-center h-full text-muted-foreground">
                      {language === 'fr' ? 'Pas assez de données' : 'Not enough data'}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 }}>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CreditCard className="w-5 h-5 text-primary" />
                  {texts.charts.planDistribution}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-[250px]">
                  {planDistributionData.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={planDistributionData}
                          cx="50%"
                          cy="50%"
                          innerRadius={60}
                          outerRadius={90}
                          paddingAngle={2}
                          dataKey="value"
                          label={({ name, value }) => `${name}: ${value}`}
                        >
                          {planDistributionData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip 
                          contentStyle={{ 
                            backgroundColor: 'hsl(var(--card))', 
                            border: '1px solid hsl(var(--border))',
                            borderRadius: '8px'
                          }} 
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="flex items-center justify-center h-full text-muted-foreground">
                      {language === 'fr' ? 'Pas de données' : 'No data'}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </div>

        {/* Organizations Table */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.7 }}>
          <Card>
            <CardHeader>
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Building2 className="w-5 h-5 text-primary" />
                    {texts.organizations.title}
                  </CardTitle>
                  <CardDescription>
                    {filteredOrganizations.length} {language === 'fr' ? 'organisations trouvées' : 'organizations found'}
                  </CardDescription>
                </div>
                <div className="relative w-full md:w-72">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder={texts.search}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9"
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-4">
                  {[1, 2, 3].map(i => <Skeleton key={i} className="h-16" />)}
                </div>
              ) : filteredOrganizations.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  {texts.noOrganizations}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{texts.table.organization}</TableHead>
                        <TableHead>{texts.table.plan}</TableHead>
                        <TableHead>{texts.table.status}</TableHead>
                        <TableHead>{texts.table.created}</TableHead>
                        <TableHead className="text-right">{language === 'fr' ? 'Membres' : 'Members'}</TableHead>
                        <TableHead className="text-right">{texts.table.clients}</TableHead>
                        <TableHead className="text-right">{language === 'fr' ? 'Usage' : 'Usage'}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredOrganizations.map((org) => (
                        <TableRow key={org.id} className="hover:bg-muted/50">
                          <TableCell>
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                                <Building2 className="w-5 h-5 text-primary" />
                              </div>
                              <div>
                                <div className="font-medium">{org.name}</div>
                                <div className="text-xs text-muted-foreground">@{org.slug}</div>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>{getPlanBadge(org.billing_config?.plan_tier)}</TableCell>
                          <TableCell>{getStatusBadge(org.billing_config?.subscription_status)}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {format(new Date(org.created_at), 'MMM d, yyyy')}
                          </TableCell>
                          <TableCell className="text-right">
                            <Badge variant="outline">{(org as any).member_count || 0}</Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <Badge variant="outline">{org.client_count || 0}</Badge>
                          </TableCell>
                          <TableCell className="text-right text-sm text-muted-foreground">
                            {(org.billing_config as any)?.credits_used ?? 0}
                            {(org.billing_config as any)?.credits_limit
                              ? ` / ${(org.billing_config as any).credits_limit}`
                              : ''}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </AppLayout>
  );
};

export default SuperAdminDashboard;
