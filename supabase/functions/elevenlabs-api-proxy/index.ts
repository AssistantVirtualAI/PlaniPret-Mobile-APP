import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ELEVENLABS_BASE_URL = 'https://api.elevenlabs.io';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { action, apiKey: providedApiKey, organizationId, agentId } = body;

    console.log(`[elevenlabs-api-proxy] Action: ${action}, org: ${organizationId}`);

    // ─── Resolve API key ───
    let apiKey = providedApiKey;
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const supabaseService = createClient(supabaseUrl, supabaseServiceKey);

    // Require authenticated user; require org membership if orgId provided
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const { data: { user } } = await supabaseService.auth.getUser(authHeader.replace('Bearer ', ''));
    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (organizationId) {
      const { data: membership } = await supabaseService
        .from('organization_members')
        .select('id')
        .eq('organization_id', organizationId)
        .eq('user_id', user.id)
        .maybeSingle();
      const { data: isSuper } = await supabaseService.rpc('is_super_admin', { _user_id: user.id });
      if (!membership && !isSuper) {
        return new Response(JSON.stringify({ error: 'Forbidden' }), {
          status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }


    if (!apiKey) {
      if (organizationId) {
        const { data: integration } = await supabaseService
          .from('organization_integrations')
          .select('api_key')
          .eq('organization_id', organizationId)
          .eq('platform', 'elevenlabs')
          .eq('is_active', true)
          .maybeSingle();
        if (integration?.api_key) apiKey = integration.api_key;
      }

      if (!apiKey && agentId) {
        const { data: agent } = await supabaseService
          .from('agents')
          .select('platform_api_key, organization_id, config')
          .or(`id.eq.${agentId},platform_agent_id.eq.${agentId}`)
          .maybeSingle();
        if (agent?.platform_api_key) {
          apiKey = agent.platform_api_key;
        } else if ((agent?.config as any)?.api_key) {
          apiKey = (agent.config as any).api_key;
        } else if (agent?.organization_id) {
          const { data: integration } = await supabaseService
            .from('organization_integrations')
            .select('api_key')
            .eq('organization_id', agent.organization_id)
            .eq('platform', 'elevenlabs')
            .eq('is_active', true)
            .maybeSingle();
          if (integration?.api_key) apiKey = integration.api_key;
        }
      }

      if (!apiKey) {
        const authHeader = req.headers.get('Authorization');
        if (authHeader) {
          const token = authHeader.replace('Bearer ', '');
          const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey, {
            global: { headers: { Authorization: authHeader } }
          });
          const { data: { user } } = await supabaseAuth.auth.getUser(token);
          if (user) {
            const { data: integration } = await supabaseAuth
              .from('organization_integrations')
              .select('api_key')
              .eq('user_id', user.id)
              .eq('platform', 'elevenlabs')
              .eq('is_active', true)
              .maybeSingle();
            if (integration?.api_key) apiKey = integration.api_key;
          }
        }
      }
    }

    if (!apiKey) {
      return new Response(
        JSON.stringify({ requiresSetup: true, message: 'Configuration ElevenLabs requise' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const headers = { 'xi-api-key': apiKey, 'Content-Type': 'application/json' };
    const headersNoBody = { 'xi-api-key': apiKey };

    // ─── Helper ───
    const apiCall = async (path: string, method = 'GET', payload?: any) => {
      const opts: RequestInit = { method, headers: payload ? headers : headersNoBody };
      if (payload) opts.body = JSON.stringify(payload);
      const resp = await fetch(`${ELEVENLABS_BASE_URL}${path}`, opts);
      if (!resp.ok) {
        const errText = await resp.text();
        throw new Error(`ElevenLabs API error: ${resp.status} - ${errText}`);
      }
      return resp;
    };

    const jsonResponse = (data: any) =>
      new Response(JSON.stringify(data), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    // ═══════════════════════════════════════════════
    // 1. USER & ACCOUNT
    // ═══════════════════════════════════════════════
    if (action === 'user_info') {
      const resp = await apiCall('/v1/user');
      return jsonResponse({ user: await resp.json() });
    }

    if (action === 'user_subscription') {
      const resp = await apiCall('/v1/user/subscription');
      return jsonResponse({ subscription: await resp.json() });
    }

    if (action === 'usage_stats') {
      const { start_unix, end_unix } = body;
      let path = '/v1/usage/character-stats';
      const params = new URLSearchParams();
      if (start_unix) params.append('start_unix', start_unix);
      if (end_unix) params.append('end_unix', end_unix);
      if (params.toString()) path += `?${params}`;
      const resp = await apiCall(path);
      return jsonResponse({ usage: await resp.json() });
    }

    // ═══════════════════════════════════════════════
    // 2. VOICES (v2 paginated + management)
    // ═══════════════════════════════════════════════
    if (action === 'voices_list') {
      const { page_size, search, sort, sort_direction, voice_type, category, next_page_token } = body;
      const params = new URLSearchParams();
      if (page_size) params.append('page_size', String(page_size));
      if (search) params.append('search', search);
      if (sort) params.append('sort', sort);
      if (sort_direction) params.append('sort_direction', sort_direction);
      if (voice_type) params.append('voice_type', voice_type);
      if (category) params.append('category', category);
      if (next_page_token) params.append('next_page_token', next_page_token);
      params.append('include_total_count', 'true');
      const resp = await apiCall(`/v2/voices?${params}`);
      return jsonResponse(await resp.json());
    }

    if (action === 'voice_get') {
      const { voiceId } = body;
      if (!voiceId) throw new Error('voiceId required');
      const resp = await apiCall(`/v1/voices/${voiceId}`);
      return jsonResponse({ voice: await resp.json() });
    }

    if (action === 'voice_delete') {
      const { voiceId } = body;
      if (!voiceId) throw new Error('voiceId required');
      await apiCall(`/v1/voices/${voiceId}`, 'DELETE');
      return jsonResponse({ success: true });
    }

    if (action === 'voice_similar') {
      const { voiceId } = body;
      if (!voiceId) throw new Error('voiceId required');
      const resp = await apiCall('/v1/voices/similar', 'POST', { voice_id: voiceId });
      return jsonResponse({ voices: await resp.json() });
    }

    // ═══════════════════════════════════════════════
    // 3. MODELS
    // ═══════════════════════════════════════════════
    if (action === 'models_list') {
      const resp = await apiCall('/v1/models');
      return jsonResponse({ models: await resp.json() });
    }

    // ═══════════════════════════════════════════════
    // 4. TEXT TO SPEECH
    // ═══════════════════════════════════════════════
    if (action === 'tts_generate') {
      const { voiceId, text, model_id, voice_settings, output_format, language_code } = body;
      if (!voiceId || !text) throw new Error('voiceId and text required');
      const format = output_format || 'mp3_44100_128';
      const resp = await apiCall(
        `/v1/text-to-speech/${voiceId}?output_format=${format}`,
        'POST',
        {
          text,
          model_id: model_id || 'eleven_multilingual_v2',
          ...(voice_settings && { voice_settings }),
          ...(language_code && { language_code }),
        }
      );
      // Return audio as base64
      const audioBuffer = await resp.arrayBuffer();
      const { encode } = await import("https://deno.land/std@0.168.0/encoding/base64.ts");
      const base64 = encode(audioBuffer);
      return jsonResponse({ audio: base64, format });
    }

    // ═══════════════════════════════════════════════
    // 5. SPEECH TO TEXT
    // ═══════════════════════════════════════════════
    if (action === 'stt_transcribe') {
      const { audio_base64, model_id, language_code, diarize, tag_audio_events } = body;
      if (!audio_base64) throw new Error('audio_base64 required');

      const { decode } = await import("https://deno.land/std@0.168.0/encoding/base64.ts");
      const audioBytes = decode(audio_base64);
      const blob = new Blob([audioBytes], { type: 'audio/mp3' });

      const formData = new FormData();
      formData.append('file', blob, 'audio.mp3');
      formData.append('model_id', model_id || 'scribe_v2');
      if (language_code) formData.append('language_code', language_code);
      if (diarize) formData.append('diarize', 'true');
      if (tag_audio_events) formData.append('tag_audio_events', 'true');

      const resp = await fetch(`${ELEVENLABS_BASE_URL}/v1/speech-to-text`, {
        method: 'POST',
        headers: { 'xi-api-key': apiKey },
        body: formData,
      });

      if (!resp.ok) {
        const errText = await resp.text();
        throw new Error(`ElevenLabs STT error: ${resp.status} - ${errText}`);
      }

      return jsonResponse({ transcription: await resp.json() });
    }

    // ═══════════════════════════════════════════════
    // 6. PRONUNCIATION DICTIONARIES
    // ═══════════════════════════════════════════════
    if (action === 'pronunciation_list') {
      const resp = await apiCall('/v1/pronunciation-dictionaries');
      return jsonResponse(await resp.json());
    }

    if (action === 'pronunciation_get') {
      const { dictionaryId } = body;
      if (!dictionaryId) throw new Error('dictionaryId required');
      const resp = await apiCall(`/v1/pronunciation-dictionaries/${dictionaryId}`);
      return jsonResponse({ dictionary: await resp.json() });
    }

    if (action === 'pronunciation_create') {
      const { name, description, rules } = body;
      const resp = await apiCall('/v1/pronunciation-dictionaries', 'POST', { name, description, rules });
      return jsonResponse({ success: true, dictionary: await resp.json() });
    }

    if (action === 'pronunciation_delete') {
      const { dictionaryId } = body;
      if (!dictionaryId) throw new Error('dictionaryId required');
      await apiCall(`/v1/pronunciation-dictionaries/${dictionaryId}`, 'DELETE');
      return jsonResponse({ success: true });
    }

    // ═══════════════════════════════════════════════
    // 7. HISTORY
    // ═══════════════════════════════════════════════
    if (action === 'history_list') {
      const { page_size, start_after_history_item_id } = body;
      const params = new URLSearchParams();
      if (page_size) params.append('page_size', String(page_size));
      if (start_after_history_item_id) params.append('start_after_history_item_id', start_after_history_item_id);
      const resp = await apiCall(`/v1/history?${params}`);
      return jsonResponse(await resp.json());
    }

    if (action === 'history_get') {
      const { historyItemId } = body;
      if (!historyItemId) throw new Error('historyItemId required');
      const resp = await apiCall(`/v1/history/${historyItemId}`);
      return jsonResponse({ item: await resp.json() });
    }

    if (action === 'history_delete') {
      const { historyItemId } = body;
      if (!historyItemId) throw new Error('historyItemId required');
      await apiCall(`/v1/history/${historyItemId}`, 'DELETE');
      return jsonResponse({ success: true });
    }

    // ═══════════════════════════════════════════════
    // 8. SOUND EFFECTS
    // ═══════════════════════════════════════════════
    if (action === 'sound_effects') {
      const { text: sfxText, duration_seconds, prompt_influence } = body;
      if (!sfxText) throw new Error('text required for sound effects');
      const resp = await apiCall('/v1/sound-generation', 'POST', {
        text: sfxText,
        ...(duration_seconds && { duration_seconds }),
        ...(prompt_influence !== undefined && { prompt_influence }),
      });
      const audioBuffer = await resp.arrayBuffer();
      const { encode } = await import("https://deno.land/std@0.168.0/encoding/base64.ts");
      return jsonResponse({ audio: encode(audioBuffer), format: 'mp3' });
    }

    // ═══════════════════════════════════════════════
    // 9. MUSIC GENERATION
    // ═══════════════════════════════════════════════
    if (action === 'music_generate') {
      const { prompt: musicPrompt, duration_seconds } = body;
      if (!musicPrompt) throw new Error('prompt required for music generation');
      const resp = await apiCall('/v1/music-generation', 'POST', {
        prompt: musicPrompt,
        ...(duration_seconds && { duration_seconds }),
      });
      const audioBuffer = await resp.arrayBuffer();
      const { encode } = await import("https://deno.land/std@0.168.0/encoding/base64.ts");
      return jsonResponse({ audio: encode(audioBuffer), format: 'mp3' });
    }

    // ═══════════════════════════════════════════════
    // 10. AUDIO ISOLATION
    // ═══════════════════════════════════════════════
    if (action === 'audio_isolation') {
      const { audio_base64 } = body;
      if (!audio_base64) throw new Error('audio_base64 required');
      const { decode } = await import("https://deno.land/std@0.168.0/encoding/base64.ts");
      const audioBytes = decode(audio_base64);
      const blob = new Blob([audioBytes], { type: 'audio/mp3' });
      const formData = new FormData();
      formData.append('audio', blob, 'audio.mp3');
      const resp = await fetch(`${ELEVENLABS_BASE_URL}/v1/audio-isolation`, {
        method: 'POST',
        headers: { 'xi-api-key': apiKey },
        body: formData,
      });
      if (!resp.ok) throw new Error(`Audio isolation error: ${resp.status}`);
      const resultBuffer = await resp.arrayBuffer();
      const { encode } = await import("https://deno.land/std@0.168.0/encoding/base64.ts");
      return jsonResponse({ audio: encode(resultBuffer), format: 'mp3' });
    }

    // ═══════════════════════════════════════════════
    // 11. DUBBING
    // ═══════════════════════════════════════════════
    if (action === 'dubbing_create') {
      const { source_url, target_lang, source_lang, name: dubbingName } = body;
      if (!source_url || !target_lang) throw new Error('source_url and target_lang required');
      const resp = await apiCall('/v1/dubbing', 'POST', {
        source_url, target_lang,
        ...(source_lang && { source_lang }),
        ...(dubbingName && { name: dubbingName }),
      });
      return jsonResponse({ dubbing: await resp.json() });
    }

    if (action === 'dubbing_status') {
      const { dubbingId } = body;
      if (!dubbingId) throw new Error('dubbingId required');
      const resp = await apiCall(`/v1/dubbing/${dubbingId}`);
      return jsonResponse({ dubbing: await resp.json() });
    }

    if (action === 'dubbing_delete') {
      const { dubbingId } = body;
      if (!dubbingId) throw new Error('dubbingId required');
      await apiCall(`/v1/dubbing/${dubbingId}`, 'DELETE');
      return jsonResponse({ success: true });
    }

    // ═══════════════════════════════════════════════
    // 12. VOICE DESIGN
    // ═══════════════════════════════════════════════
    if (action === 'voice_design') {
      const { gender, age, accent, accent_strength, text: designText } = body;
      const resp = await apiCall('/v1/voice-generation/generate-voice', 'POST', {
        gender, age, accent, accent_strength,
        text: designText || 'Hello, this is a test of my new voice.',
      });
      return jsonResponse({ voice: await resp.json() });
    }

    // ═══════════════════════════════════════════════
    // 13. VOICE CHANGER
    // ═══════════════════════════════════════════════
    if (action === 'voice_changer') {
      const { audio_base64, voiceId, model_id } = body;
      if (!audio_base64 || !voiceId) throw new Error('audio_base64 and voiceId required');
      const { decode } = await import("https://deno.land/std@0.168.0/encoding/base64.ts");
      const audioBytes = decode(audio_base64);
      const blob = new Blob([audioBytes], { type: 'audio/mp3' });
      const formData = new FormData();
      formData.append('audio', blob, 'audio.mp3');
      if (model_id) formData.append('model_id', model_id);
      const resp = await fetch(`${ELEVENLABS_BASE_URL}/v1/voice-changer?voice_id=${voiceId}`, {
        method: 'POST',
        headers: { 'xi-api-key': apiKey },
        body: formData,
      });
      if (!resp.ok) throw new Error(`Voice changer error: ${resp.status}`);
      const resultBuffer = await resp.arrayBuffer();
      const { encode } = await import("https://deno.land/std@0.168.0/encoding/base64.ts");
      return jsonResponse({ audio: encode(resultBuffer), format: 'mp3' });
    }

    // ═══════════════════════════════════════════════
    // 14. WEBHOOKS (workspace level)
    // ═══════════════════════════════════════════════
    if (action === 'webhooks_list') {
      const resp = await apiCall('/v1/webhooks');
      return jsonResponse(await resp.json());
    }

    if (action === 'webhooks_create') {
      const { url, events, name: webhookName } = body;
      if (!url) throw new Error('url required');
      const resp = await apiCall('/v1/webhooks', 'POST', {
        url,
        ...(events && { events }),
        ...(webhookName && { name: webhookName }),
      });
      return jsonResponse({ success: true, webhook: await resp.json() });
    }

    if (action === 'webhooks_delete') {
      const { webhookId } = body;
      if (!webhookId) throw new Error('webhookId required');
      await apiCall(`/v1/webhooks/${webhookId}`, 'DELETE');
      return jsonResponse({ success: true });
    }

    throw new Error(`Action non supportée: ${action}`);

  } catch (error) {
    console.error('[elevenlabs-api-proxy] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
