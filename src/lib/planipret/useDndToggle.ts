import { useCallback, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * DND toggle for the existing Planiprêt `dnd_enabled` field only.
 * - single-flight (a second tap while writing is ignored);
 * - checks `{ error }` explicitly;
 * - reloads the profile and reports success only after a confirmed write;
 * - on error, drops the pending value so the confirmed profile value is shown again.
 */
export function useDndToggle(
  profile: { user_id?: string } | null | undefined,
  reloadProfile: () => Promise<void>,
  cb: { onSuccess: (v: boolean) => void; onError: () => void },
) {
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<boolean | null>(null);
  const inflight = useRef(false);
  const cbRef = useRef(cb);
  cbRef.current = cb;

  const toggle = useCallback(async (v: boolean) => {
    if (inflight.current || !profile?.user_id) return;
    inflight.current = true;
    setBusy(true);
    setPending(v);
    try {
      const { error } = await supabase.from("planipret_profiles").update({ dnd_enabled: v } as never).eq("user_id", profile.user_id);
      if (error) { setPending(null); cbRef.current.onError(); return; }
      await reloadProfile();
      setPending(null);
      cbRef.current.onSuccess(v);
    } catch {
      setPending(null);
      cbRef.current.onError();
    } finally {
      inflight.current = false;
      setBusy(false);
    }
  }, [profile?.user_id, reloadProfile]);

  return { busy, pending, toggle };
}
