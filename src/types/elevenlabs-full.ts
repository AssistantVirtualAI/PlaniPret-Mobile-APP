// Complete ElevenLabs Configuration Types

// ============= TTS Settings =============
export interface TTSSettings {
  voice_id: string;
  model_id?: string;
  stability?: number;
  similarity_boost?: number;
  style?: number;
  speed?: number;
  optimize_streaming_latency?: number;
  pronunciation_dictionary_locators?: string[];
  agent_output_audio_format?: string;
  use_speaker_boost?: boolean;
}

// ============= ASR/STT Settings =============
export interface ASRSettings {
  provider?: 'elevenlabs' | 'deepgram' | 'google';
  quality?: 'high' | 'standard';
  user_input_audio_format?: string;
  keywords?: string[];
}

// ============= Turn Settings =============
export interface TurnSettings {
  turn_timeout?: number;
  silence_end_call_timeout?: number;
  turn_eagerness?: 'eager' | 'normal' | 'relaxed';
  soft_timeout_config?: {
    timeout_seconds: number;
    message: string;
  };
  mode?: 'turn_based' | 'off';
}

// ============= Conversation Settings =============
export interface ConversationSettings {
  max_duration_seconds?: number;
  client_events?: string[];
}

// ============= Agent Advanced Settings =============
export interface AgentAdvancedSettings {
  language?: string;
  disable_first_message_interruptions?: boolean;
}

// ============= Platform Settings =============
export interface WidgetConfig {
  avatar?: {
    type: 'orb' | 'image' | 'url';
    url?: string;
    color_1?: string;
    color_2?: string;
  };
  bg_color?: string;
  text_color?: string;
  btn_color?: string;
  btn_text_color?: string;
  border_radius?: string;
  feedback_enabled?: boolean;
  show_avatar?: boolean;
  cta_label?: string;
  page_title?: string;
}

export interface AuthConfig {
  require_auth?: boolean;
  allowed_origins?: string[];
  shareable_token?: string;
  enable_auth?: boolean;
}

export interface DataCollectionConfig {
  collect_email?: boolean;
  collect_phone?: boolean;
  collect_name?: boolean;
}

export interface PrivacyConfig {
  record_voice?: boolean;
  retention_days?: number;
  gdpr_compliant?: boolean;
}

export interface PlatformSettings {
  widget?: WidgetConfig;
  auth?: AuthConfig;
  data_collection?: DataCollectionConfig;
  privacy?: PrivacyConfig;
}

// ============= Tools =============
export interface AgentTool {
  type: 'webhook' | 'client' | 'system';
  name: string;
  description: string;
  api_schema?: {
    url: string;
    method: 'GET' | 'POST' | 'PUT' | 'DELETE';
    headers?: Record<string, string>;
  };
  parameters?: {
    type: 'object';
    properties: Record<string, {
      type: string;
      description: string;
      required?: boolean;
    }>;
    required?: string[];
  };
}

// ============= Webhooks =============
export interface WebhookConfig {
  post_call_webhook_url?: string;
  post_call_webhook_headers?: Record<string, string>;
  events?: string[];
}

// ============= LLM Settings =============
export interface LLMSettings {
  model?: string;
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  frequency_penalty?: number;
  presence_penalty?: number;
}

// ============= Voice Info =============
export interface ElevenLabsVoice {
  voice_id: string;
  name: string;
  category?: string;
  labels?: Record<string, string>;
  preview_url?: string;
  description?: string;
  samples?: {
    sample_id: string;
    file_name: string;
    mime_type: string;
    size_bytes: number;
    hash: string;
  }[];
}

// ============= Model Info =============
export interface ElevenLabsModel {
  model_id: string;
  name: string;
  can_be_finetuned: boolean;
  can_do_text_to_speech: boolean;
  can_do_voice_conversion: boolean;
  can_use_style: boolean;
  can_use_speaker_boost: boolean;
  serves_pro_voices: boolean;
  token_cost_factor: number;
  description: string;
  requires_alpha_access: boolean;
  max_characters_request_free_user: number;
  max_characters_request_subscribed_user: number;
  languages?: {
    language_id: string;
    name: string;
  }[];
}

