import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { usePortal } from '@/hooks/usePortalAuth';

export interface KnowledgeItem {
  id: string;
  name: string;
  title?: string;
  type: 'text' | 'url' | 'file';
  content?: string;
  url?: string;
  created_at?: string;
  contentUnavailableReason?: string;
}

export interface KnowledgeBaseResponse {
  items: KnowledgeItem[];
  total: number;
}

// SECURITY: All hooks now use organizationId for auth - API keys are fetched server-side

// Generic hook that works for all platforms
export const usePortalKnowledgeBase = () => {
  const { session } = usePortal();
  const platform = session?.platform;
  const organizationId = session?.organizationId;
  const platformAgentId = session?.platformAgentId;

  return useQuery({
    queryKey: ['portal-knowledge-base', platform, platformAgentId],
    queryFn: async (): Promise<KnowledgeBaseResponse> => {
      if (!platform) throw new Error('Platform not available');

      switch (platform) {
        case 'elevenlabs':
          return fetchElevenLabsKB(platformAgentId, organizationId);
        case 'retell':
          return fetchRetellKB(organizationId, platformAgentId);
        case 'vapi':
          return fetchVapiKB(organizationId, platformAgentId);
        default:
          throw new Error(`Platform ${platform} not supported`);
      }
    },
    enabled: !!platform && !!organizationId,
  });
};

// Fetch ElevenLabs knowledge base
async function fetchElevenLabsKB(
  agentId: string | undefined,
  organizationId: string | undefined
): Promise<KnowledgeBaseResponse> {
  const { data, error } = await supabase.functions.invoke('elevenlabs-convai-knowledge-base', {
    body: { 
      action: 'list',
      agentId,
      organizationId,
    },
  });

  if (error) throw error;

  const items = data?.knowledge_base?.items || data?.items || [];
  return {
    items: items.map((item: any) => ({
      id: item.id,
      name: item.name || item.title || 'Sans titre',
      type: item.type || 'text',
      content: item.content,
      url: item.url,
      created_at: item.created_at,
    })),
    total: items.length,
  };
}

// Fetch Retell knowledge bases - filtered by the selected agent (via agent or LLM linkage)
async function fetchRetellKB(
  organizationId: string | undefined,
  agentId: string | undefined
): Promise<KnowledgeBaseResponse> {
  console.log('[RetellKB] Fetching for org:', organizationId, 'agent:', agentId);

  // Retell can link KBs either directly on the agent OR on the LLM used by the agent.
  let linkedKbIds: string[] = [];
  let linkageSource: 'agent' | 'llm' | 'none' = 'none';

  // 1) Fetch agent config (to find LLM id and/or KB ids)
  let agent: any | null = null;
  if (agentId) {
    try {
      const { data: agentResp, error: agentError } = await supabase.functions.invoke('retell-proxy', {
        body: {
          action: 'getAgent',
          organizationId,
          retellAgentId: agentId,
        },
      });

      console.log('[RetellKB] Agent fetch response:', JSON.stringify(agentResp), 'error:', agentError);

      if (!agentError && agentResp?.data) {
        agent = agentResp.data;

        // Some Retell setups store KB linkage on the agent.
        if (Array.isArray(agent.knowledge_base_ids) && agent.knowledge_base_ids.length > 0) {
          linkedKbIds = agent.knowledge_base_ids;
          linkageSource = 'agent';
        }
      } else if (agentResp?.success === false) {
        console.warn('[RetellKB] Agent fetch failed:', agentResp?.error);
      }
    } catch (e) {
      console.warn('[RetellKB] Could not fetch agent config for KB filtering:', e);
    }
  }

  // 2) If not linked on agent, try linking via the agent's LLM (common for Retell)
  if (linkedKbIds.length === 0) {
    const llmId = agent?.response_engine?.llm_id || agent?.llm_id;
    if (llmId) {
      try {
        const { data: llmResp, error: llmError } = await supabase.functions.invoke('retell-proxy', {
          body: {
            action: 'getLlm',
            organizationId,
            llmId,
          },
        });

        console.log('[RetellKB] LLM fetch response:', JSON.stringify(llmResp), 'error:', llmError);

        if (!llmError && llmResp?.data && Array.isArray(llmResp.data.knowledge_base_ids)) {
          linkedKbIds = llmResp.data.knowledge_base_ids;
          linkageSource = linkedKbIds.length > 0 ? 'llm' : 'none';
        }
      } catch (e) {
        console.warn('[RetellKB] Could not fetch LLM config for KB filtering:', e);
      }
    }
  }

  console.log('[RetellKB] Linked KB IDs:', linkedKbIds, 'source:', linkageSource);

  // 3) Fetch all knowledge bases for the organization
  const { data, error } = await supabase.functions.invoke('retell-proxy', {
    body: { action: 'listKnowledgeBases', organizationId },
  });

  console.log('[RetellKB] List KBs response:', JSON.stringify(data), 'error:', error);

  if (error) throw error;

  const rawKbs = data?.data || data || [];
  const kbs = Array.isArray(rawKbs) ? rawKbs : [];

  console.log('[RetellKB] Total available KBs:', kbs.length);

  // IMPORTANT: in client portal, always scope KB to the selected agent.
  // If we can't determine linkage, we show empty (not all KBs).
  const filteredKbs = linkedKbIds.length > 0
    ? kbs.filter((kb: any) => linkedKbIds.includes(kb.knowledge_base_id))
    : [];

  console.log('[RetellKB] Displaying KBs:', filteredKbs.length, '(filtered by', linkageSource, ')');

  const items: KnowledgeItem[] = filteredKbs.map((kb: any) => ({
    id: kb.knowledge_base_id,
    name: kb.knowledge_base_name || 'Base de connaissances',
    type: 'text',
    created_at: kb.created_at,
  }));

  return { items, total: filteredKbs.length };
}

