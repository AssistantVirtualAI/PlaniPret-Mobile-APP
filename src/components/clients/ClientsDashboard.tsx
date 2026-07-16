import { Users, Bot, MessageSquare, TrendingUp, Sparkles, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useClientsMetrics } from '@/hooks/useClientsMetrics';
import { ClientsDistributionChart } from './ClientsDistributionChart';
import { motion } from 'framer-motion';

export function ClientsDashboard() {
  const { data: metrics, isLoading } = useClientsMetrics();

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
          {[...Array(5)].map((_, i) => (
            <Card key={i} className="relative overflow-hidden border-0 bg-gradient-to-br from-card/80 to-card shadow-xl">
              <CardContent className="p-6">
                <div className="flex flex-col gap-4">
                  <Skeleton className="h-12 w-12 rounded-2xl" />
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-8 w-16" />
                    <Skeleton className="h-3 w-32" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  const stats = [
    {
      title: 'Total Clients',
      value: metrics?.totalClients || 0,
      subtitle: `${metrics?.activeClients || 0} actifs`,
      secondarySubtitle: `${metrics?.inactiveClients || 0} inactifs`,
      icon: Users,
      gradient: 'from-blue-500 via-blue-600 to-cyan-500',
      bgGradient: 'from-blue-500/10 via-blue-600/5 to-transparent',
      trend: metrics?.activeClients && metrics?.totalClients 
        ? Math.round((metrics.activeClients / metrics.totalClients) * 100) 
        : 0,
      trendUp: true,
    },
    {
      title: 'Agents Assignés',
      value: metrics?.assignedAgents || 0,
      subtitle: metrics?.totalClients 
        ? `${Math.round(((metrics.totalClients - (metrics?.clientsWithoutAgent || 0)) / metrics.totalClients) * 100)}% couverture`
        : '0% couverture',
      secondarySubtitle: `${metrics?.clientsWithoutAgent || 0} sans agent`,
      icon: Bot,
      gradient: 'from-violet-500 via-purple-600 to-fuchsia-500',
      bgGradient: 'from-violet-500/10 via-purple-600/5 to-transparent',
      trend: metrics?.totalClients 
        ? Math.round(((metrics.totalClients - (metrics?.clientsWithoutAgent || 0)) / metrics.totalClients) * 100)
        : 0,
      trendUp: true,
    },
    {
      title: 'Conversations',
      value: metrics?.totalConversations || 0,
      subtitle: `${metrics?.resolvedConversations || 0} résolues`,
      secondarySubtitle: 'ce mois-ci',
      icon: MessageSquare,
      gradient: 'from-emerald-500 via-green-600 to-teal-500',
      bgGradient: 'from-emerald-500/10 via-green-600/5 to-transparent',
      trend: metrics?.totalConversations && metrics?.resolvedConversations
        ? Math.round((metrics.resolvedConversations / metrics.totalConversations) * 100)
        : 0,
      trendUp: true,
    },
    {
      title: 'Performance',
      value: metrics?.totalConversations 
        ? `${Math.round((metrics?.resolvedConversations || 0) / metrics.totalConversations * 100)}%`
        : '0%',
      subtitle: `${(metrics?.avgDuration || 0).toFixed(1)} min`,
      secondarySubtitle: 'durée moyenne',
      icon: TrendingUp,
      gradient: 'from-amber-500 via-orange-500 to-rose-500',
      bgGradient: 'from-amber-500/10 via-orange-500/5 to-transparent',
      trend: metrics?.totalConversations 
        ? Math.round((metrics?.resolvedConversations || 0) / metrics.totalConversations * 100)
        : 0,
      trendUp: true,
    },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
        {/* Stats Cards */}
        {stats.map((stat, index) => (
          <motion.div
            key={index}
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ delay: index * 0.1, duration: 0.4, ease: "easeOut" }}
          >
            <Card className="relative overflow-hidden border-0 bg-gradient-to-br from-card/90 via-card to-card/80 backdrop-blur-xl shadow-xl hover:shadow-2xl transition-all duration-500 group hover:-translate-y-1">
              {/* Gradient background overlay */}
              <div className={`absolute inset-0 bg-gradient-to-br ${stat.bgGradient} opacity-50 group-hover:opacity-70 transition-opacity duration-500`} />
              
              {/* Decorative elements */}
              <div className="absolute -right-6 -top-6 w-24 h-24 rounded-full bg-gradient-to-br from-white/5 to-transparent blur-2xl" />
              <div className="absolute -left-3 -bottom-3 w-16 h-16 rounded-full bg-gradient-to-tr from-white/3 to-transparent blur-xl" />
              
              <CardContent className="relative p-6">
                <div className="flex flex-col gap-4">
                  {/* Icon with premium gradient */}
                  <div className="relative">
                    <div className={`p-3.5 rounded-2xl bg-gradient-to-br ${stat.gradient} shadow-lg shadow-${stat.gradient.split('-')[1]}/20`}>
                      <stat.icon className="h-6 w-6 text-white" />
                    </div>
                    <div className={`absolute -inset-1 bg-gradient-to-br ${stat.gradient} opacity-30 blur-lg rounded-2xl -z-10`} />
                  </div>
                  
                  {/* Content */}
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-muted-foreground/80">{stat.title}</p>
                    <div className="flex items-baseline gap-2">
                      <p className="text-3xl font-bold tracking-tight bg-gradient-to-br from-foreground to-foreground/70 bg-clip-text text-transparent">
                        {stat.value}
                      </p>
                      {stat.trend > 0 && (
                        <span className={`flex items-center text-xs font-semibold ${stat.trendUp ? 'text-emerald-500' : 'text-rose-500'}`}>
                          {stat.trendUp ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                          {stat.trend}%
                        </span>
                      )}
                    </div>
                    <div className="flex flex-col">
                      <p className="text-xs text-muted-foreground">{stat.subtitle}</p>
                      <p className="text-xs text-muted-foreground/60">{stat.secondarySubtitle}</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
        
        {/* Distribution Chart */}
        <motion.div
          initial={{ opacity: 0, y: 20, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ delay: 0.4, duration: 0.4, ease: "easeOut" }}
        >
          <ClientsDistributionChart />
        </motion.div>
      </div>
    </div>
  );
}