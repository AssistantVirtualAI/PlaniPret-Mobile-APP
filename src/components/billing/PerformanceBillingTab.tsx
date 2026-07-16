import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { usePerformanceBilling } from '@/hooks/usePerformanceBilling';
import { 
  TrendingUp, 
  Calendar, 
  Users, 
  DollarSign, 
  RefreshCw,
  Settings,
  BarChart3,
  Target,
  UserCheck
} from 'lucide-react';
import { useState } from 'react';
import { format } from 'date-fns';
import { enUS } from 'date-fns/locale';

export function PerformanceBillingTab() {
  const { 
    currentMetrics, 
    history, 
    billingConfig,
    isCalculating, 
    isLoadingHistory,
    recalculate,
    updateConfig
  } = usePerformanceBilling();

  const [showConfig, setShowConfig] = useState(false);
  const [priceAppointment, setPriceAppointment] = useState(billingConfig?.price_per_appointment || 5);
  const [priceQualified, setPriceQualified] = useState(billingConfig?.price_per_qualified_lead || 10);
  const [priceConverted, setPriceConverted] = useState(billingConfig?.price_per_converted_lead || 25);

  const handleSaveConfig = () => {
    updateConfig.mutate({
      price_per_appointment: priceAppointment,
      price_per_qualified_lead: priceQualified,
      price_per_converted_lead: priceConverted
    });
  };

  const handleTogglePerformanceBilling = (enabled: boolean) => {
    updateConfig.mutate({ performance_billing_enabled: enabled });
  };

  return (
    <div className="space-y-6">
      {/* Performance Billing Toggle */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5" />
                Performance-Based Billing
              </CardTitle>
              <CardDescription>
                Bill your clients based on achieved results
              </CardDescription>
            </div>
            <Switch 
              checked={billingConfig?.performance_billing_enabled || false}
              onCheckedChange={handleTogglePerformanceBilling}
            />
          </div>
        </CardHeader>
      </Card>

      {/* Current Period Metrics */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Current Period</CardTitle>
              <CardDescription>
                Current month metrics
              </CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={() => recalculate()}>
              <RefreshCw className={`h-4 w-4 mr-2 ${isCalculating ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isCalculating ? (
            <div className="grid gap-4 md:grid-cols-4">
              {[1, 2, 3, 4].map(i => (
                <Skeleton key={i} className="h-24" />
              ))}
            </div>
          ) : (
            <>
              <div className="grid gap-4 md:grid-cols-4">
                <div className="p-4 rounded-lg bg-blue-500/10 border border-blue-500/20">
                  <div className="flex items-center gap-2 mb-2">
                    <Calendar className="h-4 w-4 text-blue-400" />
                    <span className="text-sm text-muted-foreground">Booked appointments</span>
                  </div>
                  <p className="text-2xl font-bold">{currentMetrics?.appointments_booked || 0}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    × ${billingConfig?.price_per_appointment || 5} = ${(currentMetrics?.appointments_booked || 0) * (billingConfig?.price_per_appointment || 5)}
                  </p>
                </div>

                <div className="p-4 rounded-lg bg-purple-500/10 border border-purple-500/20">
                  <div className="flex items-center gap-2 mb-2">
                    <Users className="h-4 w-4 text-purple-400" />
                    <span className="text-sm text-muted-foreground">Qualified leads</span>
                  </div>
                  <p className="text-2xl font-bold">{currentMetrics?.leads_qualified || 0}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    × ${billingConfig?.price_per_qualified_lead || 10} = ${(currentMetrics?.leads_qualified || 0) * (billingConfig?.price_per_qualified_lead || 10)}
                  </p>
                </div>

                <div className="p-4 rounded-lg bg-green-500/10 border border-green-500/20">
                  <div className="flex items-center gap-2 mb-2">
                    <UserCheck className="h-4 w-4 text-green-400" />
                    <span className="text-sm text-muted-foreground">Converted leads</span>
                  </div>
                  <p className="text-2xl font-bold">{currentMetrics?.leads_converted || 0}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    × ${billingConfig?.price_per_converted_lead || 25} = ${(currentMetrics?.leads_converted || 0) * (billingConfig?.price_per_converted_lead || 25)}
                  </p>
                </div>

                <div className="p-4 rounded-lg bg-primary/10 border border-primary/20">
                  <div className="flex items-center gap-2 mb-2">
                    <DollarSign className="h-4 w-4 text-primary" />
                    <span className="text-sm text-muted-foreground">Billable total</span>
                  </div>
                  <p className="text-2xl font-bold">${currentMetrics?.billable_amount?.toFixed(2) || '0.00'}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {currentMetrics?.conversations_count || 0} conversations
                  </p>
                </div>
              </div>

              {/* Additional Stats */}
              <div className="grid gap-4 md:grid-cols-3 mt-4">
                <div className="p-3 rounded-lg bg-card border">
                  <p className="text-sm text-muted-foreground">Conversations</p>
                  <p className="text-lg font-semibold">{currentMetrics?.conversations_count || 0}</p>
                </div>
                <div className="p-3 rounded-lg bg-card border">
                  <p className="text-sm text-muted-foreground">Total duration</p>
                  <p className="text-lg font-semibold">{currentMetrics?.total_duration_minutes || 0} min</p>
                </div>
                <div className="p-3 rounded-lg bg-card border">
                  <p className="text-sm text-muted-foreground">Generated leads</p>
                  <p className="text-lg font-semibold">{currentMetrics?.leads_generated || 0}</p>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Pricing Configuration */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Settings className="h-5 w-5" />
                Rate Configuration
              </CardTitle>
              <CardDescription>
                Define your rates by performance type
              </CardDescription>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setShowConfig(!showConfig)}>
              {showConfig ? 'Hide' : 'Edit'}
            </Button>
          </div>
        </CardHeader>
        {showConfig && (
          <CardContent>
            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <label className="text-sm font-medium">Price per booked appointment ($)</label>
                <Input 
                  type="number" 
                  value={priceAppointment}
                  onChange={(e) => setPriceAppointment(Number(e.target.value))}
                  min={0}
                  step={0.5}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Price per qualified lead ($)</label>
                <Input 
                  type="number" 
                  value={priceQualified}
                  onChange={(e) => setPriceQualified(Number(e.target.value))}
                  min={0}
                  step={0.5}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Price per converted lead ($)</label>
                <Input 
                  type="number" 
                  value={priceConverted}
                  onChange={(e) => setPriceConverted(Number(e.target.value))}
                  min={0}
                  step={0.5}
                />
              </div>
            </div>
            <div className="flex justify-end mt-4">
              <Button onClick={handleSaveConfig}>
                Save rates
              </Button>
            </div>
          </CardContent>
        )}
      </Card>

      {/* History */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Period History
          </CardTitle>
          <CardDescription>
            Previous month performance
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoadingHistory ? (
            <div className="space-y-2">
              {[1, 2, 3].map(i => (
                <Skeleton key={i} className="h-16" />
              ))}
            </div>
          ) : history.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <BarChart3 className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No history available</p>
              <p className="text-sm">Data will be saved at the end of each period</p>
            </div>
          ) : (
            <div className="space-y-3">
              {history.map((period) => (
                <div 
                  key={period.id}
                  className="flex items-center justify-between p-4 rounded-lg border hover:bg-accent/50 transition-colors"
                >
                  <div>
                    <p className="font-medium">
                      {format(new Date(period.period_start), 'MMMM yyyy', { locale: enUS })}
                    </p>
                    <div className="flex gap-4 mt-1 text-sm text-muted-foreground">
                      <span>{period.appointments_booked} appointments</span>
                      <span>{period.leads_qualified} qualified leads</span>
                      <span>{period.leads_converted} converted</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-bold">${period.billable_amount?.toFixed(2)}</p>
                    {period.billed_at ? (
                      <Badge variant="secondary" className="text-xs">Billed</Badge>
                    ) : (
                      <Badge variant="outline" className="text-xs">Pending</Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
