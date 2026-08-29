import { supabase } from "@/integrations/supabase/client";

function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function recordingFileName(row: any) {
  const peer = String(row?.to_number ?? row?.from_number ?? "call").replace(/[^0-9a-zA-Z+]/g, "");
  const d = row?.created_at ? new Date(row.created_at) : new Date();
  const stamp = d.toISOString().slice(0, 19).replace(/[:T]/g, "-");
  return `enregistrement-${peer || "appel"}-${stamp}.wav`;
}

/**
 * Downloads a call recording. Streams bytes from the ns-get-recording edge
 * function (NetSapiens URLs are auth-protected, so a plain <a download> fails).
 * Falls back to an existing blob:/http URL already loaded in memory.
 */
export async function downloadRecording(row: any): Promise<{ ok: boolean; error?: string }> {
  const filename = recordingFileName(row);
  const existing = String(row?.recording_url ?? "");

  if (existing.startsWith("blob:")) {
    try {
      const blob = await (await fetch(existing)).blob();
      saveBlob(blob, filename);
      return { ok: true };
    } catch {
      /* fall through to edge function */
    }
  }

  try {
    const projectId = (import.meta as any).env?.VITE_SUPABASE_PROJECT_ID ?? "gejxisrqtvxavbrfcoxz";
    const anonKey =
      (import.meta as any).env?.VITE_SUPABASE_PUBLISHABLE_KEY ??
      (import.meta as any).env?.VITE_SUPABASE_ANON_KEY;
    const { data: { session } } = await supabase.auth.getSession();
    const resp = await fetch(`https://${projectId}.supabase.co/functions/v1/ns-get-recording`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: anonKey ?? "",
        Authorization: `Bearer ${session?.access_token ?? anonKey ?? ""}`,
      },
      body: JSON.stringify({ call_db_id: row?.id }),
    });
    const ct = resp.headers.get("Content-Type") ?? "";
    if (resp.ok && ct.includes("audio")) {
      saveBlob(await resp.blob(), filename);
      return { ok: true };
    }
    const j = await resp.json().catch(() => ({} as any));
    // Last resort: direct URL
    if (existing.startsWith("http")) {
      try {
        const blob = await (await fetch(existing)).blob();
        saveBlob(blob, filename);
        return { ok: true };
      } catch {
        window.open(existing, "_blank", "noopener");
        return { ok: true };
      }
    }
    return { ok: false, error: j?.message ?? j?.error ?? "Enregistrement indisponible" };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? String(e) };
  }
}
