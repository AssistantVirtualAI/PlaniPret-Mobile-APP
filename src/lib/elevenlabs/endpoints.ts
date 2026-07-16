// Registry of all ElevenLabs backend endpoints available in the portal

export interface ElevenLabsEndpoint {
  id: string;
  name: string;
  description: string;
  functionName: string;
  actions?: string[];
  requiresAgentId?: boolean;
  requiresApiKey?: boolean;
}

export const ELEVENLABS_ENDPOINTS: ElevenLabsEndpoint[] = [
  {
    id: 'conversations',
    name: 'Conversations',
    description: 'Liste et détails des conversations',
    functionName: 'elevenlabs-convai-conversations',
    actions: ['list', 'details', 'audio'],
    requiresAgentId: true,
    requiresApiKey: true,
  },
  {
    id: 'agent-config',
    name: 'Configuration Agent',
    description: 'Prompt système, voix, et paramètres',
    functionName: 'elevenlabs-convai-agent-config',
    actions: ['get', 'update_prompt', 'update_voice', 'get_voices', 'get_models'],
    requiresAgentId: true,
    requiresApiKey: true,
  },
  {
    id: 'knowledge-base',
    name: 'Base de Connaissances',
    description: 'Documents et contenus de la KB',
    functionName: 'elevenlabs-convai-knowledge-base',
    actions: ['list', 'get', 'add', 'delete', 'link_to_agent', 'unlink_from_agent'],
    requiresAgentId: true,
    requiresApiKey: true,
  },
  {
    id: 'analytics',
    name: 'Analytics',
    description: 'Statistiques et métriques',
    functionName: 'elevenlabs-convai-analytics',
    requiresAgentId: true,
    requiresApiKey: true,
  },
  {
    id: 'phone-numbers',
    name: 'Numéros de Téléphone',
    description: 'Gestion des numéros assignés',
    functionName: 'elevenlabs-phone-numbers',
    requiresApiKey: true,
  },
  {
    id: 'signed-url',
    name: 'URL Signée',
    description: 'Génère une URL signée pour le widget',
    functionName: 'elevenlabs-signed-url',
    requiresAgentId: true,
    requiresApiKey: true,
  },
  {
    id: 'sync-conversations',
    name: 'Sync Conversations',
    description: 'Synchronise les conversations avec la DB locale',
    functionName: 'sync-elevenlabs-conversations',
    requiresAgentId: true,
  },
  {
    id: 'all-agents-analytics',
    name: 'Analytics Multi-Agents',
    description: 'Statistiques pour tous les agents',
    functionName: 'elevenlabs-all-agents-analytics',
    requiresApiKey: true,
  },
  {
    id: 'all-agents-conversations',
    name: 'Conversations Multi-Agents',
    description: 'Toutes les conversations de tous les agents',
    functionName: 'elevenlabs-all-agents-conversations',
    requiresApiKey: true,
  },
  {
    id: 'realtime',
    name: 'Realtime',
    description: 'Conversations en temps réel',
    functionName: 'realtime-conversations',
    requiresAgentId: true,
  },
];

export const getEndpointUrl = (functionName: string): string => {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  return `${supabaseUrl}/functions/v1/${functionName}`;
};

export const getEndpointById = (id: string): ElevenLabsEndpoint | undefined => {
  return ELEVENLABS_ENDPOINTS.find(e => e.id === id);
};
