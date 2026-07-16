import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { CreditCard, Calendar, Zap, ExternalLink } from 'lucide-react';
import { BillingConfig } from '@/hooks/useBillingConfig';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

interface SubscriptionStatusProps {
  billingConfig: BillingConfig | null;
  currentPlanName: string;
  onManageSubscription: () => void;
  isLoading: boolean;
}

export const SubscriptionStatus = ({
  billingConfig,
  currentPlanName,
  onManageSubscription,
  isLoading,
}: SubscriptionStatusProps) => {
  const creditsUsed = billingConfig?.credits_used || 0;
  const creditsLimit = billingConfig?.credits_limit || 100;
  const creditsPercentage = Math.min((creditsUsed / creditsLimit) * 100, 100);

  const statusColors: Record<string, string> = {
    active: 'bg-success',
    canceled: 'bg-destructive',
    past_due: 'bg-warning',
    trialing: 'bg-primary',
  };

  return (
    <Card className="glass-card">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary to-accent flex items-center justify-center">
              <CreditCard className="w-6 h-6 text-white" />
            </div>
            <div>
              <CardTitle>Your subscription</CardTitle>
              <CardDescription>Manage your plan and credits</CardDescription>
            </div>
          </div>
          <Badge className={statusColors[billingConfig?.subscription_status || 'active']}>
            {billingConfig?.subscription_status === 'active' ? 'Active' : 
             billingConfig?.subscription_status === 'canceled' ? 'Canceled' :
             billingConfig?.subscription_status === 'past_due' ? 'Unpaid' : 'Active'}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 rounded-lg bg-muted/30">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <Zap className="w-4 h-4" />
              <span className="text-sm">Current plan</span>
            </div>
            <p className="text-2xl font-bold">{currentPlanName}</p>
          </div>

          <div className="p-4 rounded-lg bg-muted/30">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <Calendar className="w-4 h-4" />
              <span className="text-sm">Next billing</span>
            </div>
            <p className="text-2xl font-bold">
              {billingConfig?.subscription_ends_at 
                ? format(new Date(billingConfig.subscription_ends_at), 'dd MMM yyyy', { locale: fr })
                : 'N/A'}
            </p>
          </div>

          <div className="p-4 rounded-lg bg-muted/30">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <CreditCard className="w-4 h-4" />
              <span className="text-sm">Crédits AI</span>
            </div>
            <p className="text-2xl font-bold">{billingConfig?.ai_credits || 0}</p>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span>Credit usage</span>
            <span>{creditsUsed} / {creditsLimit}</span>
          </div>
          <Progress value={creditsPercentage} className="h-2" />
        </div>

        {billingConfig?.stripe_subscription_id && (
          <Button 
            variant="outline" 
            className="w-full"
            onClick={onManageSubscription}
            disabled={isLoading}
          >
            <ExternalLink className="w-4 h-4 mr-2" />
            Gérer l'abonnement
          </Button>
        )}
      </CardContent>
    </Card>
  );
};
