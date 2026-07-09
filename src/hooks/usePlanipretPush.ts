import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

async function fetchVapidPublicKey(): Promise<string> {
  try {
    const { data } = await supabase.functions.invoke("pp-vapid-public");
    return (data as any)?.public_key ?? "";
  } catch { return ""; }
}

function urlBase64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const base = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

function arrayBufferToBase64(buf: ArrayBuffer | null) {
  if (!buf) return "";
  const bytes = new Uint8Array(buf);
  let s = ""; for (let i = 0; i < bytes.byteLength; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function usePlanipretPush() {
  const [busy, setBusy] = useState(false);

  const subscribe = useCallback(async (userId: string) => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) { toast.error("Notifications non supportées par ce navigateur"); return false; }
    const publicKey = await fetchVapidPublicKey();
    if (!publicKey) { toast.error("Clé VAPID non configurée (Intégrations → Web Push)"); return false; }
    setBusy(true);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") { toast.error("Permission refusée"); return false; }
      const reg = await navigator.serviceWorker.register("/planipret-sw.js");
      await navigator.serviceWorker.ready;
      const existing = await reg.pushManager.getSubscription();
      const sub = existing ?? await reg.pushManager.subscribe({
        userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
      const json = sub.toJSON() as any;
      const p256dh = json.keys?.p256dh ?? arrayBufferToBase64(sub.getKey("p256dh"));
      const auth = json.keys?.auth ?? arrayBufferToBase64(sub.getKey("auth"));
      await supabase.from("planipret_push_subscriptions").upsert({
        user_id: userId, endpoint: sub.endpoint, p256dh, auth, user_agent: navigator.userAgent,
      }, { onConflict: "endpoint" });
      toast.success("Notifications activées ✅");
      return true;
    } catch (e: any) {
      toast.error(e?.message ?? "Erreur d'activation");
      return false;
    } finally { setBusy(false); }
  }, []);

  const sendTest = useCallback(async (userId: string) => {
    const { data, error } = await supabase.functions.invoke("pp-push-notify", {
      body: { user_id: userId, title: "Test Planiprêt", body: "Si vous voyez ceci, les notifications fonctionnent ✅", icon: "/icon-192.png" },
    });
    if (error) { toast.error(error.message); return; }
    if ((data as any)?.delivered) toast.success(`Test envoyé (${(data as any).delivered})`);
    else toast.warning("Aucun abonnement actif trouvé");
  }, []);

  return { subscribe, sendTest, busy };
}
