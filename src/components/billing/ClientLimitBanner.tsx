import { useBillingConfig } from '@/hooks/useBillingConfig';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from '@/context/OrganizationContext';
import { useAuth } from '@/hooks/useAuth';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { AlertTriangle, Users, Crown, ShoppingCart, Infinity } from 'lucide-react';
import { Link } from 'react-router-dom';

interface ClientLimitBannerProps {
  showProgress?: boolean;
  compact?: boolean;
}

export const ClientLimitBanner = ({ showProgress = true, compact = false }: ClientLimitBannerProps) => {
  const { selectedOrgId } = useOrganization();
  const { user } = useAuth();
  const { billingConfig, currentPlan, isLoading: billingLoading } = useBillingConfig();

  // Server-side super admin check
  const { data: isSuperAdmin = false } = useQuery({
    queryKey: ['is-super-admin', user?.id],
    queryFn: async () => {
      if (!user?.id) return false;
      const { data, error } = await supabase.rpc('is_super_admin', { _user_id: user.id });
      if (error) return false;
      return data === true;
    },
    enabled: !!user?.id,
    staleTime: 5 * 60 * 1000,
  });

  const { data: clientCount = 0 } = useQuery({
    queryKey: ['client-count', selectedOrgId],
    queryFn: async () => {
      if (!selectedOrgId) return 0;
      const { count, error } = await supabase
        .from('clients')
        .select('*', { count: 'exact', head: true })
        .eq('organization_id', selectedOrgId);
      if (error) throw error;
      return count || 0;
    },
    enabled: !!selectedOrgId,
  });

  if (billingLoading) return null;

  // Super admins have unlimited access (server-validated)
  if (isSuperAdmin) {
    if (compact) {
      return (
        <div className="flex items-center gap-3 text-sm">
          <Users className="h-4 w-4 text-primary" />
          <span className="text-primary font-medium flex items-center gap-1">
            {clientCount} clients
            <Infinity className="h-3 w-3" />
          </span>
          <span className="text-xs text-muted-foreground">(Super Admin)</span>
        </div>
      );
    }
    
    if (showProgress) {
      return (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground flex items-center gap-2">
              <Crown className="h-4 w-4 text-primary" />
              Super Admin - Clients illimités
            </span>
            <span className="font-medium text-primary">{clientCount} clients</span>
          </div>
        </div>
      );
    }
    return null;
  }

  const clientsIncluded = currentPlan?.clientsIncluded || 5;
  const additionalClientPrice = currentPlan?.additionalClientPrice;
  const isAtLimit = clientCount >= clientsIncluded;
  const usagePercent = Math.min((clientCount / clientsIncluded) * 100, 100);
  const isNearLimit = usagePercent >= 80;

  if (compact) {
    return (
      <div className="flex items-center gap-3 text-sm">
        <Users className="h-4 w-4 text-muted-foreground" />
        <span className={isAtLimit ? 'text-destructive font-medium' : ''}>
          {clientCount}/{clientsIncluded} clients
        </span>
        {isAtLimit && (
          <Link to="/billing">
            <Button size="sm" variant="outline" className="h-6 text-xs">
              <Crown className="h-3 w-3 mr-1" />
              Upgrade
            </Button>
          </Link>
        )}
      </div>
    );
  }

  if (!isNearLimit && !isAtLimit) {
    if (showProgress) {
      return (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Clients utilisés</span>
            <span className="font-medium">{clientCount}/{clientsIncluded}</span>
          </div>
          <Progress value={usagePercent} className="h-2" />
        </div>
      );
    }
    return null;
  }

  return (
    <Alert variant={isAtLimit ? 'destructive' : 'default'} className={isAtLimit ? 'border-destructive/50 bg-destructive/10' : 'border-warning/50 bg-warning/10'}>
      <AlertTriangle className="h-4 w-4" />
      <AlertTitle className="flex items-center gap-2">
        {isAtLimit ? 'Limite de clients atteinte' : 'Limite de clients bientôt atteinte'}
      </AlertTitle>
      <AlertDescription className="mt-2">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span>
              {clientCount}/{clientsIncluded} clients utilisés
              {currentPlan && ` (Plan ${currentPlan.name})`}
            </span>
          </div>
          
          {showProgress && (
            <Progress 
              value={usagePercent} 
              className={`h-2 ${isAtLimit ? '[&>div]:bg-destructive' : '[&>div]:bg-warning'}`}
            />
          )}

          <div className="flex flex-wrap gap-2">
            <Link to="/billing">
              <Button size="sm" variant={isAtLimit ? 'destructive' : 'default'}>
                <Crown className="h-4 w-4 mr-2" />
                Passer au plan supérieur
              </Button>
            </Link>
            
            {additionalClientPrice && !isAtLimit && (
              <Button size="sm" variant="outline">
                <ShoppingCart className="h-4 w-4 mr-2" />
                Acheter des emplacements (${additionalClientPrice} CAD/client)
              </Button>
            )}
          </div>
        </div>
      </AlertDescription>
    </Alert>
  );
};

// Hook to check if client creation is allowed
export const useClientLimit = () => {
  const { selectedOrgId } = useOrganization();
  const { user } = useAuth();
  const { currentPlan } = useBillingConfig();

  // Server-side super admin check
  const { data: isSuperAdmin = false } = useQuery({
    queryKey: ['is-super-admin', user?.id],
    queryFn: async () => {
      if (!user?.id) return false;
      const { data, error } = await supabase.rpc('is_super_admin', { _user_id: user.id });
      if (error) return false;
      return data === true;
    },
    enabled: !!user?.id,
    staleTime: 5 * 60 * 1000,
  });

  const { data: clientCount = 0 } = useQuery({
    queryKey: ['client-count', selectedOrgId],
    queryFn: async () => {
      if (!selectedOrgId) return 0;
      const { count, error } = await supabase
        .from('clients')
        .select('*', { count: 'exact', head: true })
        .eq('organization_id', selectedOrgId);
      if (error) throw error;
      return count || 0;
    },
    enabled: !!selectedOrgId,
  });

  // Super admins have unlimited access (server-validated)
  if (isSuperAdmin) {
    return {
      clientCount,
      clientsIncluded: Infinity,
      canCreateClient: true,
      remainingSlots: Infinity,
      additionalClientPrice: undefined,
      isSuperAdmin: true,
    };
  }

  const clientsIncluded = currentPlan?.clientsIncluded || 5;
  const canCreateClient = clientCount < clientsIncluded;
  const remainingSlots = Math.max(0, clientsIncluded - clientCount);

  return {
    clientCount,
    clientsIncluded,
    canCreateClient,
    remainingSlots,
    additionalClientPrice: currentPlan?.additionalClientPrice,
    isSuperAdmin: false,
  };
};