// Fetch VAPI knowledge base - filtered by assistant's linked files
async function fetchVapiKB(
  organizationId: string | undefined,
  assistantId: string | undefined
): Promise<KnowledgeBaseResponse> {
  let linkedFileIds: string[] = [];
  let isFilteredByAssistant = false;

  // Try to get assistant config to find linked knowledge base / files
  if (assistantId) {
    try {
      const { data: assistantData, error: assistantError } = await supabase.functions.invoke('vapi-proxy', {
        body: { action: 'getAssistant', organizationId, assistantId },
      });

      if (!assistantError && assistantData?.data) {
        const assistant = assistantData.data;
        console.log('[VapiKB] Assistant data:', JSON.stringify(assistant));

        // Check various possible shapes for knowledge base references
        // knowledgeBase can be an object with fileIds or id
        if (assistant.knowledgeBase) {
          const kb = assistant.knowledgeBase;
          if (Array.isArray(kb.fileIds)) {
            linkedFileIds = kb.fileIds;
            isFilteredByAssistant = true;
          } else if (kb.id) {
            // Fetch the knowledge base to get file IDs
            try {
              const { data: kbData } = await supabase.functions.invoke('vapi-proxy', {
                body: { action: 'getKnowledgeBase', organizationId, knowledgeBaseId: kb.id },
              });
              if (kbData?.data?.fileIds) {
                linkedFileIds = kbData.data.fileIds;
                isFilteredByAssistant = true;
              }
            } catch (kbError) {
              console.warn('[VapiKB] Could not fetch KB details:', kbError);
            }
          }
        }

        // Also check knowledgeBases (array of KB objects)
        if (Array.isArray(assistant.knowledgeBases)) {
          for (const kb of assistant.knowledgeBases) {
            if (Array.isArray(kb.fileIds)) {
              linkedFileIds.push(...kb.fileIds);
              isFilteredByAssistant = true;
            } else if (kb.id) {
              try {
                const { data: kbData } = await supabase.functions.invoke('vapi-proxy', {
                  body: { action: 'getKnowledgeBase', organizationId, knowledgeBaseId: kb.id },
                });
                if (kbData?.data?.fileIds) {
                  linkedFileIds.push(...kbData.data.fileIds);
                  isFilteredByAssistant = true;
                }
              } catch (kbError) {
                console.warn('[VapiKB] Could not fetch KB details:', kbError);
              }
            }
          }
        }

        // Check direct knowledgeBaseId reference
        if (assistant.knowledgeBaseId) {
          try {
            const { data: kbData } = await supabase.functions.invoke('vapi-proxy', {
              body: { action: 'getKnowledgeBase', organizationId, knowledgeBaseId: assistant.knowledgeBaseId },
            });
            if (kbData?.data?.fileIds) {
              linkedFileIds.push(...kbData.data.fileIds);
              isFilteredByAssistant = true;
            }
          } catch (kbError) {
            console.warn('[VapiKB] Could not fetch KB from knowledgeBaseId:', kbError);
          }
        }

        console.log('[VapiKB] Linked file IDs from assistant:', linkedFileIds);
      }
    } catch (e) {
      console.warn('[VapiKB] Could not fetch assistant config for KB filtering:', e);
    }
  }

  // Fetch all files
  const { data, error } = await supabase.functions.invoke('vapi-proxy', {
    body: { action: 'listFiles', organizationId },
  });

  if (error) throw error;

  let files = data?.data || data || [];
  files = Array.isArray(files) ? files : [];

  // Filter by linked file IDs if we found any
  if (isFilteredByAssistant && linkedFileIds.length > 0) {
    files = files.filter((file: any) => linkedFileIds.includes(file.id));
    console.log('[VapiKB] Filtered files by assistant links:', files.length);
  }

  return {
    items: files.map((file: any) => ({
      id: file.id,
      name: file.name || file.filename || 'Fichier',
      type: file.type || 'file',
      url: file.url,
      created_at: file.created_at || file.createdAt,
    })),
    total: files.length,
  };
}

