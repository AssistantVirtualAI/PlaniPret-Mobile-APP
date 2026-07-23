// AI voicemail greeting generator powered by ElevenLabs TTS.
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { encode as base64Encode } from 'https://deno.land/std@0.168.0/encoding/base64.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const { text, voiceId = 'EXAVITQu4vr4xnSDxMaL', language = 'en' } = await req.json();
    if (!text) throw new Error('text required');
    const key = Deno.env.get('ELEVENLABS_API_KEY');
    if (!key) throw new Error('ElevenLabs not connected');
    const model = language === 'fr' ? 'eleven_multilingual_v2' : 'eleven_turbo_v2';

    const res = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`,
      {
        method: 'POST',
        headers: { 'xi-api-key': key, 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, model_id: model,
          voice_settings: { stability: 0.6, similarity_boost: 0.8 } }),
      },
    );
    if (!res.ok) throw new Error(`TTS ${res.status}: ${await res.text()}`);
    const buf = await res.arrayBuffer();
    return new Response(JSON.stringify({ ok: true, audioContent: base64Encode(buf) }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String((e as Error).message) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
