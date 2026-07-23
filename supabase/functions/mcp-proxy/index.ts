import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface MCPRequest {
  action: 'test_connection' | 'list_tools' | 'call_tool';
  server_id: string;
  tool_name?: string;
  tool_args?: Record<string, unknown>;
}

interface MCPServerConfig {
  id: string;
  server_url: string;
  server_type: string;
  auth_type: string;
  auth_config: Record<string, string>;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: { headers: { Authorization: req.headers.get('Authorization')! } }
      }
    );

    // Verify user authentication
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !user) {
      console.error('Auth error:', authError);
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const body: MCPRequest = await req.json();
    const { action, server_id, tool_name, tool_args } = body;

    console.log(`MCP Proxy - Action: ${action}, Server ID: ${server_id}`);

    // Fetch server configuration
    const { data: server, error: serverError } = await supabaseClient
      .from('agent_mcp_servers')
      .select('*')
      .eq('id', server_id)
      .single();

    if (serverError || !server) {
      console.error('Server fetch error:', serverError);
      return new Response(
        JSON.stringify({ error: 'MCP server not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const serverConfig = server as MCPServerConfig;

    // SSRF guard: only https:// and block private/loopback/link-local hosts
    const urlCheck = (() => {
      try {
        const u = new URL(serverConfig.server_url);
        if (u.protocol !== 'https:') return 'scheme';
        const h = u.hostname.toLowerCase();
        if (h === 'localhost' || h === '::1' || h.endsWith('.localhost')) return 'host';
        // IPv4 private/loopback/link-local
        const m = h.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
        if (m) {
          const [a, b] = [parseInt(m[1]), parseInt(m[2])];
          if (a === 10) return 'host';
          if (a === 127) return 'host';
          if (a === 0) return 'host';
          if (a === 169 && b === 254) return 'host';
          if (a === 172 && b >= 16 && b <= 31) return 'host';
          if (a === 192 && b === 168) return 'host';
          if (a >= 224) return 'host'; // multicast/reserved
        }
        // IPv6 private ranges
        if (h.startsWith('fc') || h.startsWith('fd') || h.startsWith('fe80')) return 'host';
        return null;
      } catch { return 'invalid'; }
    })();
    if (urlCheck) {
      return new Response(
        JSON.stringify({ error: `Disallowed server_url (${urlCheck})` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }


    // Build headers based on auth type
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    switch (serverConfig.auth_type) {
      case 'bearer':
        if (serverConfig.auth_config?.token) {
          headers['Authorization'] = `Bearer ${serverConfig.auth_config.token}`;
        }
        break;
      case 'api_key':
        if (serverConfig.auth_config?.header && serverConfig.auth_config?.key) {
          headers[serverConfig.auth_config.header] = serverConfig.auth_config.key;
        }
        break;
      case 'basic':
        if (serverConfig.auth_config?.username && serverConfig.auth_config?.password) {
          const credentials = btoa(`${serverConfig.auth_config.username}:${serverConfig.auth_config.password}`);
          headers['Authorization'] = `Basic ${credentials}`;
        }
        break;
    }

    let result;

    switch (action) {
      case 'test_connection': {
        try {
          // Try to list tools as a connectivity test
          const response = await fetch(`${serverConfig.server_url}`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
              jsonrpc: '2.0',
              id: 1,
              method: 'tools/list',
              params: {},
            }),
          });

          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          }

          const data = await response.json();
          
          // Update last_connected_at
          await supabaseClient
            .from('agent_mcp_servers')
            .update({ last_connected_at: new Date().toISOString() })
            .eq('id', server_id);

          result = { 
            success: true, 
            tools: data.result?.tools || [],
            message: 'Connection successful'
          };
        } catch (error) {
          console.error('Connection test failed:', error);
          result = { 
            success: false, 
            error: error instanceof Error ? error.message : 'Connection failed'
          };
        }
        break;
      }

      case 'list_tools': {
        try {
          const response = await fetch(`${serverConfig.server_url}`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
              jsonrpc: '2.0',
              id: 1,
              method: 'tools/list',
              params: {},
            }),
          });

          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          }

          const data = await response.json();
          result = { 
            tools: data.result?.tools || [],
            success: true
          };
        } catch (error) {
          console.error('List tools failed:', error);
          result = { 
            tools: [], 
            success: false,
            error: error instanceof Error ? error.message : 'Failed to list tools'
          };
        }
        break;
      }

      case 'call_tool': {
        if (!tool_name) {
          return new Response(
            JSON.stringify({ error: 'tool_name is required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        try {
          const response = await fetch(`${serverConfig.server_url}`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
              jsonrpc: '2.0',
              id: 1,
              method: 'tools/call',
              params: {
                name: tool_name,
                arguments: tool_args || {},
              },
            }),
          });

          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          }

          const data = await response.json();
          result = { 
            result: data.result,
            success: true
          };
        } catch (error) {
          console.error('Tool call failed:', error);
          result = { 
            success: false,
            error: error instanceof Error ? error.message : 'Tool call failed'
          };
        }
        break;
      }

      default:
        return new Response(
          JSON.stringify({ error: 'Invalid action' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }

    return new Response(
      JSON.stringify(result),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('MCP Proxy error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
