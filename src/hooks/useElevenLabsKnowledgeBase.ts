import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface ElevenLabsKBItem {
  id: string;
  name: string;
  type: 'text' | 'file' | 'url' | 'folder';
  content?: string;
  url?: string;
  file_name?: string;
  file_size?: number;
  created_at?: string;
  updated_at?: string;
  dependent_agents?: Array<{ id: string; name: string }>;
  metadata?: Record<string, any>;
}

export interface ElevenLabsKBResponse {
  knowledge_base: {
    items: ElevenLabsKBItem[];
    total: number;
    all_documents_count: number;
  };
  requiresSetup?: boolean;
  message?: string;
}

// Helper: optimistic cache update after creation
function optimisticAddItem(
  queryClient: ReturnType<typeof useQueryClient>,
  agentId: string,
  newItem: Partial<ElevenLabsKBItem>
) {
  queryClient.setQueryData(
    ['elevenlabs-knowledge-base', agentId],
    (old: ElevenLabsKBResponse | undefined) => {
      if (!old) return old;
      const item: ElevenLabsKBItem = {
        id: newItem.id || `temp-${Date.now()}`,
        name: newItem.name || 'Nouveau document',
        type: newItem.type || 'text',
        content: newItem.content,
        url: newItem.url,
        file_name: newItem.file_name,
        created_at: new Date().toISOString(),
        metadata: newItem.metadata,
      };
      return {
        ...old,
        knowledge_base: {
          ...old.knowledge_base,
          items: [...old.knowledge_base.items, item],
          total: old.knowledge_base.total + 1,
          all_documents_count: old.knowledge_base.all_documents_count + 1,
        },
      };
    }
  );

  // Delayed refetch to sync with ElevenLabs propagation
  setTimeout(() => {
    queryClient.invalidateQueries({ queryKey: ['elevenlabs-knowledge-base', agentId] });
  }, 3000);
}

// Fetch knowledge base for a specific agent
export const useElevenLabsKnowledgeBase = (agentId: string | null, apiKey: string | null) => {
  return useQuery({
    queryKey: ['elevenlabs-knowledge-base', agentId],
    queryFn: async () => {
      if (!agentId) throw new Error('Agent ID required');

      const { data, error } = await supabase.functions.invoke('elevenlabs-convai-knowledge-base', {
        body: { 
          action: 'list',
          agentId,
          apiKey: apiKey || undefined,
          pageSize: 100
        }
      });

      if (error) throw error;
      if (data.requiresSetup) {
        throw new Error(data.message || 'Configuration ElevenLabs requise');
      }
      return data as ElevenLabsKBResponse;
    },
    enabled: !!agentId,
  });
};

// Get a single document with full content
export const useKnowledgeBaseDocument = (agentId: string | null, documentId: string | null, apiKey: string | null) => {
  return useQuery({
    queryKey: ['elevenlabs-knowledge-document', documentId],
    queryFn: async () => {
      if (!documentId) throw new Error('Document ID required');

      const { data, error } = await supabase.functions.invoke('elevenlabs-convai-knowledge-base', {
        body: { 
          action: 'get_document',
          agentId: agentId || undefined,
          apiKey: apiKey || undefined,
          documentId
        }
      });

      if (error) throw error;
      if (!data.success) throw new Error(data.error || 'Échec du chargement du document');
      return data.document as ElevenLabsKBItem;
    },
    enabled: !!documentId,
  });
};

// Add text document to knowledge base
export const useAddKnowledgeBaseItem = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ 
      agentId, 
      apiKey, 
      title, 
      content, 
      category,
      organizationId
    }: { 
      agentId: string; 
      apiKey?: string; 
      title: string; 
      content: string; 
      category?: string;
      organizationId?: string;
    }) => {
      const { data, error } = await supabase.functions.invoke('elevenlabs-convai-knowledge-base', {
        body: { 
          action: 'create_text',
          agentId,
          apiKey: apiKey || undefined,
          organizationId: organizationId || undefined,
          title,
          content,
          category: category || 'Général'
        }
      });

      if (error) throw error;
      if (!data.success) throw new Error(data.error || 'Échec de l\'ajout');
      return data;
    },
    onSuccess: (data, variables) => {
      optimisticAddItem(queryClient, variables.agentId, {
        id: data.documentId,
        name: variables.title,
        type: 'text',
        content: variables.content,
        metadata: { category: variables.category || 'Général' },
      });
      toast.success('Document ajouté à la base de connaissances');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Erreur lors de l\'ajout du document');
    },
  });
};