// Add document mutation
export const usePortalAddKnowledgeDocument = () => {
  const { session } = usePortal();
  const queryClient = useQueryClient();
  const platform = session?.platform;
  const organizationId = session?.organizationId;
  const platformAgentId = session?.platformAgentId;

  return useMutation({
    mutationFn: async ({ name, content, url }: { name: string; content?: string; url?: string }) => {
      if (!platform) throw new Error('Platform not available');

      switch (platform) {
        case 'elevenlabs':
          const { data, error } = await supabase.functions.invoke('elevenlabs-convai-knowledge-base', {
            body: { 
              action: 'add',
              agentId: platformAgentId,
              organizationId,
              name,
              content,
              url,
            },
          });
          if (error) throw error;
          return data;

        case 'retell': {
          // First create a knowledge base with the document
          const { data: retellData, error: retellError } = await supabase.functions.invoke('retell-proxy', {
            body: { 
              action: 'createKnowledgeBase',
              organizationId,
              name,
              texts: content ? [{ title: name, content }] : undefined,
              urls: url ? [url] : undefined,
            },
          });
          if (retellError) throw retellError;

          // Then link the new KB to the agent's configuration.
          // NOTE: In Retell, KBs are often attached to the LLM (not the agent).
          const newKbId = retellData?.data?.knowledge_base_id;
          if (newKbId && platformAgentId) {
            console.log('[RetellKB] Linking new KB', newKbId, 'to retell agent/llm', platformAgentId);

            try {
              // Fetch agent to get the LLM id
              const { data: agentResp, error: agentErr } = await supabase.functions.invoke('retell-proxy', {
                body: { action: 'getAgent', organizationId, retellAgentId: platformAgentId },
              });
              if (agentErr) throw agentErr;

              const llmId = agentResp?.data?.response_engine?.llm_id || agentResp?.data?.llm_id;
              if (!llmId) {
                console.warn('[RetellKB] Could not determine llm_id for agent; KB created but not linked');
                return retellData;
              }

              // Get existing LLM KB ids
              const { data: llmResp, error: llmErr } = await supabase.functions.invoke('retell-proxy', {
                body: { action: 'getLlm', organizationId, llmId },
              });
              if (llmErr) throw llmErr;

              const currentKbIds: string[] = Array.isArray(llmResp?.data?.knowledge_base_ids)
                ? llmResp.data.knowledge_base_ids
                : [];

              const updatedKbIds = Array.from(new Set([...currentKbIds, newKbId]));

              // Update LLM with the new KB list
              const { error: updateError } = await supabase.functions.invoke('retell-proxy', {
                body: {
                  action: 'updateLlm',
                  organizationId,
                  llmId,
                  config: { knowledge_base_ids: updatedKbIds },
                },
              });

              if (updateError) {
                console.warn('[RetellKB] Failed to link KB to LLM:', updateError);
              } else {
                console.log('[RetellKB] Successfully linked KB to LLM');
              }
            } catch (e) {
              console.warn('[RetellKB] Failed to link KB after creation:', e);
            }
          }
          
          return retellData;
        }

        case 'vapi':
          const { data: vapiData, error: vapiError } = await supabase.functions.invoke('vapi-proxy', {
            body: { 
              action: 'createFile',
              organizationId,
              name,
              content,
              url,
            },
          });
          if (vapiError) throw vapiError;
          return vapiData;

        default:
          throw new Error(`Platform ${platform} not supported`);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['portal-knowledge-base'] });
    },
  });
};

