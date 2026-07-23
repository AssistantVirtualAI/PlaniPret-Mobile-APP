import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ELEVENLABS_API_BASE = "https://api.elevenlabs.io/v1";

// Validation helpers
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ELEVENLABS_AGENT_ID_REGEX = /^[a-zA-Z0-9]{10,30}$/;
const READ_ACTIONS = ['list', 'get', 'get_document'] as const;
const WRITE_ACTIONS = ['add', 'create_text', 'create_url', 'create_file', 'upload_file', 'delete', 'link_to_agent', 'unlink_from_agent', 'rename'] as const;
const VALID_ACTIONS = [...READ_ACTIONS, ...WRITE_ACTIONS] as const;
type ValidAction = typeof VALID_ACTIONS[number];

function isValidUUID(value: unknown): boolean {
  return typeof value === 'string' && UUID_REGEX.test(value);
}

function isValidAgentId(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  return UUID_REGEX.test(value) || ELEVENLABS_AGENT_ID_REGEX.test(value);
}

function isValidAction(value: unknown): value is ValidAction {
  return typeof value === 'string' && VALID_ACTIONS.includes(value as ValidAction);
}

function isWriteAction(action: ValidAction): boolean {
  return (WRITE_ACTIONS as readonly string[]).includes(action);
}

function sanitizeString(value: unknown, maxLength: number = 10000): string | null {
  if (typeof value !== 'string') return null;
  return value.slice(0, maxLength).trim();
}

