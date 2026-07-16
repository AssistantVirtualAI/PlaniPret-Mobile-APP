import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface ClientAgentConversation {
  id: string;
  conversation_id: string;
  agent_id: string;
  agent_name: string;
  start_time: string;
  duration: number;
  status: string;
  transcript?: string;
  sentiment?: string;
  satisfaction_score?: number;
}

export const useClientAgentConversations = (clientId: string) => {
  return useQuery({
    queryKey: ['client-agent-conversations', clientId],
    queryFn: async () => {
      // Get agents assigned to this client (using agents_safe to exclude API keys)
      const { data: assignments, error: assignmentsError } = await supabase
        .from('client_agent_assignments')
        .select(`
          agent:agents_safe(
            id,
            name,
            platform,
            platform_agent_id,
            organization_id
          )
        `)
        .eq('client_id', clientId);

      if (assignmentsError) throw assignmentsError;

      const conversations: ClientAgentConversation[] = [];

      // For each ElevenLabs agent, fetch conversations
      for (const assignment of assignments || []) {
        const agent = assignment.agent as any;
        if (!agent || agent.platform !== 'elevenlabs' || !agent.platform_agent_id) continue;

        try {
          const { data, error } = await supabase.functions.invoke('elevenlabs-convai-conversations', {
            body: {
              action: 'list',
              agent_id: agent.platform_agent_id,
              organization_id: agent.organization_id,
            }
          });

          if (error) {
            console.error(`Error fetching conversations for agent ${agent.id}:`, error);
            continue;
          }

          if (data?.conversations) {
            const agentConversations = data.conversations.map((conv: any) => ({
              id: conv.conversation_id || conv.id,
              conversation_id: conv.conversation_id || conv.id,
              agent_id: agent.id,
              agent_name: agent.name,
              start_time: conv.start_time || conv.created_at,
              duration: conv.call_duration || conv.duration || 0,
              status: conv.status || 'completed',
              transcript: conv.transcript,
              sentiment: conv.analysis?.sentiment,
              satisfaction_score: conv.analysis?.satisfaction_score,
            }));
            conversations.push(...agentConversations);
          }
        } catch (err) {
          console.error(`Error processing agent ${agent.id}:`, err);
        }
      }

      // Sort by start_time descending
      conversations.sort((a, b) => {
        const dateA = a.start_time ? new Date(a.start_time).getTime() : 0;
        const dateB = b.start_time ? new Date(b.start_time).getTime() : 0;
        return dateB - dateA;
      });

      return conversations;
    },
    enabled: !!clientId,
  });
};
