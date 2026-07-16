import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { BarChart3, TrendingUp, RefreshCw } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar } from "recharts";

const generateData = () => {
  const days = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
  return days.map((day) => ({
    name: day,
    conversations: Math.floor(Math.random() * 100) + 20,
    duration: Math.floor(Math.random() * 300) + 60,
    satisfaction: Math.floor(Math.random() * 30) + 70,
  }));
};

export const AnalyticsDemo = () => {
  const [data, setData] = useState(generateData);
  const [chartType, setChartType] = useState<"area" | "bar">("area");
  const [metric, setMetric] = useState<"conversations" | "duration" | "satisfaction">("conversations");
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await new Promise((resolve) => setTimeout(resolve, 500));
    setData(generateData());
    setIsRefreshing(false);
  };

  const metricConfig = {
    conversations: { label: "Conversations", color: "#3b82f6", suffix: "" },
    duration: { label: "Durée moy. (s)", color: "#10b981", suffix: "s" },
    satisfaction: { label: "Satisfaction (%)", color: "#f59e0b", suffix: "%" },
  };

  const total = data.reduce((acc, d) => acc + d[metric], 0);
  const avg = Math.round(total / data.length);

  return (
    <Card className="h-[400px] flex flex-col">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-primary" />
            Analytics Live
          </CardTitle>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleRefresh}
            disabled={isRefreshing}
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? "animate-spin" : ""}`} />
          </Button>
        </div>
        <div className="flex gap-2 flex-wrap">
          {(Object.keys(metricConfig) as Array<keyof typeof metricConfig>).map((key) => (
            <Badge
              key={key}
              variant={metric === key ? "default" : "secondary"}
              className="cursor-pointer"
              onClick={() => setMetric(key)}
            >
              {metricConfig[key].label}
            </Badge>
          ))}
        </div>
      </CardHeader>
      <CardContent className="flex-1 pb-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="text-3xl font-bold">
              {avg}
              {metricConfig[metric].suffix}
            </div>
            <div className="text-sm text-muted-foreground flex items-center gap-1">
              <TrendingUp className="w-3 h-3 text-green-500" />
              Moyenne sur 7 jours
            </div>
          </div>
          <div className="flex gap-1">
            <Button
              variant={chartType === "area" ? "default" : "outline"}
              size="sm"
              onClick={() => setChartType("area")}
            >
              Aire
            </Button>
            <Button
              variant={chartType === "bar" ? "default" : "outline"}
              size="sm"
              onClick={() => setChartType("bar")}
            >
              Barres
            </Button>
          </div>
        </div>
        <div className="h-[200px]">
          <ResponsiveContainer width="100%" height="100%">
            {chartType === "area" ? (
              <AreaChart data={data}>
                <defs>
                  <linearGradient id="colorMetric" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={metricConfig[metric].color} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={metricConfig[metric].color} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: 'hsl(var(--background))', 
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px'
                  }} 
                />
                <Area
                  type="monotone"
                  dataKey={metric}
                  stroke={metricConfig[metric].color}
                  strokeWidth={2}
                  fill="url(#colorMetric)"
                />
              </AreaChart>
            ) : (
              <BarChart data={data}>
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: 'hsl(var(--background))', 
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px'
                  }} 
                />
                <Bar dataKey={metric} fill={metricConfig[metric].color} radius={[4, 4, 0, 0]} />
              </BarChart>
            )}
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
};
