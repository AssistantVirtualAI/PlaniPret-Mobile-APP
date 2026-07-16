import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface PromptTemplate {
  id: string;
  organization_id: string | null;
  name: string;
  description: string | null;
  system_prompt: string;
  first_message: string | null;
  temperature: number | null;
  max_tokens: number | null;
  tags: string[];
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export const usePromptTemplates = () => {
  return useQuery({
    queryKey: ['prompt-templates'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('prompt_templates')
        .select('*')
        .order('is_default', { ascending: false })
        .order('name');

      if (error) throw error;
      return data as PromptTemplate[];
    },
  });
};

export const useCreatePromptTemplate = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (template: Omit<PromptTemplate, 'id' | 'created_at' | 'updated_at' | 'is_default'>) => {
      const { data, error } = await supabase
        .from('prompt_templates')
        .insert({
          ...template,
          is_default: false,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['prompt-templates'] });
      toast.success('Template créé avec succès');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Erreur lors de la création du template');
    },
  });
};

export const useApplyPromptTemplate = () => {
  return useMutation({
    mutationFn: async ({ 
      agentId, 
      template, 
      applyFirstMessage = true 
    }: { 
      agentId: string; 
      template: PromptTemplate; 
      applyFirstMessage?: boolean;
    }) => {
      // Call ElevenLabs to update the agent config
      const { data, error } = await supabase.functions.invoke('elevenlabs-convai-agent-config', {
        body: {
          action: 'update_prompt',
          agentId,
          prompt: template.system_prompt,
          firstMessage: applyFirstMessage ? template.first_message : undefined,
        },
      });

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success('Template appliqué avec succès');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Erreur lors de l\'application du template');
    },
  });
};

export const useDeletePromptTemplate = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (templateId: string) => {
      const { error } = await supabase
        .from('prompt_templates')
        .delete()
        .eq('id', templateId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['prompt-templates'] });
      toast.success('Template supprimé');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Erreur lors de la suppression');
    },
  });
};
