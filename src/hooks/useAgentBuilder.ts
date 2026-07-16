import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from '@/context/OrganizationContext';
import { toast } from 'sonner';

export interface AgentBuilderConfig {
  systemPrompt: string;
  firstMessage: string;
  voiceId: string;
  voiceStability: number;
  voiceSimilarity: number;
  knowledgeItems: string[];
  enabledTools: string[];
  temperature: number;
  maxTokens: number;
}

const DEFAULT_CONFIG: AgentBuilderConfig = {
  systemPrompt: '',
  firstMessage: '',
  voiceId: '',
  voiceStability: 0.5,
  voiceSimilarity: 0.75,
  knowledgeItems: [],
  enabledTools: [],
  temperature: 0.7,
  maxTokens: 150,
};

export function useAgentBuilder() {
  const { selectedOrgId } = useOrganization();
  const [config, setConfig] = useState<AgentBuilderConfig>(DEFAULT_CONFIG);
  const [isSaving, setIsSaving] = useState(false);
  const [agentName, setAgentName] = useState('');

  const updateConfig = useCallback((updates: Partial<AgentBuilderConfig>) => {
    setConfig(prev => ({ ...prev, ...updates }));
  }, []);

  const resetConfig = useCallback(() => {
    setConfig(DEFAULT_CONFIG);
    setAgentName('');
  }, []);

  const saveAgent = useCallback(async (clientId?: string) => {
    if (!selectedOrgId) {
      toast.error('Organisation non sélectionnée');
      return null;
    }

    if (!agentName.trim()) {
      toast.error('Veuillez donner un nom à votre agent');
      return null;
    }

    if (!config.systemPrompt.trim()) {
      toast.error('Veuillez définir un System Prompt');
      return null;
    }

    setIsSaving(true);
    try {
      const agentData = {
        organization_id: selectedOrgId,
        name: agentName.trim(),
        platform: 'custom',
        is_external: false,
        client_id: clientId || null,
        config: {
          built_with_nocode: true,
          system_prompt: config.systemPrompt,
          first_message: config.firstMessage,
          voice_id: config.voiceId,
          voice_stability: config.voiceStability,
          voice_similarity: config.voiceSimilarity,
          knowledge_items: config.knowledgeItems,
          enabled_tools: config.enabledTools,
          temperature: config.temperature,
          max_tokens: config.maxTokens,
        },
        theme_config: {},
      };

      const { data, error } = await supabase
        .from('agents')
        .insert(agentData)
        .select('id')
        .single();

      if (error) throw error;

      toast.success('Agent créé avec succès !');
      return data.id;
    } catch (error: any) {
      console.error('Error saving agent:', error);
      toast.error(error.message || 'Erreur lors de la sauvegarde');
      return null;
    } finally {
      setIsSaving(false);
    }
  }, [selectedOrgId, agentName, config]);

  const loadAgent = useCallback(async (agentId: string) => {
    try {
      const { data, error } = await supabase
        .from('agents_safe')
        .select('*')
        .eq('id', agentId)
        .single();

      if (error) throw error;

      if (data) {
        setAgentName(data.name);
        const agentConfig = data.config as Record<string, any> || {};
        
        setConfig({
          systemPrompt: agentConfig.system_prompt || '',
          firstMessage: agentConfig.first_message || '',
          voiceId: agentConfig.voice_id || '',
          voiceStability: agentConfig.voice_stability ?? 0.5,
          voiceSimilarity: agentConfig.voice_similarity ?? 0.75,
          knowledgeItems: agentConfig.knowledge_items || [],
          enabledTools: agentConfig.enabled_tools || [],
          temperature: agentConfig.temperature ?? 0.7,
          maxTokens: agentConfig.max_tokens ?? 150,
        });
      }
    } catch (error: any) {
      console.error('Error loading agent:', error);
      toast.error('Erreur lors du chargement de l\'agent');
    }
  }, []);

  const updateAgent = useCallback(async (agentId: string) => {
    if (!agentName.trim()) {
      toast.error('Veuillez donner un nom à votre agent');
      return false;
    }

    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('agents')
        .update({
          name: agentName.trim(),
          config: {
            built_with_nocode: true,
            system_prompt: config.systemPrompt,
            first_message: config.firstMessage,
            voice_id: config.voiceId,
            voice_stability: config.voiceStability,
            voice_similarity: config.voiceSimilarity,
            knowledge_items: config.knowledgeItems,
            enabled_tools: config.enabledTools,
            temperature: config.temperature,
            max_tokens: config.maxTokens,
          },
          updated_at: new Date().toISOString(),
        })
        .eq('id', agentId);

      if (error) throw error;

      toast.success('Agent mis à jour !');
      return true;
    } catch (error: any) {
      console.error('Error updating agent:', error);
      toast.error(error.message || 'Erreur lors de la mise à jour');
      return false;
    } finally {
      setIsSaving(false);
    }
  }, [agentName, config]);

  return {
    config,
    agentName,
    setAgentName,
    updateConfig,
    resetConfig,
    saveAgent,
    loadAgent,
    updateAgent,
    isSaving,
  };
}
