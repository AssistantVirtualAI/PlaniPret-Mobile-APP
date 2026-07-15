import { Capacitor } from "@capacitor/core";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const MS365_DELEGATED_SCOPES =
  "openid profile email offline_access User.Read User.ReadBasic.All Mail.ReadWrite Mail.Send MailboxSettings.Read Calendars.ReadWrite Chat.Read Chat.ReadBasic Chat.ReadWrite Channel.ReadBasic.All ChannelMessage.Read.All ChannelMessage.Send Team.ReadBasic.All Organization.Read.All Application.Read.All";

/**
 * Kicks off the Microsoft 365 OAuth flow by fetching the admin-configured
 * client_id/tenant and redirecting to login.microsoftonline.com.
 *
 * Sur iOS natif (Capacitor) : redirect vers capacitor://localhost/auth/microsoft/callback
 * Sur web : redirect vers window.location.origin/auth/microsoft/callback
 */
export async function connectMs365(): Promise<void> {
  try {
    const { data, error } = await supabase.functions.invoke("pp-integration-secrets");
    if (error) {
      toast.error("Configuration Microsoft inaccessible", { description: error.message });
      return;
    }
    const items = ((data as any)?.items ?? []).filter((i: any) => i.provider === "microsoft");
    const ms = items.find((i: any) => i.public_config?.client_id || i.public_config?.client_secret_id) ?? items[0];
    const cfg = (ms?.public_config ?? {}) as any;
    const clientId = cfg.client_id ?? cfg.client_secret_id;
    if (!clientId) {
      toast.error("Microsoft 365 n'est pas configuré côté admin");
      return;
    }
    const tenant = cfg.tenant_id || "common";
    const IS_NATIVE = Capacitor.isNativePlatform();
    // Sur iOS natif : capacitor://localhost/auth/microsoft/callback
    // Sur web : https://avastatistic.ca/auth/microsoft/callback
    const redirect = IS_NATIVE
      ? "capacitor://localhost/auth/microsoft/callback"
      : `${window.location.origin}/auth/microsoft/callback`;
    const scope = encodeURIComponent(MS365_DELEGATED_SCOPES);
    const { data: userData } = await supabase.auth.getUser();
    const state = userData?.user?.id ?? "";
    const authUrl =
      `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize` +
      `?client_id=${clientId}` +
      `&response_type=code` +
      `&redirect_uri=${encodeURIComponent(redirect)}` +
      `&response_mode=query` +
      `&scope=${scope}` +
      `&prompt=select_account` +
      `&state=${state}`;
    if (IS_NATIVE) {
      // Ouvrir Safari externe — iOS intercepte le retour capacitor:// et le renvoie à la WebView
      window.open(authUrl, "_system");
    } else {
      window.location.href = authUrl;
    }
  } catch (e: any) {
    toast.error("Connexion Microsoft impossible", { description: e?.message });
  }
}
