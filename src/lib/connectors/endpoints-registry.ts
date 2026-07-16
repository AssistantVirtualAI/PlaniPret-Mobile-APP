// Unified endpoints registry for all voice AI platforms
// Supports ElevenLabs, Vapi, Retell and future integrations

export type Platform = 'elevenlabs' | 'vapi' | 'retell';

export interface PlatformEndpoint {
  id: string;
  name: {
    en: string;
    fr: string;
  };
  description: {
    en: string;
    fr: string;
  };
  functionName: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  actions?: string[];
  requiresAgentId?: boolean;
  requiresApiKey?: boolean;
  platforms: Platform[];
}

// Common/Unified endpoints available across multiple platforms
export const UNIFIED_ENDPOINTS: PlatformEndpoint[] = [
  {
    id: 'conversations',
    name: { en: 'Conversations', fr: 'Conversations' },
    description: { 
      en: 'List and details of conversations/calls', 
      fr: 'Liste et détails des conversations/appels' 
    },
    functionName: 'connector-proxy',
    method: 'POST',
    actions: ['listCalls', 'getCallDetails'],
    requiresAgentId: true,
    requiresApiKey: true,
    platforms: ['elevenlabs', 'vapi', 'retell'],
  },
  {
    id: 'analytics',
    name: { en: 'Analytics', fr: 'Analytics' },
    description: { 
      en: 'Statistics and call metrics', 
      fr: 'Statistiques et métriques des appels' 
    },
    functionName: 'connector-proxy',
    method: 'POST',
    actions: ['getAnalytics'],
    requiresApiKey: true,
    platforms: ['elevenlabs', 'vapi', 'retell'],
  },
  {
    id: 'create-call',
    name: { en: 'Create Call', fr: 'Créer un Appel' },
    description: { 
      en: 'Initiate outbound calls', 
      fr: 'Initier des appels sortants' 
    },
    functionName: 'connector-proxy',
    method: 'POST',
    actions: ['createCall'],
    requiresAgentId: true,
    requiresApiKey: true,
    platforms: ['elevenlabs', 'vapi', 'retell'],
  },
];

// ElevenLabs specific endpoints
export const ELEVENLABS_ENDPOINTS: PlatformEndpoint[] = [
  {
    id: 'elevenlabs-conversations',
    name: { en: 'Conversations', fr: 'Conversations' },
    description: { 
      en: 'List and details of conversations', 
      fr: 'Liste et détails des conversations' 
    },
    functionName: 'elevenlabs-convai-conversations',
    method: 'POST',
    actions: ['list', 'details', 'audio'],
    requiresAgentId: true,
    requiresApiKey: true,
    platforms: ['elevenlabs'],
  },
  {
    id: 'elevenlabs-agent-config',
    name: { en: 'Agent Configuration', fr: 'Configuration Agent' },
    description: { 
      en: 'System prompt, voice, and parameters', 
      fr: 'Prompt système, voix, et paramètres' 
    },
    functionName: 'elevenlabs-convai-agent-config',
    method: 'POST',
    actions: ['get', 'update_prompt', 'update_voice', 'get_voices', 'get_models'],
    requiresAgentId: true,
    requiresApiKey: true,
    platforms: ['elevenlabs'],
  },
  {
    id: 'elevenlabs-knowledge-base',
    name: { en: 'Knowledge Base', fr: 'Base de Connaissances' },
    description: { 
      en: 'Documents and KB contents', 
      fr: 'Documents et contenus de la KB' 
    },
    functionName: 'elevenlabs-convai-knowledge-base',
    method: 'POST',
    actions: ['list', 'get', 'add', 'delete', 'link_to_agent', 'unlink_from_agent'],
    requiresAgentId: true,
    requiresApiKey: true,
    platforms: ['elevenlabs'],
  },
  {
    id: 'elevenlabs-analytics',
    name: { en: 'Analytics', fr: 'Analytics' },
    description: { 
      en: 'Statistics and metrics', 
      fr: 'Statistiques et métriques' 
    },
    functionName: 'elevenlabs-convai-analytics',
    method: 'POST',
    requiresAgentId: true,
    requiresApiKey: true,
    platforms: ['elevenlabs'],
  },
  {
    id: 'elevenlabs-phone-numbers',
    name: { en: 'Phone Numbers', fr: 'Numéros de Téléphone' },
    description: { 
      en: 'Manage assigned phone numbers', 
      fr: 'Gestion des numéros assignés' 
    },
    functionName: 'elevenlabs-phone-numbers',
    method: 'POST',
    requiresApiKey: true,
    platforms: ['elevenlabs'],
  },
  {
    id: 'elevenlabs-signed-url',
    name: { en: 'Signed URL', fr: 'URL Signée' },
    description: { 
      en: 'Generate signed URL for widget', 
      fr: 'Génère une URL signée pour le widget' 
    },
    functionName: 'elevenlabs-signed-url',
    method: 'POST',
    requiresAgentId: true,
    requiresApiKey: true,
    platforms: ['elevenlabs'],
  },
  {
    id: 'elevenlabs-sync',
    name: { en: 'Sync Conversations', fr: 'Sync Conversations' },
    description: { 
      en: 'Sync conversations with local DB', 
      fr: 'Synchronise les conversations avec la DB locale' 
    },
    functionName: 'sync-elevenlabs-conversations',
    method: 'POST',
    requiresAgentId: true,
    platforms: ['elevenlabs'],
  },
  {
    id: 'elevenlabs-all-agents-analytics',
    name: { en: 'Multi-Agent Analytics', fr: 'Analytics Multi-Agents' },
    description: { 
      en: 'Statistics for all agents', 
      fr: 'Statistiques pour tous les agents' 
    },
    functionName: 'elevenlabs-all-agents-analytics',
    method: 'POST',
    requiresApiKey: true,
    platforms: ['elevenlabs'],
  },
  {
    id: 'elevenlabs-all-agents-conversations',
    name: { en: 'Multi-Agent Conversations', fr: 'Conversations Multi-Agents' },
    description: { 
      en: 'All conversations from all agents', 
      fr: 'Toutes les conversations de tous les agents' 
    },
    functionName: 'elevenlabs-all-agents-conversations',
    method: 'POST',
    requiresApiKey: true,
    platforms: ['elevenlabs'],
  },
  {
    id: 'elevenlabs-realtime',
    name: { en: 'Realtime', fr: 'Temps Réel' },
    description: { 
      en: 'Real-time conversations', 
      fr: 'Conversations en temps réel' 
    },
    functionName: 'realtime-conversations',
    method: 'POST',
    requiresAgentId: true,
    platforms: ['elevenlabs'],
  },
];