// Delete document mutation
export const usePortalDeleteKnowledgeDocument = () => {
  const { session } = usePortal();
  const queryClient = useQueryClient();
  const platform = session?.platform;
  const organizationId = session?.organizationId;
  const platformAgentId = session?.platformAgentId;

  return useMutation({
    mutationFn: async (documentId: string) => {
      if (!platform) throw new Error('Platform not available');

      switch (platform) {
        case 'elevenlabs':
          const { data, error } = await supabase.functions.invoke('elevenlabs-convai-knowledge-base', {
            body: { 
              action: 'delete',
              agentId: platformAgentId,
              organizationId,
              documentId,
            },
          });
          if (error) throw error;
          return data;

        case 'retell':
          // For Retell, the documentId IS the knowledge_base_id directly
          const { data: retellData, error: retellError } = await supabase.functions.invoke('retell-proxy', {
            body: { 
              action: 'deleteKnowledgeBase',
              organizationId,
              knowledgeBaseId: documentId,
            },
          });
          if (retellError) throw retellError;
          return retellData;

        case 'vapi':
          const { data: vapiData, error: vapiError } = await supabase.functions.invoke('vapi-proxy', {
            body: { 
              action: 'deleteFile',
              organizationId,
              fileId: documentId,
            },
          });
          if (vapiError) throw vapiError;
          return vapiData;

        default:
          throw new Error(`Platform ${platform} not supported`);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['portal-knowledge-base'] });
    },
  });
};

// Update document mutation
export const usePortalUpdateKnowledgeDocument = () => {
  const { session } = usePortal();
  const queryClient = useQueryClient();
  const platform = session?.platform;
  const organizationId = session?.organizationId;
  const platformAgentId = session?.platformAgentId;

  return useMutation({
    mutationFn: async ({ documentId, name, content, url }: { documentId: string; name?: string; content?: string; url?: string }) => {
      if (!platform) throw new Error('Platform not available');

      switch (platform) {
        case 'elevenlabs': {
          // ElevenLabs doesn't have a direct update endpoint for content
          // We need to delete and recreate, or use rename if only name changes
          if (name && !content && !url) {
            // Just renaming
            const { data, error } = await supabase.functions.invoke('elevenlabs-convai-knowledge-base', {
              body: { 
                action: 'rename',
                agentId: platformAgentId,
                organizationId,
                documentId,
                newName: name,
              },
            });
            if (error) throw error;
            return data;
          } else {
            // For content updates, we need to delete and recreate
            // First delete
            await supabase.functions.invoke('elevenlabs-convai-knowledge-base', {
              body: { 
                action: 'delete',
                agentId: platformAgentId,
                organizationId,
                documentId,
              },
            });
            // Then add new
            const { data, error } = await supabase.functions.invoke('elevenlabs-convai-knowledge-base', {
              body: { 
                action: 'add',
                agentId: platformAgentId,
                organizationId,
                name: name || 'Document',
                content,
                url,
              },
            });
            if (error) throw error;
            return data;
          }
        }

        case 'retell': {
          // Use updateKnowledgeBase action
          const updatePayload: any = {};
          if (name) updatePayload.knowledge_base_name = name;
          if (content) updatePayload.knowledge_base_texts = [{ title: name || 'Document', text: content }];
          if (url) updatePayload.knowledge_base_urls = [url];
          
          const { data, error } = await supabase.functions.invoke('retell-proxy', {
            body: { 
              action: 'updateKnowledgeBase',
              organizationId,
              knowledgeBaseId: documentId,
              ...updatePayload,
            },
          });
          if (error) throw error;
          return data;
        }

        case 'vapi': {
          // Vapi doesn't support direct file update, so delete and recreate
          await supabase.functions.invoke('vapi-proxy', {
            body: { 
              action: 'deleteFile',
              organizationId,
              fileId: documentId,
            },
          });
          
          const { data, error } = await supabase.functions.invoke('vapi-proxy', {
            body: { 
              action: 'createFile',
              organizationId,
              name: name || 'document.txt',
              content,
              url,
            },
          });
          if (error) throw error;
          return data;
        }

        default:
          throw new Error(`Platform ${platform} not supported`);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['portal-knowledge-base'] });
      queryClient.invalidateQueries({ queryKey: ['portal-knowledge-document'] });
    },
  });
};

