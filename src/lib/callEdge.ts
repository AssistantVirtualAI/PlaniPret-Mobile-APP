// Shared invoke helper that surfaces the real edge-function error body
// instead of the generic "Edge Function returned a non-2xx status code".
import { supabase } from "@/integrations/supabase/client";
import { FunctionsHttpError } from "@supabase/supabase-js";

export type EdgeError = {
  name: "EdgeError";
  message: string;
  status: number;
  body: any;
  fn: string;
};

export async function callEdge<T = any>(
  fn: string,
  body?: any,
  opts?: { method?: "POST" | "GET" },
): Promise<T> {
  try {
    const { data, error } = await supabase.functions.invoke(fn, {
      body,
      method: opts?.method,
    });
    if (error) {
      let status = 0;
      let payload: any = null;
      if (error instanceof FunctionsHttpError) {
        status = (error as any)?.context?.status ?? 0;
        try {
          const txt = await (error as any).context.text();
          try { payload = JSON.parse(txt); } catch { payload = txt; }
        } catch { /* noop */ }
      }
      const msg =
        (payload && typeof payload === "object" && (payload.error || payload.message)) ||
        (typeof payload === "string" && payload) ||
        error.message ||
        "Edge function failed";
      const err: EdgeError = {
        name: "EdgeError",
        message: String(msg),
        status,
        body: payload,
        fn,
      };
      throw err;
    }
    if (data && typeof data === "object" && (data as any).error) {
      const msg = (data as any).error || "Edge function error";
      const err: EdgeError = {
        name: "EdgeError",
        message: String(msg),
        status: (data as any).status ?? 200,
        body: data,
        fn,
      };
      throw err;
    }
    return data as T;
  } catch (e: any) {
    if (e && e.name === "EdgeError") throw e;
    const err: EdgeError = {
      name: "EdgeError",
      message: e?.message || "Network error",
      status: 0,
      body: null,
      fn,
    };
    throw err;
  }
}

// Normalize a Canadian/US number to E.164. Falls back to raw digits when
// the input is clearly international (starts with +) or ambiguous.
export function toE164(raw: string): string {
  if (!raw) return raw;
  const trimmed = raw.trim();
  if (trimmed.startsWith("+")) return "+" + trimmed.slice(1).replace(/\D/g, "");
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length === 10) return "+1" + digits;
  if (digits.length === 11 && digits.startsWith("1")) return "+" + digits;
  return digits ? "+" + digits : trimmed;
}
