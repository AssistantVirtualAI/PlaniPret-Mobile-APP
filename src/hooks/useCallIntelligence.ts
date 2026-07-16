import { useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface AuditEntry {
  id: string;
  run_id: string;
  event: string;
  status: string;
  pipeline: string | null;
  ai_model: string | null;
  prompt_version: string | null;
  forced: boolean;
  triggered_by: string | null;
  duration_ms: number | null;
  error: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export type AnalysisStatus = "queued" | "processing" | "analyzed" | "pending_sync" | "missing" | "failed";

export interface CallIntelligence {
  status: "cached" | "created" | "regenerated" | "pending_sync" | "missing" | "processing";
  analysisStatus: AnalysisStatus;
  transcript: string | null;
  summary: string | null;
  sentiment: string | null;
  satisfaction_score: number | null;
  quality_score: number | null;
  coaching_score: number | null;
  coaching_notes: string[];
  action_items: string[];
  topics: string[];
  key_phrases: string[];
  intent: string | null;
  risks: string[];
  sales_opportunities: string[];
  escalation_needed: boolean;
  skipped_reason: string | null;
  outputs_present: { transcript: boolean; insight: boolean };
  last_processed_at: string | null;
  audit: AuditEntry[];
}

const EMPTY: CallIntelligence = {
  status: "missing",
  analysisStatus: "missing",
  transcript: null,
  summary: null,
  sentiment: null,
  satisfaction_score: null,
  quality_score: null,
  coaching_score: null,
  coaching_notes: [],
  action_items: [],
  topics: [],
  key_phrases: [],
  intent: null,
  risks: [],
  sales_opportunities: [],
  escalation_needed: false,
  skipped_reason: null,
  outputs_present: { transcript: false, insight: false },
  last_processed_at: null,
  audit: [],
};

async function fetchAudit(callId: string): Promise<AuditEntry[]> {
  const { data } = await supabase
    .from("call_intelligence_audit" as any)
    .select("*")
    .eq("call_record_id", callId)
    .order("created_at", { ascending: false })
    .limit(20);
  return (data as any[]) ?? [];
}

async function loadCached(callId: string): Promise<CallIntelligence | null> {
  const [{ data: insight }, { data: tr }, audit] = await Promise.all([
    supabase.from("pbx_ai_insights").select("*").eq("call_record_id", callId).maybeSingle(),
    supabase
      .from("pbx_call_transcripts")
      .select("transcript_text, created_at")
      .eq("call_record_id", callId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    fetchAudit(callId),
  ]);
  if (!tr?.transcript_text) return null;
  const i = insight as any;
  return {
    ...EMPTY,
    status: "cached",
    analysisStatus: insight ? "analyzed" : "missing",
    transcript: tr.transcript_text,
    summary: i?.summary ?? null,
    sentiment: i?.sentiment ?? null,
    satisfaction_score: i?.satisfaction_score ?? null,
    quality_score: i?.quality_score ?? null,
    coaching_score: i?.coaching_score ?? null,
    coaching_notes: i?.coaching_notes ?? [],
    action_items: i?.action_items ?? [],
    topics: i?.topics ?? [],
    key_phrases: i?.key_phrases ?? [],
    intent: i?.intent ?? null,
    risks: i?.risks ?? [],
    sales_opportunities: i?.sales_opportunities ?? [],
    escalation_needed: i?.escalation_needed ?? false,
    outputs_present: { transcript: true, insight: !!insight },
    last_processed_at: i?.created_at ?? tr.created_at ?? null,
    skipped_reason: insight ? "Cached — transcript and AI insight already exist for this recording." : "Cached — transcript already exists; analysis can run without re-transcribing.",
    audit,
  };
}

async function process(callId: string, force = false): Promise<CallIntelligence> {
  const { data, error } = await supabase.functions.invoke("process-call-recording", {
    body: { callId, force },
  });
  if (error) throw error;
  const audit = await fetchAudit(callId);
  const payload = (data as any) ?? {};
  const s = payload.status as CallIntelligence["status"];
  const analysisStatus: AnalysisStatus =
    s === "pending_sync" ? "pending_sync"
    : s === "processing" ? "processing"
    : s === "cached" || s === "created" || s === "regenerated" ? "analyzed"
    : "missing";
  return {
    ...EMPTY,
    ...payload,
    analysisStatus,
    outputs_present: payload.outputs_present ?? { transcript: !!payload.transcript, insight: !!payload.summary },
    audit,
  };
}

export function useCallIntelligence(callId: string | null | undefined) {
  const qc = useQueryClient();
  const key = ["call-intel", callId];

  const query = useQuery({
    queryKey: key,
    enabled: !!callId,
    staleTime: 1000 * 60 * 60 * 24,
    queryFn: async () => {
      if (!callId) return EMPTY;
      const cached = await loadCached(callId);
      if (cached?.outputs_present.transcript && cached.outputs_present.insight) return cached;
      return await process(callId, false);
    },
  });

  // Live updates: if transcript or AI insight is created/updated for this
  // call (from any app surface or edge function), invalidate the cache so
  // every UI listening to this hook refreshes instantly.
  useEffect(() => {
    if (!callId) return;
    const ch = supabase
      .channel(`call-intel:${callId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pbx_call_transcripts', filter: `call_record_id=eq.${callId}` }, () => { qc.invalidateQueries({ queryKey: key }); qc.invalidateQueries({ queryKey: ["call-intel"] }); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pbx_ai_insights',     filter: `call_record_id=eq.${callId}` }, () => { qc.invalidateQueries({ queryKey: key }); qc.invalidateQueries({ queryKey: ["call-intel"] }); })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [callId]);

  const regenerate = useMutation({
    mutationFn: async () => {
      if (!callId) throw new Error("no call");
      return await process(callId, true);
    },
    onSuccess: (data) => qc.setQueryData(key, data),
  });

  return {
    data: query.data ?? EMPTY,
    isLoading: query.isLoading,
    error: query.error,
    isPending: query.data?.status === "pending_sync",
    refetch: query.refetch,
    regenerate: regenerate.mutate,
    isRegenerating: regenerate.isPending,
  };
}
