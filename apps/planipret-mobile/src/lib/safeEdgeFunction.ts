import { supabase } from "@/integrations/supabase/client";

type SafeEdgeOptions = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
};

export type SafeEdgeResult<T = any> = {
  data: T | null;
  error: string | null;
  status: number | null;
};

/**
 * Calls an Edge Function through fetch instead of supabase.functions.invoke().
 * This keeps expected non-2xx responses (403/404/500 diagnostics) out of the
 * Supabase client error path, so they can be rendered as UI state/toasts.
 */
export async function safeEdgeFunction<T = any>(
  name: string,
  options: SafeEdgeOptions = {},
): Promise<SafeEdgeResult<T>> {
  try {
    const { data: sess } = await supabase.auth.getSession();
    const token = sess?.session?.access_token;
    const method = options.method ?? "POST";
    const hasBody = method !== "GET" && options.body !== undefined;

    const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${name}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      ...(hasBody ? { body: JSON.stringify(options.body) } : {}),
    });

    const text = await res.text();
    let parsed: any = null;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = text ? { message: text } : null;
    }

    if (!res.ok) {
      return {
        data: parsed,
        error: parsed?.error ?? parsed?.message ?? `HTTP ${res.status}`,
        status: res.status,
      };
    }

    return { data: parsed as T, error: null, status: res.status };
  } catch (e: any) {
    return { data: null, error: e?.message ?? "Erreur réseau", status: null };
  }
}