// Add URL document to knowledge base
export const useAddKnowledgeBaseUrl = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ 
      agentId, 
      apiKey, 
      url,
      title,
      organizationId
    }: { 
      agentId: string; 
      apiKey?: string; 
      url: string;
      title?: string;
      organizationId?: string;
    }) => {
      const { data, error } = await supabase.functions.invoke('elevenlabs-convai-knowledge-base', {
        body: { 
          action: 'create_url',
          agentId,
          apiKey: apiKey || undefined,
          organizationId: organizationId || undefined,
          url,
          title
        }
      });

      if (error) throw error;
      if (!data.success) throw new Error(data.error || 'Échec de l\'ajout depuis l\'URL');
      return data;
    },
    onSuccess: (data, variables) => {
      optimisticAddItem(queryClient, variables.agentId, {
        id: data.documentId,
        name: variables.title || variables.url,
        type: 'url',
        url: variables.url,
      });
      toast.success('Document importé depuis l\'URL');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Erreur lors de l\'import depuis l\'URL');
    },
  });
};

// Upload file to knowledge base
export const useAddKnowledgeBaseFile = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      agentId,
      apiKey,
      file,
      title,
      organizationId,
    }: {
      agentId: string;
      apiKey?: string;
      file: File;
      title?: string;
      organizationId?: string;
    }) => {
      const formData = new FormData();
      formData.append('action', 'create_file');
      formData.append('agentId', agentId);
      if (apiKey) formData.append('apiKey', apiKey);
      if (organizationId) formData.append('organizationId', organizationId);
      if (title) formData.append('title', title);
      formData.append('file', file);

      const { data, error } = await supabase.functions.invoke(
        'elevenlabs-convai-knowledge-base',
        { body: formData }
      );

      if (error) throw error;
      if (!data.success) throw new Error(data.error || 'Échec de l\'upload du fichier');
      return data;
    },
    onSuccess: (data, variables) => {
      optimisticAddItem(queryClient, variables.agentId, {
        id: data.documentId,
        name: variables.title || variables.file.name,
        type: 'file',
        file_name: variables.file.name,
        file_size: variables.file.size,
      });
      toast.success('Fichier uploadé dans la base de connaissances');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Erreur lors de l\'upload du fichier');
    },
  });
};

// Delete item from knowledge base
export const useDeleteKnowledgeBaseItem = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ 
      agentId, 
      apiKey, 
      documentId,
      organizationId
    }: { 
      agentId: string; 
      apiKey?: string; 
      documentId: string;
      organizationId?: string;
    }) => {
      const { data, error } = await supabase.functions.invoke('elevenlabs-convai-knowledge-base', {
        body: { 
          action: 'delete',
          agentId,
          apiKey: apiKey || undefined,
          organizationId: organizationId || undefined,
          documentId
        }
      });

      if (error) throw error;
      if (!data.success) throw new Error(data.error || 'Échec de la suppression');
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['elevenlabs-knowledge-base', variables.agentId] });
      toast.success('Document supprimé de la base de connaissances');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Erreur lors de la suppression');
    },
  });
};

// Link document to agent
export const useLinkDocumentToAgent = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ 
      agentId, 
      apiKey, 
      documentId
    }: { 
      agentId: string; 
      apiKey?: string; 
      documentId: string;
    }) => {
      const { data, error } = await supabase.functions.invoke('elevenlabs-convai-knowledge-base', {
        body: { 
          action: 'link_to_agent',
          agentId,
          apiKey: apiKey || undefined,
          documentId
        }
      });

      if (error) throw error;
      if (!data.success) throw new Error(data.error || 'Échec de la liaison');
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['elevenlabs-knowledge-base', variables.agentId] });
      toast.success('Document lié à l\'agent');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Erreur lors de la liaison');
    },
  });
};

// Legacy hook for backwards compatibility
export const useUpdateKnowledgeBase = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ title, content, category }: { title: string; content: string; category: string }) => {
      const { data, error } = await supabase.functions.invoke('elevenlabs-convai-knowledge-base', {
        body: { 
          action: 'create_text',
          title,
          content,
          category
        }
      });

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['elevenlabs-knowledge-base'] });
      toast.success('Base de connaissances mise à jour avec succès');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Erreur lors de la mise à jour de la base de connaissances');
    },
  });
};