// Vapi specific endpoints
export const VAPI_ENDPOINTS: PlatformEndpoint[] = [
  {
    id: 'vapi-assistants',
    name: { en: 'Assistants', fr: 'Assistants' },
    description: { 
      en: 'Manage Vapi assistants', 
      fr: 'Gestion des assistants Vapi' 
    },
    functionName: 'vapi-proxy',
    method: 'POST',
    actions: ['listAssistants', 'getAssistant', 'updateAssistant', 'createAssistant'],
    requiresApiKey: true,
    platforms: ['vapi'],
  },
  {
    id: 'vapi-calls',
    name: { en: 'Calls', fr: 'Appels' },
    description: { 
      en: 'List and manage calls', 
      fr: 'Liste et gestion des appels' 
    },
    functionName: 'vapi-proxy',
    method: 'POST',
    actions: ['listCalls', 'getCall', 'createCall'],
    requiresAgentId: true,
    requiresApiKey: true,
    platforms: ['vapi'],
  },
  {
    id: 'vapi-phone-numbers',
    name: { en: 'Phone Numbers', fr: 'Numéros de Téléphone' },
    description: { 
      en: 'Manage Vapi phone numbers', 
      fr: 'Gestion des numéros Vapi' 
    },
    functionName: 'vapi-proxy',
    method: 'POST',
    actions: ['listPhoneNumbers', 'getPhoneNumber', 'buyPhoneNumber'],
    requiresApiKey: true,
    platforms: ['vapi'],
  },
  {
    id: 'vapi-analytics',
    name: { en: 'Analytics', fr: 'Analytics' },
    description: { 
      en: 'Call statistics and metrics', 
      fr: 'Statistiques et métriques d\'appels' 
    },
    functionName: 'vapi-proxy',
    method: 'POST',
    actions: ['getAnalytics'],
    requiresApiKey: true,
    platforms: ['vapi'],
  },
  {
    id: 'vapi-squads',
    name: { en: 'Squads', fr: 'Équipes' },
    description: { 
      en: 'Manage assistant squads', 
      fr: 'Gestion des équipes d\'assistants' 
    },
    functionName: 'vapi-proxy',
    method: 'POST',
    actions: ['listSquads', 'getSquad', 'createSquad'],
    requiresApiKey: true,
    platforms: ['vapi'],
  },
];

