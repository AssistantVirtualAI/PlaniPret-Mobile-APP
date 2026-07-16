import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export function useVoicemailSettings() {
  const { user } = useAuth();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data: row } = await supabase.from("pbx_voicemail_settings").select("user_id,greeting_type,greeting_storage_path,greeting_tts_text,transcription_enabled,notify_email,notify_sms,notify_push,attach_audio_email,notify_email_address,notify_sms_number,updated_at,greeting_voice_id,greeting_voice_name,ai_summary_enabled,greeting_audio_url,greeting_updated_at").eq("user_id", user.id).maybeSingle();
    setData(row);
    setLoading(false);
  }, [user?.id]);

  useEffect(() => { load(); }, [load]);

  const save = useCallback(async (patch: any) => {
    if (!user) return;
    await supabase.from("pbx_voicemail_settings").upsert({ user_id: user.id, ...patch, updated_at: new Date().toISOString() });
    await load();
  }, [user, load]);

  return { data, loading, save };
}
