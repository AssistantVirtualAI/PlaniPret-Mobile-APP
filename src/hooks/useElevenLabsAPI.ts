import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type {
  PronunciationDictionary,
  HistoryItem,
  ElevenLabsUserInfo,
  UsageStats,
  ElevenLabsVoice,
  ElevenLabsModel,
} from '@/types/elevenlabs-full';

interface ProxyParams {
  apiKey?: string | null;
  organizationId?: string | null;
}

const buildBody = (action: string, extra: Record<string, any> = {}, params?: ProxyParams) => ({
  action,
  ...extra,
  ...(params?.apiKey ? { apiKey: params.apiKey } : {}),
  ...(params?.organizationId ? { organizationId: params.organizationId } : {}),
});

const invoke = async (body: Record<string, any>) => {
  const { data, error } = await supabase.functions.invoke('elevenlabs-api-proxy', { body });
  if (error) throw error;
  if (data?.requiresSetup) throw new Error(data.message || 'Configuration requise');
  if (data?.error) throw new Error(data.error);
  return data;
};

// ═══════════════════════════════════════════════
// USER & ACCOUNT
// ═══════════════════════════════════════════════

export const useElevenLabsUserInfo = (params: ProxyParams & { enabled?: boolean }) => {
  return useQuery({
    queryKey: ['elevenlabs-user-info', params.organizationId],
    queryFn: async (): Promise<ElevenLabsUserInfo> => {
      const data = await invoke(buildBody('user_info', {}, params));
      return data.user;
    },
    enabled: params.enabled !== false && !!(params.apiKey || params.organizationId),
    staleTime: 60000,
  });
};

export const useElevenLabsUsageStats = (params: ProxyParams & { enabled?: boolean }) => {
  return useQuery({
    queryKey: ['elevenlabs-usage-stats', params.organizationId],
    queryFn: async (): Promise<UsageStats> => {
      const data = await invoke(buildBody('usage_stats', {}, params));
      return data.usage;
    },
    enabled: params.enabled !== false && !!(params.apiKey || params.organizationId),
    staleTime: 60000,
  });
};

// ═══════════════════════════════════════════════
// VOICES (v2 paginated)
// ═══════════════════════════════════════════════

export const useElevenLabsVoicesV2 = (params: ProxyParams & { 
  search?: string; 
  category?: string;
  page_size?: number;
  enabled?: boolean;
}) => {
  return useQuery({
    queryKey: ['elevenlabs-voices-v2', params.organizationId, params.search, params.category],
    queryFn: async () => {
      const data = await invoke(buildBody('voices_list', {
        search: params.search,
        category: params.category,
        page_size: params.page_size || 50,
      }, params));
      return data;
    },
    enabled: params.enabled !== false && !!(params.apiKey || params.organizationId),
    staleTime: 120000,
  });
};

export const useDeleteVoice = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ voiceId, ...params }: ProxyParams & { voiceId: string }) => {
      return invoke(buildBody('voice_delete', { voiceId }, params));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['elevenlabs-voices'] });
      toast.success('Voix supprimée');
    },
    onError: (e: any) => toast.error(e.message || 'Erreur suppression voix'),
  });
};

// ═══════════════════════════════════════════════
// MODELS
// ═══════════════════════════════════════════════

export const useElevenLabsAllModels = (params: ProxyParams & { enabled?: boolean }) => {
  return useQuery({
    queryKey: ['elevenlabs-all-models', params.organizationId],
    queryFn: async (): Promise<ElevenLabsModel[]> => {
      const data = await invoke(buildBody('models_list', {}, params));
      return data.models || [];
    },
    enabled: params.enabled !== false && !!(params.apiKey || params.organizationId),
    staleTime: 300000,
  });
};

// ═══════════════════════════════════════════════
// TTS (Text to Speech)
// ═══════════════════════════════════════════════

export const useGenerateTTS = () => {
  return useMutation({
    mutationFn: async (args: ProxyParams & { 
      voiceId: string; 
      text: string; 
      model_id?: string;
      output_format?: string;
      language_code?: string;
      voice_settings?: Record<string, any>;
    }) => {
      return invoke(buildBody('tts_generate', {
        voiceId: args.voiceId,
        text: args.text,
        model_id: args.model_id,
        output_format: args.output_format,
        language_code: args.language_code,
        voice_settings: args.voice_settings,
      }, args));
    },
    onError: (e: any) => toast.error(e.message || 'Erreur génération TTS'),
  });
};

// ═══════════════════════════════════════════════
// PRONUNCIATION DICTIONARIES
// ═══════════════════════════════════════════════

export const useElevenLabsPronunciationDicts = (params: ProxyParams & { enabled?: boolean }) => {
  return useQuery({
    queryKey: ['elevenlabs-pronunciation', params.organizationId],
    queryFn: async () => {
      const data = await invoke(buildBody('pronunciation_list', {}, params));
      return data.pronunciation_dictionaries || data.dictionaries || [];
    },
    enabled: params.enabled !== false && !!(params.apiKey || params.organizationId),
    staleTime: 120000,
  });
};