function isValidUrl(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol);
  } catch {
    return false;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    
    // Create service client for DB operations
    const supabaseService = createClient(supabaseUrl, supabaseServiceKey);

    // Handle both JSON and multipart/form-data requests
    const contentType = req.headers.get('content-type') || '';
    let body: any = {};
    let uploadedFile: File | null = null;

    if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData();
      body = {
        action: formData.get('action') as string,
        agentId: formData.get('agentId') as string,
        apiKey: formData.get('apiKey') as string,
        organizationId: formData.get('organizationId') as string,
        title: formData.get('title') as string,
        documentId: formData.get('documentId') as string,
      };
      const fileEntry = formData.get('file');
      if (fileEntry && fileEntry instanceof File) {
        uploadedFile = fileEntry;
      }
    } else {
      body = await req.json();
    }

    const { action, agentId, apiKey, documentId, title, content, url, category, itemId, search, pageSize, newName } = body;

    // Validate action
    if (!action) {
      return new Response(
        JSON.stringify({ error: 'Action is required', success: false }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!isValidAction(action)) {
      return new Response(
        JSON.stringify({ error: `Invalid action. Must be one of: ${VALID_ACTIONS.join(', ')}`, success: false }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate agentId if provided
    if (agentId && !isValidAgentId(agentId)) {
      return new Response(
        JSON.stringify({ error: 'Invalid agent ID format', success: false }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate documentId/itemId if provided
    const docId = documentId || itemId;
    if (docId && typeof docId === 'string' && docId.length > 100) {
      return new Response(
        JSON.stringify({ error: 'Document ID too long', success: false }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Sanitize text inputs
    const sanitizedTitle = title ? sanitizeString(title, 500) : null;
    const sanitizedContent = content ? sanitizeString(content, 100000) : null;
    const sanitizedCategory = category ? sanitizeString(category, 100) : null;
    const sanitizedSearch = search ? sanitizeString(search, 200) : null;
    const sanitizedNewName = newName ? sanitizeString(newName, 500) : null;

    // Validate URL if provided
    if (url && !isValidUrl(url)) {
      return new Response(
        JSON.stringify({ error: 'Invalid URL format', success: false }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    console.log(`[KB] Action: ${action}, agentId: ${agentId}`);

    // ============ RBAC CHECK FOR WRITE ACTIONS ============
    if (isWriteAction(action)) {
      const authHeader = req.headers.get('Authorization');
      const bodyOrganizationId = body.organizationId;
      
      let authorized = false;

      if (authHeader) {
        // Path 1: Supabase JWT authentication (admin portal)
        const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey, {
          global: { headers: { Authorization: authHeader } }
        });

        const token = authHeader.replace('Bearer ', '');
        const { data: { user }, error: userError } = await supabaseAuth.auth.getUser(token);
        
        if (user && !userError) {
          console.log(`[KB] User ${user.id} attempting write action: ${action}`);

          // Check if super admin
          const { data: isSuperAdmin } = await supabaseService.rpc('is_super_admin', { _user_id: user.id });
          
          if (isSuperAdmin) {
            console.log('[KB] User is super admin, access granted');
            authorized = true;
          } else {
            // Need to check org_admin role for the agent's organization
            let orgId: string | null = null;

            if (agentId && isValidUUID(agentId)) {
              const { data: agent } = await supabaseService
                .from('agents')
                .select('organization_id')
                .eq('id', agentId)
                .single();
              if (agent) orgId = agent.organization_id;
            }

            if (!orgId && agentId) {
              const { data: agent } = await supabaseService
                .from('agents')
                .select('organization_id')
                .eq('platform_agent_id', agentId)
                .single();
              if (agent) orgId = agent.organization_id;
            }

            if (orgId) {
              const { data: hasRole } = await supabaseService.rpc('has_role', { 
                _user_id: user.id, 
                _org_id: orgId,
                _role: 'org_admin'
              });
              if (hasRole) {
                console.log('[KB] User has org_admin role, access granted');
                authorized = true;
              }
            }
          }
        }
      }
      
      // Path 2: Client portal authentication via organizationId + agentId
      if (!authorized && bodyOrganizationId && agentId) {
        console.log(`[KB] Attempting client portal auth: orgId=${bodyOrganizationId}, agentId=${agentId}`);
        
        // Verify the organization exists
        const { data: org } = await supabaseService
          .from('organizations')
          .select('id')
          .eq('id', bodyOrganizationId)
          .maybeSingle();
        
        if (org) {
          // Verify the agent belongs to this organization
          let agentBelongsToOrg = false;
          
          if (isValidUUID(agentId)) {
            const { data: agent } = await supabaseService
              .from('agents')
              .select('id')
              .eq('id', agentId)
              .eq('organization_id', bodyOrganizationId)
              .maybeSingle();
            agentBelongsToOrg = !!agent;
          }
          
          if (!agentBelongsToOrg) {
            const { data: agent } = await supabaseService
              .from('agents')
              .select('id')
              .eq('platform_agent_id', agentId)
              .eq('organization_id', bodyOrganizationId)
              .maybeSingle();
            agentBelongsToOrg = !!agent;
          }
          
          if (agentBelongsToOrg) {
            console.log('[KB] Client portal auth: agent belongs to organization, access granted');
            authorized = true;
          } else {
            console.log('[KB] Client portal auth: agent does not belong to organization');
          }
        } else {
          console.log('[KB] Client portal auth: organization not found');
        }
      }

      if (!authorized) {
        console.log('[KB] Write action denied: no valid auth path');
        return new Response(
          JSON.stringify({ error: 'Accès refusé. Authentification requise pour cette action.', success: false }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // ============ GET API KEY ============
    let elevenLabsApiKey = apiKey;
    let platformAgentId: string | null = null;
    
    if (agentId) {
      let agent = null;
      
      // First try by UUID (internal id)
      if (isValidUUID(agentId)) {
        const { data } = await supabaseService
          .from("agents")
          .select("platform_agent_id, platform_api_key, organization_id, config, name")
          .eq("id", agentId)
          .single();
        agent = data;
      }
      
      // If not found or agentId is not UUID, try by platform_agent_id (ElevenLabs ID)
      if (!agent) {
        const { data } = await supabaseService
          .from("agents")
          .select("platform_agent_id, platform_api_key, organization_id, config, name")
          .eq("platform_agent_id", agentId)
          .single();
        agent = data;
      }

      if (agent) {
        platformAgentId = agent.platform_agent_id;
        
        if (agent.platform_api_key) {
          elevenLabsApiKey = agent.platform_api_key;
        } else if ((agent.config as any)?.api_key) {
          elevenLabsApiKey = (agent.config as any).api_key;
        }
        
        if (!elevenLabsApiKey && agent.organization_id) {
          const { data: integration } = await supabaseService
            .from("organization_integrations")
            .select("api_key")
            .eq("organization_id", agent.organization_id)
            .eq("platform", "elevenlabs")
            .eq("is_active", true)
            .maybeSingle();

          if (integration?.api_key) {
            elevenLabsApiKey = integration.api_key;
          }
        }
        
        console.log(`[KB] Agent: ${agent.name}, platformAgentId: ${platformAgentId}`);
      } else {
        // If still no agent found but agentId looks like ElevenLabs ID, use it directly as platformAgentId
        if (!isValidUUID(agentId)) {
          platformAgentId = agentId;
          console.log(`[KB] Using agentId directly as platformAgentId: ${platformAgentId}`);
        }
      }
    }

    if (!elevenLabsApiKey) {
      console.log("[KB] No ElevenLabs API key found");
      return new Response(
        JSON.stringify({ 
          requiresSetup: true, 
          message: "Configuration ElevenLabs requise. Veuillez configurer votre clé API." 
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Helper function for ElevenLabs API calls
    const callElevenLabs = async (endpoint: string, options: RequestInit = {}) => {
      const fullUrl = `${ELEVENLABS_API_BASE}${endpoint}`;
      console.log(`[KB] Calling: ${options.method || 'GET'} ${fullUrl}`);
      
      const response = await fetch(fullUrl, {
        ...options,
        headers: {
          "xi-api-key": elevenLabsApiKey,
          ...options.headers,
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[KB] ElevenLabs API error ${response.status}: ${errorText}`);
        throw new Error(`ElevenLabs API error ${response.status}: ${errorText}`);
      }

      if (response.status === 204 || (options.method === 'DELETE' && response.status < 300)) {
        return { success: true };
      }

      return response.json();
    };

    switch (action) {
      case "list":
      case "get": {
        // Fetch ALL documents with pagination to ensure we get everything
        const allDocuments: any[] = [];
        let cursor: string | null = null;
        let fetchCount = 0;
        const maxFetches = 10; // Safety limit
        
        // Check if this is from client portal (has organizationId context)
        const isPortalContext = !!body.organizationId;
        
        console.log(`[KB] Fetching knowledge base list for agent ${platformAgentId || 'all'}, portal context: ${isPortalContext}`);
        
        do {
          const params = new URLSearchParams();
          params.append("page_size", "100"); // ElevenLabs max is 100
          if (sanitizedSearch) params.append("search", sanitizedSearch);
          if (cursor) params.append("cursor", cursor);
          
          const queryString = `?${params.toString()}`;
          const data = await callElevenLabs(`/convai/knowledge-base${queryString}`);
          
          const documents = data.documents || data.knowledge_base || [];
          allDocuments.push(...documents);
          
          cursor = data.next_cursor || null;
          fetchCount++;
          
          console.log(`[KB] Fetched page ${fetchCount}: ${documents.length} documents, has_more: ${!!data.has_more}`);
        } while (cursor && fetchCount < maxFetches);
        
        console.log(`[KB] Total documents fetched: ${allDocuments.length}`);
        
      let filteredDocs = allDocuments;
      if (platformAgentId) {
        // Fetch the agent's current KB list (updated immediately via PATCH)
        let agentKbIds: string[] = [];
        try {
          const agentConfig = await callElevenLabs(`/convai/agents/${platformAgentId}`);
          const kbArray = agentConfig?.conversation_config?.agent?.prompt?.knowledge_base || [];
          agentKbIds = kbArray.map((kb: any) => kb.id || kb).filter(Boolean);
          console.log(`[KB] Agent KB IDs from config (conversation_config path): ${agentKbIds.length} items`);
        } catch (e) {
          console.error(`[KB] Could not fetch agent config for filtering:`, e);
        }

        filteredDocs = allDocuments.filter((doc: any) => {
          // Check 1: document is in the agent's knowledge_base array (immediate, always reliable)
          if (agentKbIds.includes(doc.id)) return true;

          // Check 2: dependent_agents metadata (may lag after creation)
          const dependentAgents = doc.dependent_agents || [];
          return dependentAgents.some((a: any) =>
            a.id === platformAgentId ||
            a.agent_id === platformAgentId ||
            a.platform_agent_id === platformAgentId
          );
        });
        console.log(`[KB] After filtering for agent ${platformAgentId}: ${filteredDocs.length} documents`);
      }
        
        const items = filteredDocs.map((doc: any) => ({
          id: doc.id,
          name: doc.name,
          title: doc.name,
          type: doc.type || 'text',
          content: doc.text || doc.content || '',
          category: doc.metadata?.category || doc.metadata?.tag || 'Général',
          url: doc.url,
          file_name: doc.file_name || doc.name,
          file_size: doc.metadata?.size_bytes || doc.size_bytes,
          created_at: doc.metadata?.created_at_unix_secs 
            ? new Date(doc.metadata.created_at_unix_secs * 1000).toISOString()
            : doc.created_at,
          updated_at: doc.metadata?.last_updated_at_unix_secs
            ? new Date(doc.metadata.last_updated_at_unix_secs * 1000).toISOString()
            : doc.updated_at,
          dependent_agents: doc.dependent_agents || [],
          metadata: doc.metadata || {},
        }));
        
        const categories = [...new Set(items.map((item: any) => item.category).filter(Boolean))];

        return new Response(
          JSON.stringify({ 
            knowledge_base: { 
              items,
              categories,
              total: items.length,
              all_documents_count: allDocuments.length
            } 
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "get_document": {
        const docId = documentId || itemId;
        if (!docId) {
          throw new Error("documentId requis pour get_document");
        }
        
        console.log(`[KB] Fetching document metadata for: ${docId}`);
        const doc = await callElevenLabs(`/convai/knowledge-base/${docId}`);
        console.log(`[KB] Document metadata:`, JSON.stringify(doc));
        
        // Fetch the actual content from the /content endpoint
        let textContent: string | null = null;
        let contentUnavailableReason: string | null = null;
        
        try {
          console.log(`[KB] Fetching document content from /content endpoint`);
          const contentResponse = await fetch(
            `${ELEVENLABS_API_BASE}/convai/knowledge-base/${docId}/content`,
            {
              headers: { "xi-api-key": elevenLabsApiKey }
            }
          );
          
          console.log(`[KB] Content endpoint status: ${contentResponse.status}`);
          const contentType = contentResponse.headers.get('content-type') || '';
          console.log(`[KB] Content-Type: ${contentType}`);
          
          if (contentResponse.ok) {
            if (contentType.includes('application/json')) {
              // ElevenLabs might return JSON with text field
              const jsonData = await contentResponse.json();
              textContent = jsonData.text || jsonData.content || JSON.stringify(jsonData);
              console.log(`[KB] Content parsed from JSON, length: ${textContent?.length || 0}`);
            } else {
              // Plain text response
              textContent = await contentResponse.text();
              console.log(`[KB] Content fetched as text, length: ${textContent?.length || 0}`);
            }
            
            // Check if content is empty for file types
            if (!textContent && (doc.type === 'file' || doc.type === 'pdf')) {
              contentUnavailableReason = 'binary_or_not_extractible';
            }
          } else if (contentResponse.status === 404) {
            console.log(`[KB] Content not found for document`);
            contentUnavailableReason = 'content_not_found';
          } else {
            console.log(`[KB] Content endpoint returned status: ${contentResponse.status}`);
            contentUnavailableReason = 'fetch_error';
          }
        } catch (contentError) {
          console.log(`[KB] Could not fetch content for ${docId}:`, contentError);
          contentUnavailableReason = 'fetch_exception';
        }
        
        return new Response(
          JSON.stringify({ 
            success: true, 
            document: {
              id: doc.id,
              name: doc.name,
              type: doc.type,
              content: textContent || doc.text || doc.content || null,
              content_unavailable_reason: contentUnavailableReason,
              url: doc.url,
              file_size: doc.metadata?.size_bytes,
              created_at: doc.metadata?.created_at_unix_secs 
                ? new Date(doc.metadata.created_at_unix_secs * 1000).toISOString()
                : null,
              dependent_agents: doc.dependent_agents || [],
            }
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "add":
      case "create_text": {
        const docName = sanitizedTitle || `Document ${new Date().toISOString()}`;
        const docContent = sanitizedContent || "";
        
        if (!docContent) {
          return new Response(
            JSON.stringify({ error: "Le contenu est requis pour créer un document texte", success: false }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        console.log(`[KB] Creating text document: ${docName}`);
        
        const data = await callElevenLabs("/convai/knowledge-base/text", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: docName,
            text: docContent,
          }),
        });

        console.log(`[KB] Created document: ${JSON.stringify(data)}`);
        
        if (platformAgentId && data.id) {
          try {
            console.log(`[KB] Linking document ${data.id} to agent ${platformAgentId}`);
            
            const agentConfig = await callElevenLabs(`/convai/agents/${platformAgentId}`);
            const currentKb = agentConfig?.conversation_config?.agent?.prompt?.knowledge_base || [];
            const alreadyLinked = currentKb.some((kb: any) => kb.id === data.id);
            
            if (!alreadyLinked) {
              currentKb.push({ type: "file", name: docName, id: data.id });
              
              await callElevenLabs(`/convai/agents/${platformAgentId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  conversation_config: {
                    agent: {
                      prompt: {
                        knowledge_base: currentKb
                      }
                    }
                  }
                }),
              });
              console.log(`[KB] Document linked to agent via conversation_config path`);
            }
          } catch (linkError) {
            console.error(`[KB] Failed to link document to agent:`, linkError);
          }
        }

        return new Response(
          JSON.stringify({ 
            success: true, 
            documentId: data.id,
            message: "Document créé avec succès"
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "create_url": {
        if (!url) {
          return new Response(
            JSON.stringify({ error: "L'URL est requise pour créer un document depuis une URL", success: false }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        console.log(`[KB] Creating URL document: ${url}`);
        
        const data = await callElevenLabs("/convai/knowledge-base/url", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            url: url,
            name: sanitizedTitle || url,
          }),
        });

        console.log(`[KB] Created URL document: ${JSON.stringify(data)}`);

        if (platformAgentId && data.id) {
          try {
            const agentConfig = await callElevenLabs(`/convai/agents/${platformAgentId}`);
            const currentKb = agentConfig?.conversation_config?.agent?.prompt?.knowledge_base || [];
            const alreadyLinked = currentKb.some((kb: any) => kb.id === data.id);
            
            if (!alreadyLinked) {
              currentKb.push({ type: "file", name: sanitizedTitle || url, id: data.id });
              
              await callElevenLabs(`/convai/agents/${platformAgentId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  conversation_config: {
                    agent: {
                      prompt: {
                        knowledge_base: currentKb
                      }
                    }
                  }
                }),
              });
              console.log(`[KB] URL document linked to agent via conversation_config path`);
            }
          } catch (linkError) {
            console.error(`[KB] Failed to link URL document to agent:`, linkError);
          }
        }

        return new Response(
          JSON.stringify({ 
            success: true, 
            documentId: data.id,
            message: "Document créé depuis l'URL avec succès"
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "create_file":
      case "upload_file": {
        if (!uploadedFile) {
          return new Response(
            JSON.stringify({ error: "Un fichier est requis pour cette action", success: false }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const fileName = sanitizedTitle || uploadedFile.name || `File ${new Date().toISOString()}`;
        console.log(`[KB] Uploading file: ${fileName} (${uploadedFile.size} bytes, type: ${uploadedFile.type})`);
        
        // Build multipart form data for ElevenLabs
        const formData = new FormData();
        formData.append('file', uploadedFile, uploadedFile.name);
        if (sanitizedTitle) {
          formData.append('name', sanitizedTitle);
        }

        const fullUrl = `${ELEVENLABS_API_BASE}/convai/knowledge-base/file`;
        console.log(`[KB] Calling: POST ${fullUrl}`);
        
        const response = await fetch(fullUrl, {
          method: "POST",
          headers: {
            "xi-api-key": elevenLabsApiKey,
          },
          body: formData,
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error(`[KB] ElevenLabs file upload error ${response.status}: ${errorText}`);
          throw new Error(`ElevenLabs API error ${response.status}: ${errorText}`);
        }

        const data = await response.json();
        console.log(`[KB] File uploaded: ${JSON.stringify(data)}`);

        // Link to agent
        if (platformAgentId && data.id) {
          try {
            console.log(`[KB] Linking file document ${data.id} to agent ${platformAgentId}`);
            const agentConfig = await callElevenLabs(`/convai/agents/${platformAgentId}`);
            const currentKb = agentConfig?.conversation_config?.agent?.prompt?.knowledge_base || [];
            const alreadyLinked = currentKb.some((kb: any) => kb.id === data.id);
            
            if (!alreadyLinked) {
              currentKb.push({ type: "file", name: fileName, id: data.id });
              
              await callElevenLabs(`/convai/agents/${platformAgentId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  conversation_config: {
                    agent: {
                      prompt: {
                        knowledge_base: currentKb
                      }
                    }
                  }
                }),
              });
              console.log(`[KB] File document linked to agent via conversation_config path`);
            }
          } catch (linkError) {
            console.error(`[KB] Failed to link file document to agent:`, linkError);
          }
        }

        return new Response(
          JSON.stringify({ 
            success: true, 
            documentId: data.id,
            message: "Fichier uploadé avec succès"
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "rename": {
        const docIdToRename = documentId || itemId;
        
        if (!docIdToRename) {
          throw new Error("documentId requis pour renommer");
        }
        
        if (!sanitizedNewName) {
          throw new Error("newName requis pour renommer");
        }

        console.log(`[KB] Renaming document ${docIdToRename} to: ${sanitizedNewName}`);
        
        await callElevenLabs(`/convai/knowledge-base/${docIdToRename}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: sanitizedNewName,
          }),
        });

        return new Response(
          JSON.stringify({ 
            success: true, 
            message: "Document renommé avec succès" 
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "delete": {
        const docIdToDelete = documentId || itemId;
        
        if (!docIdToDelete) {
          throw new Error("documentId requis pour supprimer");
        }

        console.log(`[KB] Deleting document: ${docIdToDelete}`);
        
        await callElevenLabs(`/convai/knowledge-base/${docIdToDelete}?force=true`, {
          method: "DELETE",
        });

        return new Response(
          JSON.stringify({ 
            success: true, 
            message: "Document supprimé avec succès" 
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "link_to_agent": {
        const docId = documentId || itemId;
        if (!docId || !platformAgentId) {
          throw new Error("documentId et agentId requis pour lier un document");
        }

        const agentConfig = await callElevenLabs(`/convai/agents/${platformAgentId}`);
        const currentKb = agentConfig?.conversation_config?.agent?.prompt?.knowledge_base || [];
        const alreadyLinked = currentKb.some((kb: any) => kb.id === docId);
        
        if (!alreadyLinked) {
          currentKb.push({ type: "file", name: docId, id: docId });
          
          await callElevenLabs(`/convai/agents/${platformAgentId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              conversation_config: {
                agent: {
                  prompt: {
                    knowledge_base: currentKb
                  }
                }
              }
            }),
          });
        }

        return new Response(
          JSON.stringify({ 
            success: true, 
            message: "Document lié à l'agent avec succès" 
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "unlink_from_agent": {
        const docId = documentId || itemId;
        if (!docId || !platformAgentId) {
          throw new Error("documentId et agentId requis pour délier un document");
        }

        const agentConfig = await callElevenLabs(`/convai/agents/${platformAgentId}`);
        const currentKb = (agentConfig?.conversation_config?.agent?.prompt?.knowledge_base || [])
          .filter((kb: any) => kb.id !== docId);

        await callElevenLabs(`/convai/agents/${platformAgentId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            conversation_config: {
              agent: {
                prompt: {
                  knowledge_base: currentKb
                }
              }
            }
          }),
        });

        return new Response(
          JSON.stringify({ 
            success: true, 
            message: "Document délié de l'agent avec succès" 
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      default:
        return new Response(
          JSON.stringify({ error: 'Action non reconnue', success: false }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }
  } catch (error: unknown) {
    console.error("[KB] Error:", error);
    const errorMessage = error instanceof Error ? error.message : "Une erreur est survenue";
    return new Response(
      JSON.stringify({ 
        error: errorMessage,
        success: false 
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
