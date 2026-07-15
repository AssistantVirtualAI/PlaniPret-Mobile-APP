import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { openMs365Authorize } from "@/lib/ms365OAuth";

/**
 * Kicks off the Microsoft 365 OAuth flow by fetching the admin-configured
 * client_id/tenant and redirecting to login.microsoftonline.com.
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
    const { data: userData } = await supabase.auth.getUser();
    const state = userData?.user?.id ?? "";
    openMs365Authorize({ clientId, tenant, state });
  } catch (e: any) {
    toast.error("Connexion Microsoft impossible", { description: e?.message });
  }
}