// Retell specific endpoints
export const RETELL_ENDPOINTS: PlatformEndpoint[] = [
  {
    id: 'retell-agents',
    name: { en: 'Agents', fr: 'Agents' },
    description: { 
      en: 'Manage Retell agents', 
      fr: 'Gestion des agents Retell' 
    },
    functionName: 'retell-proxy',
    method: 'POST',
    actions: ['listAgents', 'getAgent', 'updateAgent', 'createAgent'],
    requiresApiKey: true,
    platforms: ['retell'],
  },
  {
    id: 'retell-calls',
    name: { en: 'Calls', fr: 'Appels' },
    description: { 
      en: 'List and manage calls', 
      fr: 'Liste et gestion des appels' 
    },
    functionName: 'retell-proxy',
    method: 'POST',
    actions: ['listCalls', 'getCall', 'createCall'],
    requiresAgentId: true,
    requiresApiKey: true,
    platforms: ['retell'],
  },
  {
    id: 'retell-phone-numbers',
    name: { en: 'Phone Numbers', fr: 'Numéros de Téléphone' },
    description: { 
      en: 'Manage Retell phone numbers', 
      fr: 'Gestion des numéros Retell' 
    },
    functionName: 'retell-proxy',
    method: 'POST',
    actions: ['listPhoneNumbers', 'getPhoneNumber', 'importPhoneNumber'],
    requiresApiKey: true,
    platforms: ['retell'],
  },
  {
    id: 'retell-analytics',
    name: { en: 'Analytics', fr: 'Analytics' },
    description: { 
      en: 'Call statistics and metrics', 
      fr: 'Statistiques et métriques d\'appels' 
    },
    functionName: 'retell-proxy',
    method: 'POST',
    actions: ['getAnalytics'],
    requiresApiKey: true,
    platforms: ['retell'],
  },
  {
    id: 'retell-llms',
    name: { en: 'LLM Configuration', fr: 'Configuration LLM' },
    description: { 
      en: 'Manage custom LLM settings', 
      fr: 'Configuration des LLM personnalisés' 
    },
    functionName: 'retell-proxy',
    method: 'POST',
    actions: ['listLlms', 'getLlm', 'createLlm', 'updateLlm'],
    requiresApiKey: true,
    platforms: ['retell'],
  },
  {
    id: 'retell-voices',
    name: { en: 'Voices', fr: 'Voix' },
    description: { 
      en: 'Available voice options', 
      fr: 'Options de voix disponibles' 
    },
    functionName: 'retell-proxy',
    method: 'POST',
    actions: ['listVoices', 'getVoice'],
    requiresApiKey: true,
    platforms: ['retell'],
  },
];

// Get all endpoints for a specific platform
export const getEndpointsForPlatform = (platform: Platform): PlatformEndpoint[] => {
  switch (platform) {
    case 'elevenlabs':
      return ELEVENLABS_ENDPOINTS;
    case 'vapi':
      return VAPI_ENDPOINTS;
    case 'retell':
      return RETELL_ENDPOINTS;
    default:
      return [];
  }
};

// Get unified endpoints that work across platforms
export const getUnifiedEndpoints = (): PlatformEndpoint[] => {
  return UNIFIED_ENDPOINTS;
};

// Get endpoint URL
export const getEndpointUrl = (functionName: string): string => {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  return `${supabaseUrl}/functions/v1/${functionName}`;
};

// Get endpoint by ID for a platform
export const getEndpointById = (platform: Platform, id: string): PlatformEndpoint | undefined => {
  const endpoints = getEndpointsForPlatform(platform);
  return endpoints.find(e => e.id === id);
};

// Get platform display name
export const getPlatformDisplayName = (platform: Platform): { en: string; fr: string } => {
  switch (platform) {
    case 'elevenlabs':
      return { en: 'ElevenLabs', fr: 'ElevenLabs' };
    case 'vapi':
      return { en: 'Vapi', fr: 'Vapi' };
    case 'retell':
      return { en: 'Retell AI', fr: 'Retell AI' };
    default:
      return { en: 'Unknown', fr: 'Inconnu' };
  }
};

// Check if platform supports a feature
export const platformSupportsFeature = (
  platform: Platform, 
  feature: 'knowledgeBase' | 'phoneNumbers' | 'analytics' | 'realtime'
): boolean => {
  const featureMap: Record<string, Platform[]> = {
    knowledgeBase: ['elevenlabs'],
    phoneNumbers: ['elevenlabs', 'vapi', 'retell'],
    analytics: ['elevenlabs', 'vapi', 'retell'],
    realtime: ['elevenlabs'],
  };
  return featureMap[feature]?.includes(platform) || false;
};
