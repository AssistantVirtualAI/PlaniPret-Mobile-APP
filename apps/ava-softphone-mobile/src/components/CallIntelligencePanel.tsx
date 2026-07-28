import { useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";

interface AuditEntry {
  id: string; run_id: string; event: string; status: string;
  pipeline: string | null; ai_model: string | null; forced: boolean;
  duration_ms: number | null; error: string | null; created_at: string;
}

type AStatus = "queued" | "processing" | "analyzed" | "pending_sync" | "missing" | "failed";

interface Intel {
  status: string;
  analysisStatus: AStatus;
  transcript: string | null;
  summary: string | null;
  sentiment: string | null;
  satisfaction_score: number | null;
  coaching_score: number | null;
  coaching_notes: string[];
  action_items: string[];
  topics: string[];
  skipped_reason: string | null;
  outputs_present: { transcript: boolean; insight: boolean };
  last_processed_at: string | null;
  audit: AuditEntry[];
}

const EMPTY: Intel = {
  status: "missing", analysisStatus: "missing",
  transcript: null, summary: null, sentiment: null,
  satisfaction_score: null, coaching_score: null,
  coaching_notes: [], action_items: [], topics: [],
  skipped_reason: null, outputs_present: { transcript: false, insight: false },
  last_processed_at: null, audit: [],
};

const STATUS_STYLE: Record<AStatus, { bg: string; color: string; label: string }> = {
  queued:       { bg: "rgba(148,163,184,0.15)", color: "#94a3b8", label: "Queued" },
  processing:   { bg: "rgba(59,130,246,0.15)",  color: "#3b82f6", label: "Processing" },
  analyzed:     { bg: "rgba(16,185,129,0.15)",  color: "#10b981", label: "Analyzed" },
  pending_sync: { bg: "rgba(245,158,11,0.15)",  color: "#f59e0b", label: "Pending sync" },
  failed:       { bg: "rgba(239,68,68,0.15)",   color: "#ef4444", label: "Failed" },
  missing:      { bg: "rgba(148,163,184,0.1)",  color: "#94a3b8", label: "Not analyzed" },
};

function StatusPill({ status, ts }: { status: AStatus; ts: string | null }) {
  const s = STATUS_STYLE[status];
  return (
    <span style={{ display: "inline-flex", gap: 4, alignItems: "center", padding: "2px 8px", borderRadius: 999, background: s.bg, color: s.color, fontSize: 10, border: `1px solid ${s.color}40` }}>
      ● {s.label}{ts && status === "analyzed" ? ` · ${new Date(ts).toLocaleDateString()}` : ""}
    </span>
  );
}

export function CallIntelligencePanel({
  callId, supabase, canRegenerate = false,
}: { callId: string; supabase: SupabaseClient; canRegenerate?: boolean }) {
  const [data, setData] = useState<Intel>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [showAudit, setShowAudit] = useState(false);

  const fetchAudit = async (): Promise<AuditEntry[]> => {
    const { data } = await supabase.from("call_intelligence_audit").select("*")
      .eq("call_record_id", callId).order("created_at", { ascending: false }).limit(20);
    return (data as any[]) ?? [];
  };

  const loadCached = async (): Promise<Intel | null> => {
    const [{ data: i }, { data: tr }, audit] = await Promise.all([
      supabase.from("pbx_ai_insights").select("*").eq("call_record_id", callId).maybeSingle(),
      supabase.from("pbx_call_transcripts").select("transcript_text").eq("call_record_id", callId)
        .order("created_at", { ascending: false }).limit(1).maybeSingle(),
      fetchAudit(),
    ]);
    if (!i || !(tr as any)?.transcript_text) return null;
    const x: any = i;
    return {
      ...EMPTY,
      status: "cached", analysisStatus: "analyzed",
      transcript: (tr as any).transcript_text,
      summary: x.summary, sentiment: x.sentiment,
      satisfaction_score: x.satisfaction_score, coaching_score: x.coaching_score,
      coaching_notes: x.coaching_notes ?? [], action_items: x.action_items ?? [], topics: x.topics ?? [],
      outputs_present: { transcript: true, insight: true },
      last_processed_at: x.created_at ?? null,
      skipped_reason: "Cached — transcript and AI insight already exist.",
      audit,
    };
  };

  const run = async (force = false) => {
    setBusy(true);
    try {
      if (!force) { const c = await loadCached(); if (c) { setData(c); return; } }
      const { data: res, error } = await supabase.functions.invoke("process-call-recording", { body: { callId, force } });
      const audit = await fetchAudit();
      if (!error && res) {
        const p: any = res;
        const aStatus: AStatus =
          p.status === "pending_sync" ? "pending_sync"
          : p.status === "processing" ? "processing"
          : p.status === "cached" || p.status === "created" || p.status === "regenerated" ? "analyzed"
          : "missing";
        setData({ ...EMPTY, ...p, analysisStatus: aStatus, outputs_present: p.outputs_present ?? { transcript: !!p.transcript, insight: !!p.summary }, audit });
      }
    } finally { setBusy(false); setLoading(false); }
  };

  useEffect(() => { setLoading(true); run(false); /* eslint-disable-next-line */ }, [callId]);

  if (loading) return <div style={{ padding: 12, opacity: 0.7 }}>Loading AI analysis…</div>;

  return (
    <div style={{ padding: 12, border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, display: "flex", flexDirection: "column", gap: 10, fontSize: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <strong>🧠 AI Call Intelligence</strong>
          <StatusPill status={data.analysisStatus} ts={data.last_processed_at} />
        </div>
        {canRegenerate && <button onClick={() => run(true)} disabled={busy} style={{ fontSize: 12 }}>{busy ? "…" : "Re-analyze"}</button>}
      </div>

      {data.status === "processing" && <div style={{ fontSize: 12, color: "#3b82f6" }}>⏳ Another app is running this analysis.</div>}
      {data.status === "pending_sync" && <div style={{ fontSize: 12, color: "#f59e0b" }}>⏳ Recording syncing — analysis will run automatically.</div>}

      {data.status === "cached" && data.skipped_reason && (
        <div style={{ padding: 8, borderRadius: 6, border: "1px solid rgba(16,185,129,0.3)", background: "rgba(16,185,129,0.05)", fontSize: 12 }}>
          <div style={{ color: "#10b981", fontWeight: 600 }}>✓ Re-analysis skipped</div>
          <div style={{ opacity: 0.7 }}>{data.skipped_reason}</div>
          <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
            <span style={{ fontSize: 10, padding: "1px 6px", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 4 }}>Transcript: {data.outputs_present.transcript ? "✓" : "—"}</span>
            <span style={{ fontSize: 10, padding: "1px 6px", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 4 }}>Insight: {data.outputs_present.insight ? "✓" : "—"}</span>
          </div>
        </div>
      )}

      {data.summary && <p style={{ margin: 0 }}>{data.summary}</p>}

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", fontSize: 12 }}>
        {data.sentiment && <span>Sentiment: {data.sentiment}</span>}
        {data.satisfaction_score != null && <span>· Satisfaction: {data.satisfaction_score}/5</span>}
        {data.coaching_score != null && <span>· Coaching: {data.coaching_score}/5</span>}
      </div>
      {data.action_items.length > 0 && (
        <div><div style={{ fontSize: 11, opacity: 0.6, textTransform: "uppercase" }}>Action items</div>
          <ul style={{ paddingLeft: 18, margin: 4 }}>{data.action_items.map((a, i) => <li key={i}>{a}</li>)}</ul></div>
      )}
      {data.coaching_notes.length > 0 && (
        <div><div style={{ fontSize: 11, opacity: 0.6, textTransform: "uppercase" }}>✨ Coaching</div>
          <ul style={{ paddingLeft: 18, margin: 4 }}>{data.coaching_notes.map((c, i) => <li key={i}>{c}</li>)}</ul></div>
      )}

      <div style={{ borderTop: "1px solid rgba(255,255,255,0.1)", paddingTop: 8 }}>
        <button onClick={() => setShowAudit(s => !s)} style={{ fontSize: 11, opacity: 0.7, background: "none", border: "none", padding: 0, cursor: "pointer", color: "inherit" }}>
          {showAudit ? "▼" : "▶"} Audit trail ({data.audit.length})
        </button>
        {showAudit && (
          <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 4, maxHeight: 240, overflow: "auto" }}>
            {data.audit.length === 0 && <div style={{ fontSize: 11, opacity: 0.6 }}>No runs recorded.</div>}
            {data.audit.map(a => (
              <div key={a.id} style={{ fontSize: 11, padding: 6, border: "1px solid rgba(255,255,255,0.08)", borderRadius: 4, display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
                <span style={{ padding: "1px 4px", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 3 }}>{a.event}</span>
                <span style={{ opacity: 0.6, fontFamily: "monospace" }}>{a.run_id.slice(0, 8)}</span>
                {a.pipeline && <span style={{ opacity: 0.7 }}>{a.pipeline}</span>}
                {a.forced && <span style={{ padding: "1px 4px", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 3 }}>forced</span>}
                {a.duration_ms != null && <span style={{ opacity: 0.6 }}>{a.duration_ms}ms</span>}
                <span style={{ marginLeft: "auto", opacity: 0.6 }}>{new Date(a.created_at).toLocaleString()}</span>
                {a.error && <div style={{ flexBasis: "100%", color: "#ef4444" }}>{a.error}</div>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
