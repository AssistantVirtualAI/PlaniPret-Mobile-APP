import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from '@/context/OrganizationContext';
import { toast } from 'sonner';

export interface PlatformWebhook {
  id: string;
  agent_id: string;
  organization_id: string;
  platform: 'elevenlabs' | 'vapi' | 'retell';
  webhook_url: string;
  webhook_secret: string | null;
  events: string[];
  is_active: boolean;
  last_triggered_at: string | null;
  error_count: number;
  created_at: string;
  updated_at: string;
}

export interface PlatformWebhookInput {
  platform: 'elevenlabs' | 'vapi' | 'retell';
  webhook_url: string;
  webhook_secret?: string;
  events: string[];
  is_active?: boolean;
}

export const PLATFORM_WEBHOOK_EVENTS = {
  elevenlabs: [
    { id: 'conversation.started', name: 'Conversation Started', description: 'When a conversation begins' },
    { id: 'conversation.ended', name: 'Conversation Ended', description: 'When a conversation ends' },
    { id: 'conversation.failed', name: 'Conversation Failed', description: 'When a conversation fails' },
    { id: 'transcript.complete', name: 'Transcript Complete', description: 'When transcript is ready' },
    { id: 'audio.generated', name: 'Audio Generated', description: 'When audio is generated' },
  ],
  vapi: [
    { id: 'call-started', name: 'Call Started', description: 'When a call starts' },
    { id: 'call-ended', name: 'Call Ended', description: 'When a call ends' },
    { id: 'transcript', name: 'Transcript', description: 'Real-time transcript updates' },
    { id: 'end-of-call-report', name: 'End of Call Report', description: 'Summary after call ends' },
    { id: 'speech-update', name: 'Speech Update', description: 'Speech detection updates' },
    { id: 'function-call', name: 'Function Call', description: 'When a function is called' },
    { id: 'hang', name: 'Hang', description: 'When call is hung up' },
  ],
  retell: [
    { id: 'call_started', name: 'Call Started', description: 'When a call starts' },
    { id: 'call_ended', name: 'Call Ended', description: 'When a call ends' },
    { id: 'call_failed', name: 'Call Failed', description: 'When a call fails' },
    { id: 'call_analyzed', name: 'Call Analyzed', description: 'When call analysis is complete' },
    { id: 'agent_response', name: 'Agent Response', description: 'When agent responds' },
    { id: 'user_speech', name: 'User Speech', description: 'When user speaks' },
  ],
};

export function useAgentPlatformWebhooks(agentId: string | undefined) {
  const { selectedOrg } = useOrganization();
  const queryClient = useQueryClient();

  const { data: webhooks, isLoading, refetch } = useQuery({
    queryKey: ['agent-platform-webhooks', agentId],
    queryFn: async () => {
      if (!agentId) return [];
      
      const { data, error } = await supabase
        .from('agent_platform_webhooks')
        .select('id,agent_id,organization_id,platform,webhook_url,events,is_active,last_triggered_at,error_count,created_at,updated_at')
        .eq('agent_id', agentId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as PlatformWebhook[];
    },
    enabled: !!agentId,
  });

  const addWebhook = useMutation({
    mutationFn: async (input: PlatformWebhookInput) => {
      if (!agentId || !selectedOrg) {
        throw new Error('Agent ID and organization required');
      }

      const { data, error } = await supabase
        .from('agent_platform_webhooks')
        .insert({
          agent_id: agentId,
          organization_id: selectedOrg.id,
          platform: input.platform,
          webhook_url: input.webhook_url,
          webhook_secret: input.webhook_secret || null,
          events: input.events,
          is_active: input.is_active ?? true,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agent-platform-webhooks', agentId] });
      toast.success('Webhook configuration saved');
    },
    onError: (error) => {
      toast.error(`Failed to save webhook: ${error.message}`);
    },
  });

  const updateWebhook = useMutation({
    mutationFn: async ({ id, ...input }: Partial<PlatformWebhookInput> & { id: string }) => {
      const { data, error } = await supabase
        .from('agent_platform_webhooks')
        .update({
          ...input,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agent-platform-webhooks', agentId] });
      toast.success('Webhook updated');
    },
    onError: (error) => {
      toast.error(`Failed to update webhook: ${error.message}`);
    },
  });

  const deleteWebhook = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('agent_platform_webhooks')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agent-platform-webhooks', agentId] });
      toast.success('Webhook deleted');
    },
    onError: (error) => {
      toast.error(`Failed to delete webhook: ${error.message}`);
    },
  });

  const toggleWebhook = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase
        .from('agent_platform_webhooks')
        .update({ is_active })
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agent-platform-webhooks', agentId] });
    },
  });

  const getWebhookForPlatform = (platform: 'elevenlabs' | 'vapi' | 'retell') => {
    return webhooks?.find(w => w.platform === platform);
  };

  const generateWebhookUrl = (platform: string) => {
    const baseUrl = import.meta.env.VITE_SUPABASE_URL;
    return `${baseUrl}/functions/v1/webhooks-router?agent_id=${agentId}&platform=${platform}`;
  };

  return {
    webhooks: webhooks || [],
    isLoading,
    refetch,
    addWebhook,
    updateWebhook,
    deleteWebhook,
    toggleWebhook,
    getWebhookForPlatform,
    generateWebhookUrl,
  };
}