// ============= Full Agent Config =============
export interface ElevenLabsFullAgentConfig {
  agent_id: string;
  name?: string;
  conversation_config?: {
    agent?: {
      prompt?: {
        prompt?: string;
        llm?: LLMSettings;
        tools?: AgentTool[];
      };
      first_message?: string;
      language?: string;
      tools?: AgentTool[];
    };
    tts?: TTSSettings;
    stt?: ASRSettings;
    turn?: TurnSettings;
    conversation?: ConversationSettings;
  };
  platform_settings?: PlatformSettings;
  knowledge_base?: any[];
  metadata?: Record<string, any>;
}

// ============= Agent Template =============
export interface ElevenLabsAgentTemplate {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  category: 'support' | 'sales' | 'service' | 'scheduling' | 'general';
  // Agent settings
  systemPrompt: string;
  firstMessage: string;
  language: string;
  // TTS settings optimized for use case
  tts: TTSSettings;
  // ASR settings
  asr: ASRSettings;
  // Turn settings
  turn: TurnSettings;
  // Conversation settings
  conversation: ConversationSettings;
  // LLM settings
  llm?: LLMSettings;
  tags: string[];
}

// ============= Phone Number Types =============
export interface ElevenLabsPhoneNumber {
  phone_number_id: string;
  phone_number: string;
  label?: string;
  agent_id?: string;
  phone_number_type: 'twilio' | 'sip';
  twilio_config?: {
    account_sid: string;
    auth_token: string;
    phone_number_sid: string;
  };
  sip_config?: {
    sip_trunk_uri: string;
    username?: string;
    password?: string;
  };
  created_at?: string;
}

// ============= Available Languages =============
export const ELEVENLABS_LANGUAGES = [
  { code: 'en', name: 'English' },
  { code: 'fr', name: 'Français' },
  { code: 'es', name: 'Español' },
  { code: 'de', name: 'Deutsch' },
  { code: 'it', name: 'Italiano' },
  { code: 'pt', name: 'Português' },
  { code: 'nl', name: 'Nederlands' },
  { code: 'pl', name: 'Polski' },
  { code: 'ja', name: '日本語' },
  { code: 'ko', name: '한국어' },
  { code: 'zh', name: '中文' },
  { code: 'ar', name: 'العربية' },
  { code: 'hi', name: 'हिंदी' },
  { code: 'ru', name: 'Русский' },
  { code: 'tr', name: 'Türkçe' },
] as const;

// ============= Client Events =============
export const ELEVENLABS_CLIENT_EVENTS = [
  { id: 'audio', name: 'Audio', description: 'Recevoir les chunks audio' },
  { id: 'transcript', name: 'Transcription', description: 'Recevoir les transcriptions' },
  { id: 'interruption', name: 'Interruption', description: "Notifier lors d'une interruption" },
  { id: 'agent_response', name: 'Réponse Agent', description: "Recevoir les réponses de l'agent" },
  { id: 'user_transcript', name: 'Transcription Utilisateur', description: "Recevoir les transcriptions de l'utilisateur" },
  { id: 'vad', name: 'Détection Voix', description: "Détection d'activité vocale" },
] as const;

// ============= Turn Eagerness Options =============
export const TURN_EAGERNESS_OPTIONS = [
  { value: 'eager', label: 'Rapide', description: "L'agent répond rapidement, peut interrompre" },
  { value: 'normal', label: 'Normal', description: 'Équilibre entre rapidité et patience' },
  { value: 'relaxed', label: 'Patient', description: "L'agent attend que l'utilisateur finisse" },
] as const;

// ============= ASR Providers =============
export const ASR_PROVIDERS = [
  { value: 'elevenlabs', label: 'ElevenLabs', description: 'STT natif ElevenLabs' },
  { value: 'deepgram', label: 'Deepgram', description: 'STT haute précision' },
  { value: 'google', label: 'Google Cloud', description: 'Google Speech-to-Text' },
] as const;

