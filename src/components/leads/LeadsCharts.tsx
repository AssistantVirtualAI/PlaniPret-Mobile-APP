import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import { Lead } from '@/hooks/useLeads';
import { format, subDays, startOfDay, eachDayOfInterval } from 'date-fns';
import { fr } from 'date-fns/locale';

interface LeadsChartsProps {
  leads: Lead[];
}

const STATUS_COLORS = {
  new: 'hsl(var(--primary))',
  qualified: 'hsl(45, 93%, 47%)',
  contacted: 'hsl(280, 87%, 65%)',
  converted: 'hsl(142, 76%, 36%)',
  lost: 'hsl(0, 84%, 60%)',
};

const STATUS_LABELS = {
  new: 'Nouveaux',
  qualified: 'Qualifiés',
  contacted: 'Contactés',
  converted: 'Convertis',
  lost: 'Perdus',
};

export function LeadsCharts({ leads }: LeadsChartsProps) {
  const timeSeriesData = useMemo(() => {
    const today = new Date();
    const thirtyDaysAgo = subDays(today, 30);
    const days = eachDayOfInterval({ start: thirtyDaysAgo, end: today });

    return days.map(day => {
      const dayStart = startOfDay(day);
      const dayEnd = new Date(dayStart);
      dayEnd.setHours(23, 59, 59, 999);

      const dayLeads = leads.filter(lead => {
        const createdAt = new Date(lead.created_at);
        return createdAt >= dayStart && createdAt <= dayEnd;
      });

      return {
        date: format(day, 'dd MMM', { locale: fr }),
        new: dayLeads.filter(l => l.status === 'new').length,
        qualified: dayLeads.filter(l => l.status === 'qualified').length,
        contacted: dayLeads.filter(l => l.status === 'contacted').length,
        converted: dayLeads.filter(l => l.status === 'converted').length,
        lost: dayLeads.filter(l => l.status === 'lost').length,
        total: dayLeads.length,
      };
    });
  }, [leads]);

  const pieData = useMemo(() => {
    const statuses = ['new', 'qualified', 'contacted', 'converted', 'lost'] as const;
    return statuses.map(status => ({
      name: STATUS_LABELS[status],
      value: leads.filter(l => l.status === status).length,
      color: STATUS_COLORS[status],
    })).filter(d => d.value > 0);
  }, [leads]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="text-lg">Évolution des leads (30 jours)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={timeSeriesData}>
                <defs>
                  <linearGradient id="colorNew" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={STATUS_COLORS.new} stopOpacity={0.8}/>
                    <stop offset="95%" stopColor={STATUS_COLORS.new} stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorConverted" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={STATUS_COLORS.converted} stopOpacity={0.8}/>
                    <stop offset="95%" stopColor={STATUS_COLORS.converted} stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis 
                  dataKey="date" 
                  stroke="hsl(var(--muted-foreground))"
                  fontSize={12}
                  tickLine={false}
                />
                <YAxis 
                  stroke="hsl(var(--muted-foreground))"
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip 
                  contentStyle={{
                    backgroundColor: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px',
                    color: 'hsl(var(--foreground))'
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="new"
                  name="Nouveaux"
                  stackId="1"
                  stroke={STATUS_COLORS.new}
                  fillOpacity={1}
                  fill="url(#colorNew)"
                />
                <Area
                  type="monotone"
                  dataKey="qualified"
                  name="Qualifiés"
                  stackId="1"
                  stroke={STATUS_COLORS.qualified}
                  fill={STATUS_COLORS.qualified}
                  fillOpacity={0.6}
                />
                <Area
                  type="monotone"
                  dataKey="contacted"
                  name="Contactés"
                  stackId="1"
                  stroke={STATUS_COLORS.contacted}
                  fill={STATUS_COLORS.contacted}
                  fillOpacity={0.6}
                />
                <Area
                  type="monotone"
                  dataKey="converted"
                  name="Convertis"
                  stackId="1"
                  stroke={STATUS_COLORS.converted}
                  fillOpacity={1}
                  fill="url(#colorConverted)"
                />
                <Area
                  type="monotone"
                  dataKey="lost"
                  name="Perdus"
                  stackId="1"
                  stroke={STATUS_COLORS.lost}
                  fill={STATUS_COLORS.lost}
                  fillOpacity={0.6}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="text-lg">Répartition par statut</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[300px]">
            {pieData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                    outerRadius={100}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {pieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip 
                    contentStyle={{
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                      color: 'hsl(var(--foreground))'
                    }}
                  />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-full text-muted-foreground">
                Aucune donnée disponible
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
