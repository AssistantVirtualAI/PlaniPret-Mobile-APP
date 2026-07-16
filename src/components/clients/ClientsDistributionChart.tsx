import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { PieChartIcon, Sparkles } from 'lucide-react';
import { useClientsDistribution } from '@/hooks/useClientsDistribution';

export function ClientsDistributionChart() {
  const { data: distribution, isLoading } = useClientsDistribution();

  if (isLoading) {
    return (
      <Card className="relative overflow-hidden border-0 bg-gradient-to-br from-card/90 via-card to-card/80 backdrop-blur-xl shadow-xl h-full">
        <CardHeader className="pb-2">
          <Skeleton className="h-5 w-40" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[180px] w-full rounded-xl" />
        </CardContent>
      </Card>
    );
  }

  if (!distribution?.length) {
    return (
      <Card className="relative overflow-hidden border-0 bg-gradient-to-br from-card/90 via-card to-card/80 backdrop-blur-xl shadow-xl h-full">
        {/* Decorative gradient */}
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-secondary/5 opacity-50" />
        <div className="absolute -right-6 -top-6 w-24 h-24 rounded-full bg-gradient-to-br from-white/5 to-transparent blur-2xl" />
        
        <CardHeader className="pb-2 relative">
          <CardTitle className="text-sm flex items-center gap-2 font-medium">
            <div className="p-2 rounded-xl bg-gradient-to-br from-primary/20 to-secondary/20">
              <PieChartIcon className="h-4 w-4 text-primary" />
            </div>
            Répartition par Agent
          </CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-center h-[180px] relative">
          <div className="text-center space-y-2">
            <div className="p-4 rounded-2xl bg-muted/30 inline-block">
              <Sparkles className="h-8 w-8 text-muted-foreground/50" />
            </div>
            <p className="text-muted-foreground text-sm">Aucune donnée disponible</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const totalClients = distribution.reduce((sum, item) => sum + item.count, 0);

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      const percentage = ((data.count / totalClients) * 100).toFixed(1);
      return (
        <div className="bg-popover/95 backdrop-blur-xl border border-border/50 rounded-xl shadow-2xl p-4">
          <p className="font-semibold text-sm">{data.agentName}</p>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-2xl font-bold">{data.count}</span>
            <span className="text-xs text-muted-foreground">
              client{data.count > 1 ? 's' : ''} ({percentage}%)
            </span>
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <Card className="relative overflow-hidden border-0 bg-gradient-to-br from-card/90 via-card to-card/80 backdrop-blur-xl shadow-xl hover:shadow-2xl transition-all duration-500 h-full">
      {/* Decorative gradient */}
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-secondary/5 opacity-50" />
      <div className="absolute -right-6 -top-6 w-24 h-24 rounded-full bg-gradient-to-br from-white/5 to-transparent blur-2xl" />
      <div className="absolute -left-3 -bottom-3 w-16 h-16 rounded-full bg-gradient-to-tr from-white/3 to-transparent blur-xl" />
      
      <CardHeader className="pb-0 relative">
        <CardTitle className="text-sm flex items-center gap-2 font-medium">
          <div className="p-2 rounded-xl bg-gradient-to-br from-primary/20 to-secondary/20">
            <PieChartIcon className="h-4 w-4 text-primary" />
          </div>
          Répartition
        </CardTitle>
      </CardHeader>
      <CardContent className="relative pt-2">
        <div className="flex items-center gap-4">
          <ResponsiveContainer width={120} height={120}>
            <PieChart>
              <Pie
                data={distribution}
                cx="50%"
                cy="50%"
                innerRadius={35}
                outerRadius={55}
                paddingAngle={3}
                dataKey="count"
                nameKey="agentName"
                strokeWidth={0}
              >
                {distribution.map((entry, index) => (
                  <Cell 
                    key={`cell-${index}`} 
                    fill={entry.color}
                    className="drop-shadow-md hover:opacity-80 transition-opacity cursor-pointer"
                  />
                ))}
              </Pie>
              <Tooltip content={<CustomTooltip />} />
            </PieChart>
          </ResponsiveContainer>
          
          <div className="flex-1 min-w-0">
            <div className="text-center mb-2">
              <p className="text-3xl font-bold bg-gradient-to-br from-foreground to-foreground/70 bg-clip-text text-transparent">
                {totalClients}
              </p>
              <p className="text-xs text-muted-foreground">clients total</p>
            </div>
            
            {/* Compact legend */}
            <div className="space-y-1">
              {distribution.slice(0, 3).map((entry, index) => (
                <div key={index} className="flex items-center gap-2 text-xs">
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ backgroundColor: entry.color }}
                  />
                  <span className="text-muted-foreground truncate">{entry.agentName}</span>
                  <span className="font-medium ml-auto">{entry.count}</span>
                </div>
              ))}
              {distribution.length > 3 && (
                <p className="text-xs text-muted-foreground/60">+{distribution.length - 3} autres</p>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}