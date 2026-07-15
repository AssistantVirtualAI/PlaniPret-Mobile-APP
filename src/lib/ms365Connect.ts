import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { openMs365Authorize } from "@/lib/ms365OAuth";

/**
 * Kicks off the Microsoft 365 OAuth flow by fetching the admin-configured
 * client_id/tenant and redirecting to login.microsoftonline.com.
 */
export async function connectMs365(): Promise<void> {
  try {
    const { data, error } = await supabase.functions.invoke("ms365-status", { body: {} });
    if (error) {
      toast.error("Configuration Microsoft inaccessible", { description: error.message });
      return;
    }
    const cfg = (data as any)?.detection ?? {};
    const clientId = cfg.client_id;
    if (!clientId) {
      toast.error("Microsoft 365 n'est pas configuré côté admin");
      return;
    }
    const tenant = cfg.tenant_id || "common";
    const { data: userData } = await supabase.auth.getUser();
    const state = userData?.user?.id ?? "";
    await openMs365Authorize({ clientId, tenant, state });
  } catch (e: any) {
    toast.error("Connexion Microsoft impossible", { description: e?.message });
  }
}
