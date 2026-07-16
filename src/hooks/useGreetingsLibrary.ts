import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type LibraryGreeting = {
  id: string;
  name: string;
  extension: string | null;
  source: string;
  text_script: string | null;
  voice_id: string | null;
  voice_name: string | null;
  storage_path: string;
  audio_url: string | null;
  is_active: boolean;
  status: "ready" | "generating" | "failed" | "queued" | "canceled";
  error_message: string | null;
  attempts: number;
  last_attempt_at: string | null;
  canceled_at: string | null;
  created_at: string;
};

export type GreetingAttempt = {
  id: string;
  greeting_id: string;
  attempt_number: number;
  status: "succeeded" | "failed" | "canceled";
  request_id: string | null;
  http_status: number | null;
  error_message: string | null;
  error_payload: any;
  voice_id: string | null;
  duration_ms: number | null;
  started_at: string;
  finished_at: string | null;
};

export type Extension = { extension: string; display_name: string | null };
export type Voice = { id: string; name: string };
export type ThrottleInfo = { max_concurrent: number; generating: number; queued: number };

async function call(action: string, payload?: any) {
  const { data, error } = await supabase.functions.invoke("user-voicemail-greeting", {
    body: { action, payload },
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data;
}

export function useGreetingsLibrary() {
  const qc = useQueryClient();
  const query = useQuery<{
    greetings: LibraryGreeting[];
    extensions: Extension[];
    voices: Voice[];
    throttle: ThrottleInfo;
  }>({
    queryKey: ["my-greetings-library"],
    queryFn: () => call("list_greetings"),
    refetchInterval: (q) => {
      const list = q.state.data?.greetings ?? [];
      return list.some((g) => g.status === "generating" || g.status === "queued") ? 3000 : false;
    },
  });
  const inv = () => qc.invalidateQueries({ queryKey: ["my-greetings-library"] });
  return {
    query,
    create: useMutation({
      mutationFn: (p: { name: string; text: string; voice_id: string; extension: string | null }) =>
        call("create_greeting", p),
      onSettled: inv,
    }),
    retry: useMutation({
      mutationFn: (id: string) => call("retry_greeting", { id }),
      onSettled: inv,
    }),
    regenerate: useMutation({
      mutationFn: (id: string) => call("regenerate_greeting", { id }),
      onSettled: inv,
    }),
    cancel: useMutation({
      mutationFn: (id: string) => call("cancel_greeting", { id }),
      onSettled: inv,
    }),
    remove: useMutation({ mutationFn: (id: string) => call("delete_greeting", { id }), onSettled: inv }),
    activate: useMutation({ mutationFn: (id: string) => call("activate_greeting", { id }), onSettled: inv }),
    rename: useMutation({
      mutationFn: (p: { id: string; name: string }) => call("rename_greeting", p),
      onSettled: inv,
    }),
  };
}

export function useGreetingAttempts(id: string | null) {
  return useQuery<{ attempts: GreetingAttempt[] }>({
    queryKey: ["greeting-attempts", id],
    enabled: !!id,
    queryFn: () => call("list_attempts", { id }),
    refetchInterval: 4000,
  });
}
