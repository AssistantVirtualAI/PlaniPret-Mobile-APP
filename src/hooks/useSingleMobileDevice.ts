import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  callBlocksSignOut, checkThisDevice, claimThisDevice, getMobileDeviceId, isNativeMobile, isReplacedBy, REPLACED_FLAG,
} from "@/lib/planipret/singleDevice";

const CLAIMED_KEY = "pp_mobile_claimed_user";

/** Un seul appareil mobile connecté : l'ancien se déconnecte après tout appel en cours. */
export function useSingleMobileDevice(userId: string | null | undefined, callState: string | null | undefined) {
  const [replaced, setReplaced] = useState(false);
  const done = useRef(false);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    const me = getMobileDeviceId();
    let channel: ReturnType<typeof supabase.channel> | null = null;
    const verify = async () => { if (!(await checkThisDevice()) && !cancelled) setReplaced(true); };
    void (async () => {
      if (!(await isNativeMobile()) || cancelled) return;
      let claimed: string | null = null;
      try { claimed = localStorage.getItem(CLAIMED_KEY); } catch { /* noop */ }
      if (claimed !== userId) {
        const result = await claimThisDevice();
        // Do not record a deferred or unknown claim as successful. The
        // softphone retries the authoritative claim after the active call.
        if (result.active && result.confirmed) {
          try { localStorage.setItem(CLAIMED_KEY, userId); } catch { /* noop */ }
        }
      } else {
        await verify();
      }
      if (cancelled) return;
      channel = supabase
        .channel(`pp-active-device-${userId}`)
        .on("postgres_changes",
          { event: "*", schema: "public", table: "planipret_mobile_active_device", filter: `user_id=eq.${userId}` },
          (payload) => { if (isReplacedBy((payload.new as any)?.device_id, me)) setReplaced(true); })
        .subscribe();
    })();
    const onVis = () => { if (document.visibilityState === "visible") void verify(); };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVis);
      if (channel) void supabase.removeChannel(channel);
    };
  }, [userId]);

  useEffect(() => {
    if (!replaced || done.current || callBlocksSignOut(callState)) return;
    done.current = true;
    void (async () => {
      try {
        const { nativeSip } = await import("@/lib/planipret/sip/nativeSipService");
        await nativeSip.releaseForSignOut();
      } catch { /* noop */ }
      try {
        const { ppSipProvider } = await import("@/lib/planipret/sip/ppSipProvider");
        ppSipProvider.stop();
      } catch { /* noop */ }
      try { localStorage.removeItem(CLAIMED_KEY); localStorage.setItem(REPLACED_FLAG, "1"); } catch { /* noop */ }
      try { await supabase.auth.signOut({ scope: "local" } as any); } catch { /* noop */ }
      window.location.replace("/mplanipret");
    })();
  }, [replaced, callState]);
}

/** Message à afficher une fois sur l'écran de connexion. */
export function consumeSignedOutElsewhere(): boolean {
  try {
    if (localStorage.getItem(REPLACED_FLAG) !== "1") return false;
    localStorage.removeItem(REPLACED_FLAG);
    return true;
  } catch { return false; }
}