// Get document content - Fixed to use proper action for each platform
export const usePortalKnowledgeDocument = (documentId: string | null) => {
  const { session } = usePortal();
  const platform = session?.platform;
  const organizationId = session?.organizationId;
  const platformAgentId = session?.platformAgentId;

  return useQuery({
    queryKey: ['portal-knowledge-document', platform, documentId],
    queryFn: async (): Promise<KnowledgeItem> => {
      if (!platform || !documentId) throw new Error('Missing parameters');

      switch (platform) {
        case 'elevenlabs': {
          // Use get_document action to fetch actual content
          const { data, error } = await supabase.functions.invoke('elevenlabs-convai-knowledge-base', {
            body: { 
              action: 'get_document',
              agentId: platformAgentId,
              organizationId,
              documentId,
            },
          });
          if (error) throw error;
          
          const doc = data?.document || data;
          return {
            id: doc.id || documentId,
            name: doc.name || doc.title || 'Document',
            type: doc.type || 'text',
            content: doc.content || doc.text || undefined,
            url: doc.url,
            created_at: doc.created_at,
            contentUnavailableReason: doc.contentUnavailableReason,
          };
        }

        case 'retell': {
          // For Retell, the documentId IS the knowledge_base_id directly
          const { data: retellData, error: retellError } = await supabase.functions.invoke('retell-proxy', {
            body: {
              action: 'getKnowledgeBase',
              organizationId,
              knowledgeBaseId: documentId,
            },
          });
          if (retellError) throw retellError;

          const kb = retellData?.data;
          
          // Parse knowledge_base_sources (new Retell API structure)
          const sources = kb?.knowledge_base_sources || [];
          const documents = sources.filter((s: any) => s.type === 'document');
          const urls = sources.filter((s: any) => s.type === 'url');

          const contentParts: string[] = [];
          
          // Add documents (files)
          if (documents.length > 0) {
            contentParts.push(
              '## Documents\n' +
              documents.map((doc: any) => 
                `- **${doc.filename || 'Document'}**${doc.file_url ? ` ([Télécharger](${doc.file_url}))` : ''}`
              ).join('\n')
            );
          }
          
          // Add URLs
          if (urls.length > 0) {
            contentParts.push(
              '## URLs\n' +
              urls.map((u: any) => `- ${u.url}`).join('\n')
            );
          }

          return {
            id: kb?.knowledge_base_id || documentId,
            name: kb?.knowledge_base_name || 'Base de connaissances',
            type: 'text',
            content: contentParts.join('\n\n') || 'Aucun contenu disponible',
            url: urls.length > 0 ? urls[0].url : undefined,
            created_at: kb?.created_at,
          };
        }

        case 'vapi': {
          // First get file metadata
          const { data: vapiData, error: vapiError } = await supabase.functions.invoke('vapi-proxy', {
            body: { 
              action: 'getFile',
              organizationId,
              fileId: documentId,
            },
          });
          if (vapiError) throw vapiError;
          
          const file = vapiData?.data || vapiData;
          
          // Try to fetch actual content from the file URL if available
          let fileContent: string | undefined;
          let contentUnavailableReason: string | undefined;
          
          if (file.url) {
            try {
              // Use the getFileContent action to download and extract text
              const { data: contentData, error: contentError } = await supabase.functions.invoke('vapi-proxy', {
                body: { 
                  action: 'getFileContent',
                  organizationId,
                  fileId: documentId,
                  fileUrl: file.url,
                },
              });
              
              if (!contentError && contentData?.data?.content) {
                fileContent = contentData.data.content;
              } else if (contentData?.data?.contentUnavailableReason) {
                contentUnavailableReason = contentData.data.contentUnavailableReason;
              }
            } catch (e) {
              console.warn('[VapiKB] Could not fetch file content:', e);
              contentUnavailableReason = 'fetch_error';
            }
          }
          
          return {
            id: file.id || documentId,
            name: file.name || file.filename || 'Fichier',
            type: file.type || 'file',
            content: fileContent,
            url: file.url,
            created_at: file.created_at || file.createdAt,
            contentUnavailableReason,
          };
        }

        default:
          throw new Error(`Platform ${platform} not supported`);
      }
    },
    enabled: !!platform && !!documentId && !!organizationId,
  });
};
