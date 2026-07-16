import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export default function NsTranscriptionProbe() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [callid, setCallid] = useState("17831064240aca36359ebecdb64751714dec961ff5");
  const [ext, setExt] = useState("1040");

  const statusColor = (s: number, len: number) => {
    if (s === 200 && len > 0) return "#00D4AA";
    if (s === 200) return "#F5A623";
    return "#E84C4C";
  };

  const run = async () => {
    setLoading(true);
    setResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("ns-test-transcription", {
        body: { ns_callid: callid, ns_extension: ext },
      });
      if (error) throw error;
      setResult(data);
    } catch (e: any) {
      setResult({ error: e?.message ?? String(e) });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ marginTop: 16, padding: 12, border: "1px solid #0E2A45", borderRadius: 10, background: "rgba(4,11,22,0.4)" }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: "#F5A623", marginBottom: 8 }}>
        🔬 Sonde transcription NS-API
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
        <input value={callid} onChange={(e) => setCallid(e.target.value)} placeholder="ns_callid"
          style={{ flex: 1, minWidth: 220, fontSize: 11, fontFamily: "monospace", padding: "6px 8px", borderRadius: 6, background: "#040B16", border: "1px solid #0E2A45", color: "#8FA8C0" }} />
        <input value={ext} onChange={(e) => setExt(e.target.value)} placeholder="ext"
          style={{ width: 80, fontSize: 11, fontFamily: "monospace", padding: "6px 8px", borderRadius: 6, background: "#040B16", border: "1px solid #0E2A45", color: "#8FA8C0" }} />
        <button onClick={run} disabled={loading}
          style={{ padding: "6px 12px", borderRadius: 6, fontSize: 11, fontWeight: 600, background: "#2E9BDC", color: "#fff", border: "none", cursor: "pointer", opacity: loading ? 0.6 : 1 }}>
          {loading ? "Test en cours…" : "🔬 Tester la transcription"}
        </button>
      </div>

      {result?.results && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {result.results.map((r: any, i: number) => (
            <div key={i} style={{ padding: 8, background: "#040B16", border: "1px solid #0E2A45", borderRadius: 6, fontSize: 10, fontFamily: "monospace" }}>
              <div style={{ color: statusColor(r.status, r.body_length ?? 0) }}>
                HTTP {r.status ?? "ERR"} · {r.body_type ?? "—"} · len={r.body_length ?? 0}
              </div>
              <div style={{ color: "#4A7FA5", wordBreak: "break-all" }}>{r.url}</div>
              {r.fields?.length > 0 && (
                <div style={{ color: "#9B7FE8", marginTop: 4 }}>Fields: {r.fields.join(", ")}</div>
              )}
              {r.body_preview && (
                <div style={{ color: "#6B8CAE", marginTop: 4, whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
                  {r.body_preview}
                </div>
              )}
              {r.error && <div style={{ color: "#E84C4C" }}>Error: {r.error}</div>}
            </div>
          ))}
        </div>
      )}

      {result && !result.results && (
        <pre style={{ background: "#040B16", padding: 12, borderRadius: 6, fontSize: 10, color: "#8FA8C0", overflow: "auto", maxHeight: 400 }}>
          {JSON.stringify(result, null, 2)}
        </pre>
      )}
    </div>
  );
}