export const useCreatePronunciationDict = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (args: ProxyParams & { name: string; description?: string; rules?: any[] }) => {
      return invoke(buildBody('pronunciation_create', {
        name: args.name,
        description: args.description,
        rules: args.rules,
      }, args));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['elevenlabs-pronunciation'] });
      toast.success('Dictionnaire créé');
    },
    onError: (e: any) => toast.error(e.message || 'Erreur création dictionnaire'),
  });
};

export const useDeletePronunciationDict = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (args: ProxyParams & { dictionaryId: string }) => {
      return invoke(buildBody('pronunciation_delete', { dictionaryId: args.dictionaryId }, args));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['elevenlabs-pronunciation'] });
      toast.success('Dictionnaire supprimé');
    },
    onError: (e: any) => toast.error(e.message || 'Erreur suppression dictionnaire'),
  });
};

// ═══════════════════════════════════════════════
// HISTORY
// ═══════════════════════════════════════════════

export const useElevenLabsHistory = (params: ProxyParams & { page_size?: number; enabled?: boolean }) => {
  return useQuery({
    queryKey: ['elevenlabs-history', params.organizationId],
    queryFn: async () => {
      const data = await invoke(buildBody('history_list', { page_size: params.page_size || 20 }, params));
      return data.history || [];
    },
    enabled: params.enabled !== false && !!(params.apiKey || params.organizationId),
    staleTime: 30000,
  });
};

export const useDeleteHistoryItem = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (args: ProxyParams & { historyItemId: string }) => {
      return invoke(buildBody('history_delete', { historyItemId: args.historyItemId }, args));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['elevenlabs-history'] });
      toast.success('Élément supprimé');
    },
    onError: (e: any) => toast.error(e.message || 'Erreur suppression'),
  });
};

// ═══════════════════════════════════════════════
// SOUND EFFECTS & MUSIC
// ═══════════════════════════════════════════════

export const useGenerateSoundEffect = () => {
  return useMutation({
    mutationFn: async (args: ProxyParams & { text: string; duration_seconds?: number; prompt_influence?: number }) => {
      return invoke(buildBody('sound_effects', {
        text: args.text,
        duration_seconds: args.duration_seconds,
        prompt_influence: args.prompt_influence,
      }, args));
    },
    onError: (e: any) => toast.error(e.message || 'Erreur génération SFX'),
  });
};

export const useGenerateMusic = () => {
  return useMutation({
    mutationFn: async (args: ProxyParams & { prompt: string; duration_seconds?: number }) => {
      return invoke(buildBody('music_generate', {
        prompt: args.prompt,
        duration_seconds: args.duration_seconds,
      }, args));
    },
    onError: (e: any) => toast.error(e.message || 'Erreur génération musique'),
  });
};

// ═══════════════════════════════════════════════
// DUBBING
// ═══════════════════════════════════════════════

export const useCreateDubbing = () => {
  return useMutation({
    mutationFn: async (args: ProxyParams & { source_url: string; target_lang: string; source_lang?: string; name?: string }) => {
      return invoke(buildBody('dubbing_create', {
        source_url: args.source_url,
        target_lang: args.target_lang,
        source_lang: args.source_lang,
        name: args.name,
      }, args));
    },
    onSuccess: () => toast.success('Doublage lancé'),
    onError: (e: any) => toast.error(e.message || 'Erreur doublage'),
  });
};

// ═══════════════════════════════════════════════
// WORKSPACE WEBHOOKS (v1)
// ═══════════════════════════════════════════════

export const useElevenLabsWebhooksV1 = (params: ProxyParams & { enabled?: boolean }) => {
  return useQuery({
    queryKey: ['elevenlabs-webhooks-v1', params.organizationId],
    queryFn: async () => {
      const data = await invoke(buildBody('webhooks_list', {}, params));
      return data.webhooks || [];
    },
    enabled: params.enabled !== false && !!(params.apiKey || params.organizationId),
    staleTime: 60000,
  });
};

export const useCreateWebhookV1 = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (args: ProxyParams & { url: string; events?: string[]; name?: string }) => {
      return invoke(buildBody('webhooks_create', {
        url: args.url,
        events: args.events,
        name: args.name,
      }, args));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['elevenlabs-webhooks-v1'] });
      toast.success('Webhook créé');
    },
    onError: (e: any) => toast.error(e.message || 'Erreur création webhook'),
  });
};

export const useDeleteWebhookV1 = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (args: ProxyParams & { webhookId: string }) => {
      return invoke(buildBody('webhooks_delete', { webhookId: args.webhookId }, args));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['elevenlabs-webhooks-v1'] });
      toast.success('Webhook supprimé');
    },
    onError: (e: any) => toast.error(e.message || 'Erreur suppression webhook'),
  });
};
