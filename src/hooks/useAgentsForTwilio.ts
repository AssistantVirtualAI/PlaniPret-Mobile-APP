import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from '@/context/OrganizationContext';
import { toast } from 'sonner';

export interface AgentForTwilio {
  id: string;
  name: string;
  platform: string;
  platform_agent_id: string | null;
  twilio_number: string | null;
}

// Normalize phone number to E.164 format for consistent comparison
function normalizePhoneNumber(phone: string | null): string {
  if (!phone) return '';
  // Remove all non-digit characters except leading +
  const cleaned = phone.replace(/[^\d+]/g, '');
  // Ensure it starts with +
  return cleaned.startsWith('+') ? cleaned : `+${cleaned}`;
}

export function useAgentsForTwilio() {
  const { selectedOrgId } = useOrganization();
  const queryClient = useQueryClient();

  const { data: agents = [], isLoading, refetch: refetchAgents } = useQuery({
    queryKey: ['agents-for-twilio', selectedOrgId],
    queryFn: async () => {
      if (!selectedOrgId) return [];
      
      const { data, error } = await supabase
        .from('agents_safe')
        .select('id, name, platform, platform_agent_id, twilio_number')
        .eq('organization_id', selectedOrgId)
        .in('platform', ['elevenlabs', 'vapi', 'retell'])
        .order('name');
      
      if (error) {
        console.error('Error fetching agents for Twilio:', error);
        throw error;
      }
      
      console.log('Fetched agents for Twilio:', data);
      return (data || []) as AgentForTwilio[];
    },
    enabled: !!selectedOrgId,
    staleTime: 0, // Always refetch when invalidated
  });

  const assignTwilioNumber = useMutation({
    mutationFn: async ({ agentId, twilioNumber }: { agentId: string | null; twilioNumber: string }) => {
      if (!selectedOrgId) throw new Error('No organization selected');
      
      const normalizedNumber = normalizePhoneNumber(twilioNumber);
      console.log('Assigning Twilio number:', { agentId, twilioNumber, normalizedNumber, selectedOrgId });

      // First, unassign this number from any agent in the organization
      // Use both normalized and original format for safety
      const { error: unassignError1 } = await supabase
        .from('agents')
        .update({ twilio_number: null })
        .eq('organization_id', selectedOrgId)
        .eq('twilio_number', normalizedNumber);

      if (unassignError1) {
        console.error('Error unassigning (normalized):', unassignError1);
      }

      // Also try with the original format
      if (twilioNumber !== normalizedNumber) {
        await supabase
          .from('agents')
          .update({ twilio_number: null })
          .eq('organization_id', selectedOrgId)
          .eq('twilio_number', twilioNumber);
      }

      // If agentId is provided, assign the number to that agent
      if (agentId) {
        const { error: assignError } = await supabase
          .from('agents')
          .update({ twilio_number: normalizedNumber })
          .eq('id', agentId)
          .eq('organization_id', selectedOrgId);

        if (assignError) {
          console.error('Error assigning number:', assignError);
          throw assignError;
        }
        
        console.log('Successfully assigned number to agent:', agentId, normalizedNumber);
      }

      return { success: true };
    },
    onSuccess: () => {
      // Invalidate all relevant queries
      queryClient.invalidateQueries({ queryKey: ['agents-for-twilio'] });
      queryClient.invalidateQueries({ queryKey: ['agents'] });
      queryClient.invalidateQueries({ queryKey: ['twilio-numbers'] });
    },
    onError: (error) => {
      console.error('Failed to assign Twilio number:', error);
      toast.error('Failed to assign phone number');
    },
  });

  const getAgentByTwilioNumber = (twilioNumber: string): AgentForTwilio | undefined => {
    if (!twilioNumber) return undefined;
    
    const normalizedInput = normalizePhoneNumber(twilioNumber);
    
    const agent = agents.find((agent) => {
      if (!agent.twilio_number) return false;
      const normalizedAgent = normalizePhoneNumber(agent.twilio_number);
      return normalizedAgent === normalizedInput;
    });
    
    if (agent) {
      console.log('Found agent for number:', twilioNumber, '→', agent.name);
    }
    
    return agent;
  };

  return {
    agents,
    isLoading,
    refetchAgents,
    assignTwilioNumber,
    getAgentByTwilioNumber,
  };
}
