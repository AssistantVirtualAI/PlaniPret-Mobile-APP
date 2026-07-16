import { useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useLeads } from '@/hooks/useLeads';
import { useTranslation } from '@/hooks/useTranslation';
import { LeadsTable } from '@/components/leads/LeadsTable';
import { LeadFilters } from '@/components/leads/LeadFilters';
import { LeadsCharts } from '@/components/leads/LeadsCharts';
import { AddLeadModal } from '@/components/leads/AddLeadModal';
import { Plus, Users, UserCheck, Phone, Trophy, XCircle, BarChart3, UserPlus } from 'lucide-react';
import { TableSkeleton } from '@/components/LoadingSkeleton';

export default function Leads() {
  const { t } = useTranslation();
  const { leads, stats, isLoading } = useLeads();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [showCharts, setShowCharts] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [sourceFilter, setSourceFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const filteredLeads = leads.filter(lead => {
    const matchesStatus = statusFilter === 'all' || lead.status === statusFilter;
    const matchesSource = sourceFilter === 'all' || lead.source === sourceFilter;
    const matchesSearch = !searchQuery || 
      lead.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      lead.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      lead.phone?.includes(searchQuery);
    return matchesStatus && matchesSource && matchesSearch;
  });

  const sources = [...new Set(leads.map(l => l.source).filter(Boolean))];

  const statCards = [
    { label: t('leads.stats.total'), value: stats.total, icon: Users, color: 'text-foreground' },
    { label: t('leads.stats.new'), value: stats.new, icon: UserPlus, color: 'text-blue-500' },
    { label: t('leads.stats.qualified'), value: stats.qualified, icon: UserCheck, color: 'text-yellow-500' },
    { label: t('leads.stats.contacted'), value: stats.contacted, icon: Phone, color: 'text-purple-500' },
    { label: t('leads.stats.converted'), value: stats.converted, icon: Trophy, color: 'text-green-500' },
    { label: t('leads.stats.lost'), value: stats.lost, icon: XCircle, color: 'text-red-500' },
  ];

  if (isLoading) {
    return (
      <AppLayout>
        <div className="p-6 space-y-6">
          <h1 className="text-3xl font-bold">{t('leads.title')}</h1>
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
            <h1 className="text-3xl font-bold">{t('leads.title')}</h1>
            <p className="text-muted-foreground mt-1">
              {t('leads.description')}
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setShowCharts(!showCharts)}>
              <BarChart3 className="mr-2 h-4 w-4" />
              {showCharts ? t('leads.hide') : t('leads.charts')}
            </Button>
            <Button onClick={() => setIsModalOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              {t('leads.newLead')}
            </Button>
          </div>
        </div>

        {/* Charts */}
        {showCharts && <LeadsCharts leads={leads} />}

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {statCards.map((stat) => {
            const Icon = stat.icon;
            return (
              <Card key={stat.label} className="glass-card">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg bg-card/50 ${stat.color}`}>
                      <Icon className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold">{stat.value}</p>
                      <p className="text-xs text-muted-foreground">{stat.label}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Filters */}
        <LeadFilters
          statusFilter={statusFilter}
          onStatusChange={setStatusFilter}
          sourceFilter={sourceFilter}
          onSourceChange={setSourceFilter}
          sources={sources as string[]}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
        />

        {/* Table */}
        <LeadsTable leads={filteredLeads} />

        <AddLeadModal open={isModalOpen} onOpenChange={setIsModalOpen} />
      </div>
    </AppLayout>
  );
}
