// ElevenLabs Configuration Types

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
}

export interface ASRSettings {
  provider?: 'elevenlabs' | 'deepgram' | 'google';
  quality?: 'high' | 'standard';
  user_input_audio_format?: string;
  keywords?: string[];
}

export interface TurnSettings {
  turn_timeout?: number;
  silence_end_call_timeout?: number;
  turn_eagerness?: 'eager' | 'normal' | 'relaxed';
  soft_timeout_config?: {
    timeout_seconds: number;
    message: string;
  };
}

export interface ConversationSettings {
  max_duration_seconds?: number;
  client_events?: string[];
}

export interface AgentAdvancedSettings {
  language?: string;
  disable_first_message_interruptions?: boolean;
}

export interface PlatformSettings {
  widget?: {
    avatar?: string;
    border_radius?: string;
    background_color?: string;
    text_color?: string;
    cta_label?: string;
  };
  auth?: {
    require_auth?: boolean;
    allowed_origins?: string[];
  };
  data_collection?: {
    collect_email?: boolean;
    collect_phone?: boolean;
    collect_name?: boolean;
  };
}

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

// Pre-configured agent template with ElevenLabs optimized settings
export interface ElevenLabsAgentTemplate {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  // Agent settings
  systemPrompt: string;
  firstMessage: string;
  language: string;
  // TTS settings optimized for use case
  tts: {
    voice_id: string;
    model_id: string;
    stability: number;
    similarity_boost: number;
    style: number;
    speed: number;
    optimize_streaming_latency: number;
  };
  // ASR settings
  asr: {
    quality: 'high' | 'standard';
    keywords: string[];
  };
  // Turn settings
  turn: {
    turn_timeout: number;
    silence_end_call_timeout: number;
    turn_eagerness: 'eager' | 'normal' | 'relaxed';
  };
  // Conversation settings
  conversation: {
    max_duration_seconds: number;
  };
  tags: string[];
}
