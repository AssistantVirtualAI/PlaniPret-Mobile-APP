import { useCallback, useEffect, useRef, useState } from 'react';
import { mobileApi, CallDetail } from '../lib/mobileApi';
import { supabase } from '../integrations/supabase/client';

export type AiStage = 'idle' | 'transcribing' | 'analyzing' | 'done' | 'error';

export interface CallAiMeta {
  recording_path?: string | null;
  recording_name?: string | null;
  domain_uuid?: string | null;
  xml_cdr_uuid?: string | null;
  organization_id?: string | null;
}

/**
 * Shared hook to load a call's transcript + AI insights and (re)run
 * `ai-transcribe-call` → `ai-analyze-call`. Used by the recording row in
 * RecordingsScreen and by CallDetailScreen.
 */
export function useCallAi(callId: string | null, meta: CallAiMeta | undefined, opts: { autoLoad?: boolean } = {}) {
  const { autoLoad = true } = opts;
  const [data, setData] = useState<CallDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [stage, setStage] = useState<AiStage>('idle');
  const [error, setError] = useState<string | null>(null);
  const ranRef = useRef<string | null>(null);
  const runSeqRef = useRef(0);

  const mergeDetail = useCallback((fresh: CallDetail | null, preferFresh = false) => {
    if (!fresh) return;
    setData((prev) => {
      const p: any = prev || {};
      const f: any = fresh || {};
      return {
        ...(preferFresh ? p : f),
        ...(preferFresh ? f : p),
        transcript: (f.transcript?.length ? f.transcript : p.transcript) || [],
        summary: f.summary || p.summary || '',
        topics: f.topics?.length ? f.topics : (p.topics || []),
        actionItems: f.actionItems?.length ? f.actionItems : (p.actionItems || []),
        qualityScore: f.qualityScore ?? p.qualityScore ?? 0,
        coachingScore: f.coachingScore ?? p.coachingScore ?? null,
        coachingNotes: f.coachingNotes?.length ? f.coachingNotes : (p.coachingNotes || []),
        sentiment: f.sentiment || p.sentiment,
        intent: f.intent || p.intent || '',
      };
    });
  }, []);

  const load = useCallback(async () => {
    if (!callId) return null;
    const seq = runSeqRef.current;
    setLoading(true);
    try {
      const d = await mobileApi.callDetail(callId);
      // A stale fetch must never wipe transcript/AI data produced by a newer run.
      mergeDetail(d, seq === runSeqRef.current);
      return d;
    } catch (e: any) {
      setError(e?.message || 'Failed to load call');
      return null;
    } finally {
      setLoading(false);
    }
  }, [callId, mergeDetail]);

  useEffect(() => {
    if (autoLoad && callId) { load(); }
  }, [autoLoad, callId, load]);

  // Live broadcast/postgres_changes subscription so a transcript or insight
  // produced anywhere (mobile, desktop, portal, edge function) instantly
  // shows up here without re-running transcription.
  useEffect(() => {
    if (!callId) return;
    const ch = supabase
      .channel(`call-ai:${callId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pbx_call_transcripts', filter: `call_record_id=eq.${callId}` }, () => { load(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pbx_ai_insights',     filter: `call_record_id=eq.${callId}` }, () => { load(); })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [callId, load]);

  const run = useCallback(async (opts?: { force?: boolean }) => {
    if (!callId || running) return;
    const seq = runSeqRef.current + 1;
    runSeqRef.current = seq;
    setRunning(true);
    setError(null);
    setStage('transcribing');
    try {
      const claudeFallback = (() => { try { return localStorage.getItem('ava.claudeFallback') !== 'off'; } catch { return true; } })();
      const t = await mobileApi.transcribeCall(callId, {
        recording_path: meta?.recording_path,
        recording_name: meta?.recording_name,
        domain_uuid: meta?.domain_uuid,
        xml_cdr_uuid: meta?.xml_cdr_uuid || callId,
        organization_id: meta?.organization_id,
        force: opts?.force,
        disableClaude: !claudeFallback,
      });
      if (t?.provider) { try { localStorage.setItem('ava.lastTranscriber', t.provider); } catch {} }
      if (t?.stub || t?.error) {
        const reason = t.reason || t.error || '';
        let friendly = '';
        if (reason === 'recording-not-synced' || reason === 'no-recording' || /RECORDING_NOT_FOUND/i.test((t.fetchErrors || []).join(' '))) {
          friendly = "Enregistrement non disponible — l'appel n'a pas été enregistré ou la synchro PBX n'est pas encore terminée. Réessayez dans ~30 s.";
        } else if (reason === 'missing-ai-key') {
          friendly = "Clé IA manquante côté serveur. Contactez l'administrateur.";
        } else {
          friendly = `Transcription indisponible: ${reason || 'erreur inconnue'}`;
        }
        const err: any = new Error(friendly);
        err.reason = reason;
        err.retryAfterMs = (t as any).retry_after_ms;
        throw err;
      }

      setStage('analyzing');
      const transcriptText = (t as any)?.transcript_text || (t as any)?.transcript || '';
      const a: any = await mobileApi.analyzeCall(callId, {
        transcript: transcriptText,
        organization_id: meta?.organization_id,
        force: opts?.force,
      });
      if (a?.ok === false || a?.error) {
        throw new Error(a?.error || a?.reason || 'analysis failed');
      }
      // Merge analyze response directly so the UI updates even if the
      // downstream callDetail roundtrip is slow or eventually consistent.
      const ai = a?.insights || a?.analysis || a || {};
      const analyzedTranscriptText: string = a?.transcript_text || a?.transcript || transcriptText;
      const transcriptLines = analyzedTranscriptText
        ? analyzedTranscriptText.split(/\r?\n/).filter(Boolean).map((ln: string, i: number) => {
            const m = ln.match(/^\s*(agent|caller|customer|client|user)\s*[:\-]\s*(.+)$/i);
            const speaker = (m?.[1] || '').toLowerCase();
            return {
              speaker: speaker === 'agent' ? 'agent' : speaker ? 'customer' : (i % 2 === 0 ? 'customer' : 'agent'),
              text: m?.[2] || ln,
              t: i,
            } as { speaker: 'agent' | 'customer'; text: string; t: number };
          })
        : [];
      if (runSeqRef.current !== seq) return;
      setData((prev) => ({
        ...(prev || {} as any),
        transcript: transcriptLines.length ? transcriptLines : (prev?.transcript || []),
        summary: ai.summary || prev?.summary || '',
        topics: ai.topics || prev?.topics || [],
        actionItems: ai.action_items || ai.actionItems || prev?.actionItems || [],
        qualityScore: ai.quality_score ?? ai.qualityScore ?? prev?.qualityScore ?? 0,
        coachingScore: ai.coaching_score ?? ai.coachingScore ?? prev?.coachingScore ?? null,
        coachingNotes: ai.coaching_notes || ai.coachingNotes || prev?.coachingNotes || [],
        sentiment: ai.sentiment || prev?.sentiment,
        intent: ai.intent || prev?.intent || '',
      } as any));
      // Best-effort: refresh from server but merge — never wipe AI fields we
      // just produced if the server view hasn't caught up yet.
      mobileApi.callDetail(callId).then((fresh) => {
        if (runSeqRef.current !== seq) return;
        setData((prev) => {
          const p: any = prev || {};
          const f: any = fresh || {};
          return {
            ...f,
            transcript: (f.transcript?.length ? f.transcript : p.transcript) || [],
            summary: f.summary || p.summary || '',
            topics: f.topics?.length ? f.topics : (p.topics || []),
            actionItems: f.actionItems?.length ? f.actionItems : (p.actionItems || []),
            qualityScore: f.qualityScore ?? p.qualityScore ?? 0,
            coachingScore: f.coachingScore ?? p.coachingScore ?? null,
            coachingNotes: f.coachingNotes?.length ? f.coachingNotes : (p.coachingNotes || []),
            sentiment: f.sentiment || p.sentiment,
            intent: f.intent || p.intent || '',
          };
        });
      }).catch(() => {});
      ranRef.current = callId;
      setStage('done');
    } catch (e: any) {
      setError(e?.message || 'Transcription failed');
      setStage('error');
    } finally {
      setRunning(false);
    }
  }, [callId, running, meta, load]);


  return { data, loading, running, stage, error, load, run, setData };
}
