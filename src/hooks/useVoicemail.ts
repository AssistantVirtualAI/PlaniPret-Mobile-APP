import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export type Voicemail = {
  id: string;
  organization_id: string;
  extension: string;
  caller_number: string | null;
  caller_name: string | null;
  received_at: string;
  duration_seconds: number;
  audio_storage_path: string | null;
  transcript: string | null;
  ai_summary: string | null;
  ai_tags: string[];
  folder: "inbox" | "archived" | "trash";
  read_at: string | null;
};

export function useVoicemail() {
  const { user } = useAuth();
  const [items, setItems] = useState<Voicemail[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase
      .from("pbx_voicemails")
      .select("*")
      .neq("folder", "trash")
      .order("received_at", { ascending: false })
      .limit(200);
    setItems((data as any) || []);
    setLoading(false);
  }, [user?.id]);

  useEffect(() => {
    load();
    if (!user) return;
    const ch = supabase
      .channel("voicemails")
      .on("postgres_changes", { event: "*", schema: "public", table: "pbx_voicemails" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user?.id, load]);

  const sync = useCallback(async () => {
    await supabase.functions.invoke("voicemail-sync", { body: {} });
    await load();
  }, [load]);

  const markRead = useCallback(async (id: string) => {
    await (supabase.rpc as any)("mark_voicemail_read", { _id: id });
    await load();
  }, [load]);

  const remove = useCallback(async (id: string) => {
    await supabase.from("pbx_voicemails").update({ folder: "trash", deleted_at: new Date().toISOString() }).eq("id", id);
    await load();
  }, [load]);

  const getSignedUrl = useCallback(async (path: string) => {
    const { data } = await supabase.storage.from("voicemail-audio").createSignedUrl(path, 600);
    return data?.signedUrl ?? null;
  }, []);

  return { items, loading, sync, markRead, remove, getSignedUrl, reload: load };
}
