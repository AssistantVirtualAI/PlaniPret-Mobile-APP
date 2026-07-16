import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from '@/context/OrganizationContext';
import { toast } from 'sonner';

export interface MCPServer {
  id: string;
  agent_id: string;
  organization_id: string;
  name: string;
  description: string | null;
  server_url: string;
  server_type: 'http' | 'sse' | 'websocket';
  auth_type: 'none' | 'bearer' | 'api_key' | 'basic';
  auth_config: Record<string, string>;
  tools_enabled: string[];
  is_active: boolean;
  last_connected_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface MCPServerInput {
  name: string;
  description?: string;
  server_url: string;
  server_type: 'http' | 'sse' | 'websocket';
  auth_type: 'none' | 'bearer' | 'api_key' | 'basic';
  auth_config?: Record<string, string>;
  tools_enabled?: string[];
  is_active?: boolean;
}

export interface MCPTool {
  name: string;
  description: string;
  inputSchema?: Record<string, unknown>;
}

export function useAgentMCPServers(agentId: string | undefined) {
  const { selectedOrg } = useOrganization();
  const queryClient = useQueryClient();

  const { data: mcpServers, isLoading, refetch } = useQuery({
    queryKey: ['agent-mcp-servers', agentId],
    queryFn: async () => {
      if (!agentId) return [];
      
      const { data, error } = await supabase
        .from('agent_mcp_servers')
        .select('*')
        .eq('agent_id', agentId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as MCPServer[];
    },
    enabled: !!agentId,
  });

  const addMCPServer = useMutation({
    mutationFn: async (input: MCPServerInput) => {
      if (!agentId || !selectedOrg) {
        throw new Error('Agent ID and organization required');
      }

      const { data, error } = await supabase
        .from('agent_mcp_servers')
        .insert({
          agent_id: agentId,
          organization_id: selectedOrg.id,
          name: input.name,
          description: input.description || null,
          server_url: input.server_url,
          server_type: input.server_type,
          auth_type: input.auth_type,
          auth_config: input.auth_config || {},
          tools_enabled: input.tools_enabled || [],
          is_active: input.is_active ?? true,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agent-mcp-servers', agentId] });
      toast.success('MCP server added successfully');
    },
    onError: (error) => {
      toast.error(`Failed to add MCP server: ${error.message}`);
    },
  });

  const updateMCPServer = useMutation({
    mutationFn: async ({ id, ...input }: Partial<MCPServerInput> & { id: string }) => {
      const { data, error } = await supabase
        .from('agent_mcp_servers')
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
      queryClient.invalidateQueries({ queryKey: ['agent-mcp-servers', agentId] });
      toast.success('MCP server updated successfully');
    },
    onError: (error) => {
      toast.error(`Failed to update MCP server: ${error.message}`);
    },
  });

  const deleteMCPServer = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('agent_mcp_servers')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agent-mcp-servers', agentId] });
      toast.success('MCP server deleted');
    },
    onError: (error) => {
      toast.error(`Failed to delete MCP server: ${error.message}`);
    },
  });

  const toggleMCPServer = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase
        .from('agent_mcp_servers')
        .update({ is_active })
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agent-mcp-servers', agentId] });
    },
  });

  const testConnection = async (serverId: string): Promise<{ success: boolean; tools?: MCPTool[]; error?: string }> => {
    try {
      const { data, error } = await supabase.functions.invoke('mcp-proxy', {
        body: {
          action: 'test_connection',
          server_id: serverId,
        },
      });

      if (error) throw error;
      return data;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Connection test failed';
      return { success: false, error: message };
    }
  };

  const listTools = async (serverId: string): Promise<MCPTool[]> => {
    try {
      const { data, error } = await supabase.functions.invoke('mcp-proxy', {
        body: {
          action: 'list_tools',
          server_id: serverId,
        },
      });

      if (error) throw error;
      return data.tools || [];
    } catch {
      return [];
    }
  };

  return {
    mcpServers: mcpServers || [],
    isLoading,
    refetch,
    addMCPServer,
    updateMCPServer,
    deleteMCPServer,
    toggleMCPServer,
    testConnection,
    listTools,
  };
}
