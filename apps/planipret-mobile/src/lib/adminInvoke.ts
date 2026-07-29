// Wrapper around supabase.functions.invoke() that transparently refreshes the
// session on HTTP 401 and returns rich error details so the caller can render
// them to the admin.
import { supabase } from "@/integrations/supabase/client";

export type AdminInvokeError = {
  status: number;
  message: string;
  details?: any;
  refreshed?: boolean;
};

export type AdminInvokeResult<T = any> = {
  ok: boolean;
  data: T | null;
  error: AdminInvokeError | null;
};

async function once<T>(name: string, body: any, method: string): Promise<AdminInvokeResult<T>> {
  try {
    const { data, error } = await supabase.functions.invoke(name, {
      body,
      ...(method !== "POST" ? { method: method as any } : {}),
    });
    if (error) {
      const status = (error as any).context?.status ?? (error as any).status ?? 500;
      let details: any = null;
      try {
        const ctx = (error as any).context;
        if (ctx && typeof ctx.text === "function") details = await ctx.text();
      } catch {}
      return {
        ok: false, data: null,
        error: { status, message: error.message || "invoke_failed", details },
      };
    }
    // Some functions return { success: false, code: 401 } in-body:
    if (data && typeof data === "object" && (data as any).success === false && (data as any).code === 401) {
      return { ok: false, data: null, error: { status: 401, message: (data as any).error || "unauthorized", details: data } };
    }
    return { ok: true, data: data as T, error: null };
  } catch (e: any) {
    return { ok: false, data: null, error: { status: 500, message: e?.message || "network_error" } };
  }
}

/** Invoke with automatic session refresh + one retry on 401. */
export async function adminInvoke<T = any>(
  name: string,
  body: any = {},
  method: string = "POST",
): Promise<AdminInvokeResult<T>> {
  const first = await once<T>(name, body, method);
  if (first.ok || first.error?.status !== 401) return first;

  // Try to refresh the session then retry once.
  const { data: refreshed, error: rErr } = await supabase.auth.refreshSession();
  if (rErr || !refreshed?.session) {
    return { ok: false, data: null, error: { ...first.error!, message: `Session expirée — reconnexion requise (${first.error!.message})`, refreshed: false } };
  }
  const second = await once<T>(name, body, method);
  if (second.error) second.error.refreshed = true;
  return second;
}
