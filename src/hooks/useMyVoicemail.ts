import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type Voicemail = {
  id: string;
  caller_number: string | null;
  caller_name: string | null;
  received_at: string;
  duration_seconds: number | null;
  audio_storage_path: string | null;
  transcript: string | null;
  ai_summary: string | null;
  ai_tags: string[] | null;
  folder: string | null;
  read_at: string | null;
  deleted_at: string | null;
};

async function invoke(fn: string, action: string, payload?: any) {
  const { data, error } = await supabase.functions.invoke(fn, { body: { action, payload } });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data;
}

export function useMyVoicemails() {
  const qc = useQueryClient();
  const list = useQuery<{ voicemails: Voicemail[] }>({
    queryKey: ["my-voicemails"],
    queryFn: () => invoke("user-voicemail", "list"),
  });

  const inv = () => qc.invalidateQueries({ queryKey: ["my-voicemails"] });

  return {
    list,
    markRead: useMutation({ mutationFn: (id: string) => invoke("user-voicemail", "mark_read", { id }), onSuccess: inv }),
    remove: useMutation({ mutationFn: (id: string) => invoke("user-voicemail", "delete", { id }), onSuccess: inv }),
    getAudioUrl: (id: string) => invoke("user-voicemail", "get_audio_url", { id }) as Promise<{ url: string | null }>,
    transcribe: useMutation({ mutationFn: (id: string) => invoke("user-voicemail", "transcribe", { id }), onSuccess: inv }),
    summarize: useMutation({ mutationFn: (id: string) => invoke("user-voicemail", "summarize", { id }), onSuccess: inv }),
  };
}

export type GreetingSettings = {
  id?: string;
  greeting_type: "default" | "recorded" | "tts";
  greeting_tts_text?: string | null;
  greeting_voice_id?: string | null;
  greeting_voice_name?: string | null;
  greeting_storage_path?: string | null;
  greeting_audio_url?: string | null;
  transcription_enabled?: boolean;
  ai_summary_enabled?: boolean;
  notify_email?: boolean;
  attach_audio_email?: boolean;
};

export type Voice = { id: string; name: string };

export function useMyGreeting() {
  const qc = useQueryClient();
  const query = useQuery<{ settings: GreetingSettings | null; voices?: Voice[] }>({
    queryKey: ["my-voicemail-greeting"],
    queryFn: () => invoke("user-voicemail-greeting", "get_settings"),
  });
  const save = useMutation({
    mutationFn: (s: GreetingSettings) => invoke("user-voicemail-greeting", "save_settings", s),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["my-voicemail-greeting"] }),
  });
  const generateTts = useMutation({
    mutationFn: (p: { text: string; voice_id: string }) => invoke("user-voicemail-greeting", "generate_tts", p),
  });
  const getGreetingUrl = (path: string) =>
    invoke("user-voicemail-greeting", "get_greeting_url", { path }) as Promise<{ url: string | null }>;
  return { query, save, generateTts, getGreetingUrl };
}
