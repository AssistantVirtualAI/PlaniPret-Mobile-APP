import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface CallAnalysisRow {
  id: string;
  transcript: string | null;
  transcript_segments: any;
  ai_summary: string | null;
  ai_summary_short: string | null;
  ai_coaching: any;
  ai_analysis_json: any;
  next_actions: any;
  coaching_score: number | null;
  lead_score: number | null;
  lead_temperature: string | null;
  has_transcript: boolean | null;
  has_recording: boolean | null;
  recording_url: string | null;
  analyzed_at: string | null;
  analysis_in_progress: boolean | null;
  analysis_locked_at: string | null;
  analysis_locked_by: string | null;
  [k: string]: any;
}

/**
 * Shared hook — same data in admin portal, mobile app and widget.
 * Realtime updates via Supabase postgres_changes + broadcast channel.
 * Locking prevents duplicate concurrent analyses.
 */
export function useCallAnalysis(callId: string | null) {
  const [call, setCall] = useState<CallAnalysisRow | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [locked, setLocked] = useState(false);
  const [lockedBy, setLockedBy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const loadedIdRef = useRef<string | null>(null);

  const loadCall = useCallback(async (id: string) => {
    const { data, error: err } = await supabase
      .from("planipret_phone_calls")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (err) { setError(err.message); return; }
    if (data) {
      setCall(data as CallAnalysisRow);
      if (data.analyzed_at) { setAnalyzing(false); setLocked(false); }
      if (data.analysis_in_progress) {
        setAnalyzing(true); setLocked(true);
        setLockedBy(data.analysis_locked_by);
      }
    }
  }, []);

  // Load + subscribe when callId changes
  useEffect(() => {
    if (!callId) { setCall(null); return; }
    if (loadedIdRef.current !== callId) {
      loadedIdRef.current = callId;
      setError(null);
      loadCall(callId);
    }

    const dbSub = supabase
      .channel(`call-row-${callId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "planipret_phone_calls", filter: `id=eq.${callId}` },
        (payload) => {
          const next = payload.new as CallAnalysisRow;
          setCall(next);
          if (next.analyzed_at) { setAnalyzing(false); setLocked(false); setError(null); }
          if (next.analysis_in_progress) {
            setAnalyzing(true); setLocked(true);
            setLockedBy(next.analysis_locked_by);
          } else if (!next.analyzed_at) {
            // lock released without completion
            setAnalyzing(false); setLocked(false);
          }
        }
      )
      .subscribe();

    const broadcastSub = supabase
      .channel("call-analysis")
      .on("broadcast", { event: "analysis_started" }, ({ payload }: any) => {
        if (payload?.call_id === callId) {
          setAnalyzing(true); setLocked(true); setLockedBy(payload.locked_by);
        }
      })
      .on("broadcast", { event: "analysis_complete" }, ({ payload }: any) => {
        if (payload?.call_id === callId) {
          setAnalyzing(false); setLocked(false);
          loadCall(callId);
        }
      })
      .on("broadcast", { event: "analysis_error" }, ({ payload }: any) => {
        if (payload?.call_id === callId) {
          setAnalyzing(false); setLocked(false);
          setError(payload.error ?? "Erreur d'analyse");
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(dbSub);
      supabase.removeChannel(broadcastSub);
    };
  }, [callId, loadCall]);

  const analyze = useCallback(async (force = false) => {
    if (!callId) return;
    if (locked && !force) return;
    setAnalyzing(true);
    setError(null);
    try {
      const { data, error: err } = await supabase.functions.invoke("pp-coach-call", {
        body: { call_id: callId, force },
      });
      if (err) throw new Error(err.message);
      if (data?.locked) {
        setLocked(true);
        setLockedBy(data.locked_by ?? null);
      } else if (data?.error === "TRANSCRIPT_MISSING") {
        setAnalyzing(false);
        setError("Transcription non disponible");
      } else if (data?.success) {
        // Realtime UPDATE will refresh — but reload to be safe
        loadCall(callId);
      }
    } catch (e: any) {
      setAnalyzing(false);
      setError(e?.message ?? "Erreur");
    }
  }, [callId, locked, loadCall]);

  return {
    call,
    analyzing,
    locked,
    lockedBy,
    error,
    analyze,
    reload: () => callId && loadCall(callId),
    transcript: call?.transcript ?? "",
    transcriptSegments: call?.transcript_segments ?? [],
    coaching: call?.ai_coaching,
    analysis: call?.ai_analysis_json,
    coachingScore: call?.coaching_score,
    leadScore: call?.lead_score,
    aiSummary: call?.ai_summary,
    aiSummaryShort: call?.ai_summary_short,
    nextActions: call?.next_actions,
    isAnalyzed: !!call?.analyzed_at,
    hasTranscript: !!call?.has_transcript || !!(call?.transcript && call.transcript.length > 20),
  };
}