// ============= TTS Models =============
export const TTS_MODELS = [
  { id: 'eleven_turbo_v2_5', name: 'Turbo v2.5', description: 'Faible latence, haute qualité' },
  { id: 'eleven_turbo_v2', name: 'Turbo v2', description: 'Faible latence' },
  { id: 'eleven_multilingual_v2', name: 'Multilingual v2', description: 'Multi-langues, haute qualité' },
  { id: 'eleven_monolingual_v1', name: 'Monolingual v1', description: 'Anglais uniquement, legacy' },
  { id: 'eleven_flash_v2', name: 'Flash v2', description: 'Ultra-faible latence' },
  { id: 'eleven_flash_v2_5', name: 'Flash v2.5', description: 'Ultra-faible latence, amélioré' },
] as const;

// ============= Output Formats =============
export const OUTPUT_FORMATS = [
  { id: 'mp3_22050_32', name: 'MP3 22kHz 32kbps', description: 'Taille réduite' },
  { id: 'mp3_44100_32', name: 'MP3 44kHz 32kbps', description: 'Qualité standard' },
  { id: 'mp3_44100_64', name: 'MP3 44kHz 64kbps', description: 'Bonne qualité' },
  { id: 'mp3_44100_96', name: 'MP3 44kHz 96kbps', description: 'Haute qualité' },
  { id: 'mp3_44100_128', name: 'MP3 44kHz 128kbps', description: 'Très haute qualité (défaut)' },
  { id: 'mp3_44100_192', name: 'MP3 44kHz 192kbps', description: 'Qualité maximale (Creator+)' },
  { id: 'pcm_16000', name: 'PCM 16kHz', description: 'Audio brut 16kHz' },
  { id: 'pcm_22050', name: 'PCM 22kHz', description: 'Audio brut 22kHz' },
  { id: 'pcm_24000', name: 'PCM 24kHz', description: 'Audio brut 24kHz' },
  { id: 'pcm_44100', name: 'PCM 44kHz', description: 'Audio brut 44kHz (Pro+)' },
  { id: 'ulaw_8000', name: 'μ-law 8kHz', description: 'Téléphonie (Twilio)' },
] as const;

// ============= Pronunciation Dictionary =============
export interface PronunciationDictionary {
  id: string;
  name: string;
  description?: string;
  created_at?: string;
  rules_count?: number;
}

// ============= History Item =============
export interface HistoryItem {
  history_item_id: string;
  request_id?: string;
  voice_id?: string;
  voice_name?: string;
  text?: string;
  date_unix?: number;
  character_count_change_from?: number;
  character_count_change_to?: number;
  content_type?: string;
  state?: string;
  settings?: Record<string, any>;
  feedback?: { thumbs_up: boolean; feedback: string; emotions: boolean };
}

// ============= User Info =============
export interface ElevenLabsUserInfo {
  subscription?: {
    tier?: string;
    character_count?: number;
    character_limit?: number;
    can_extend_character_limit?: boolean;
    allowed_to_extend_character_limit?: boolean;
    next_character_count_reset_unix?: number;
    voice_limit?: number;
    max_voice_add_edits?: number;
    voice_add_edit_counter?: number;
    professional_voice_limit?: number;
    can_extend_voice_limit?: boolean;
    can_use_instant_voice_cloning?: boolean;
    can_use_professional_voice_cloning?: boolean;
    currency?: string;
    status?: string;
  };
  xi_api_key?: string;
  is_new_user?: boolean;
  first_name?: string;
}

// ============= Usage Stats =============
export interface UsageStats {
  characters?: Array<{
    date: string;
    characters_count: number;
  }>;
}

// ============= Voice Design Params =============
export interface VoiceDesignParams {
  gender: 'male' | 'female';
  age: 'young' | 'middle_aged' | 'old';
  accent: string;
  accent_strength: number;
  text?: string;
}
