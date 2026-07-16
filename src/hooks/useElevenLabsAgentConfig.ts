import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface AgentConfig {
  id: string;
  name: string;
  system_prompt: string;
  first_message: string;
  voice_id: string;
  voice_stability: number;
  voice_similarity: number;
  voice_style: number;
  temperature: number;
  max_tokens: number;
}

export const useElevenLabsAgentConfig = (enabled: boolean = true) => {
  return useQuery({
    queryKey: ['elevenlabs-agent-config'],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('elevenlabs-convai-agent-config', {
        body: { action: 'get' }
      });

      if (error) throw error;
      return data;
    },
    enabled,
  });
};

export const useUpdateAgentPrompt = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ prompt }: { prompt: string }) => {
      const { data, error } = await supabase.functions.invoke('elevenlabs-convai-agent-config', {
        body: { 
          action: 'update_prompt',
          prompt
        }
      });

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['elevenlabs-agent-config'] });
      toast.success('Prompt mis à jour avec succès');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Erreur lors de la mise à jour du prompt');
    },
  });
};

export const useUpdateAgentVoice = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (voiceSettings: { voice_id?: string; voice_stability?: number; voice_similarity?: number; voice_style?: number }) => {
      const { data, error } = await supabase.functions.invoke('elevenlabs-convai-agent-config', {
        body: { 
          action: 'update_voice',
          voiceSettings
        }
      });

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['elevenlabs-agent-config'] });
      toast.success('Paramètres vocaux mis à jour avec succès');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Erreur lors de la mise à jour des paramètres vocaux');
    },
  });
};