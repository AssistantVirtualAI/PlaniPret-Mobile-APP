import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from '@/context/OrganizationContext';

export interface AgentDistribution {
  agentName: string;
  agentId: string | null;
  count: number;
  color: string;
}

const CHART_COLORS = [
  'hsl(221, 83%, 53%)', // blue
  'hsl(262, 83%, 58%)', // purple
  'hsl(142, 71%, 45%)', // green
  'hsl(25, 95%, 53%)',  // orange
  'hsl(0, 84%, 60%)',   // red
  'hsl(47, 96%, 53%)',  // yellow
  'hsl(316, 73%, 52%)', // pink
  'hsl(180, 70%, 45%)', // cyan
];

export function useClientsDistribution() {
  const { selectedOrgId } = useOrganization();

  return useQuery({
    queryKey: ['clients-distribution', selectedOrgId],
    queryFn: async (): Promise<AgentDistribution[]> => {
      if (!selectedOrgId) return [];

      // Fetch clients with their assigned agents
      const { data: clients, error } = await supabase
        .from('clients')
        .select(`
          id,
          assigned_agent_id,
          assigned_agent:agents!clients_assigned_agent_id_fkey(id, name)
        `)
        .eq('organization_id', selectedOrgId);

      if (error) throw error;

      // Group by agent
      const agentCounts = new Map<string, { name: string; count: number }>();
      
      clients?.forEach(client => {
        const agentId = client.assigned_agent_id || 'unassigned';
        const agentName = client.assigned_agent?.name || 'Non assigné';
        
        const existing = agentCounts.get(agentId);
        if (existing) {
          existing.count++;
        } else {
          agentCounts.set(agentId, { name: agentName, count: 1 });
        }
      });

      // Convert to array and assign colors
      const distribution: AgentDistribution[] = [];
      let colorIndex = 0;
      
      agentCounts.forEach((value, key) => {
        distribution.push({
          agentId: key === 'unassigned' ? null : key,
          agentName: value.name,
          count: value.count,
          color: key === 'unassigned' 
            ? 'hsl(215, 16%, 47%)' // gray for unassigned
            : CHART_COLORS[colorIndex % CHART_COLORS.length],
        });
        if (key !== 'unassigned') colorIndex++;
      });

      // Sort by count descending, but keep "Non assigné" at the end
      return distribution.sort((a, b) => {
        if (a.agentId === null) return 1;
        if (b.agentId === null) return -1;
        return b.count - a.count;
      });
    },
    enabled: !!selectedOrgId,
  });
}
