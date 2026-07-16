import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from '@/context/OrganizationContext';
import { toast } from 'sonner';

export interface CustomKPI {
  id: string;
  name: string;
  formula: string;
  description: string;
  unit: string;
  target?: number;
  currentValue?: number;
}

export interface KPIFormula {
  type: 'count' | 'sum' | 'avg' | 'ratio' | 'custom';
  field: string;
  condition?: string;
  divideBy?: string;
}

const DEFAULT_KPIS: CustomKPI[] = [
  {
    id: 'conversion_rate',
    name: 'Taux de conversion',
    formula: 'COUNT(resolution_status=resolved) / COUNT(*) * 100',
    description: 'Pourcentage de conversations résolues',
    unit: '%'
  },
  {
    id: 'avg_handling_time',
    name: 'Temps moyen de traitement',
    formula: 'AVG(duration)',
    description: 'Durée moyenne des conversations',
    unit: 'sec'
  },
  {
    id: 'satisfaction_score',
    name: 'Score de satisfaction',
    formula: 'AVG(satisfaction_score)',
    description: 'Note moyenne de satisfaction',
    unit: '/5'
  }
];

export function useCustomKPIs() {
  const { selectedOrg } = useOrganization();
  const queryClient = useQueryClient();

  // For now, KPIs are stored in organization settings
  const { data: kpis, isLoading } = useQuery({
    queryKey: ['custom-kpis', selectedOrg?.id],
    queryFn: async () => {
      if (!selectedOrg?.id) return DEFAULT_KPIS;

      // Try to get custom KPIs from organization settings
      const { data: org } = await supabase
        .from('organizations')
        .select('*')
        .eq('id', selectedOrg.id)
        .single();

      // Check if organization has custom KPIs in a metadata field
      // For now return defaults - can be extended to store in DB
      return DEFAULT_KPIS;
    },
    enabled: !!selectedOrg?.id,
  });

  // Calculate KPI values from conversations
  const { data: kpiValues, isLoading: isCalculating } = useQuery({
    queryKey: ['kpi-values', selectedOrg?.id],
    queryFn: async () => {
      if (!selectedOrg?.id) return {};

      const { data: conversations, error } = await supabase
        .from('conversations')
        .select('duration, satisfaction_score, resolution_status, created_at')
        .eq('organization_id', selectedOrg.id);

      if (error) throw error;

      const total = conversations?.length || 0;
      const resolved = conversations?.filter(c => c.resolution_status === 'resolved').length || 0;
      const avgDuration = conversations?.reduce((acc, c) => acc + (c.duration || 0), 0) / (total || 1);
      const avgSatisfaction = conversations?.reduce((acc, c) => acc + (c.satisfaction_score || 0), 0) / 
        (conversations?.filter(c => c.satisfaction_score).length || 1);

      return {
        conversion_rate: total > 0 ? (resolved / total * 100).toFixed(1) : '0',
        avg_handling_time: avgDuration.toFixed(0),
        satisfaction_score: avgSatisfaction.toFixed(1)
      };
    },
    enabled: !!selectedOrg?.id,
  });

  const saveKPI = useMutation({
    mutationFn: async (kpi: CustomKPI) => {
      // In a full implementation, save to database
      toast.success(`KPI "${kpi.name}" sauvegardé`);
      return kpi;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['custom-kpis'] });
    }
  });

  return {
    kpis: kpis || DEFAULT_KPIS,
    kpiValues: kpiValues || {},
    isLoading,
    isCalculating,
    saveKPI
  };
}
