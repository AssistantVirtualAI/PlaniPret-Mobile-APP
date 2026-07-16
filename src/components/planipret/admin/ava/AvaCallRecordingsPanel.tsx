import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Bot, RefreshCw, Play, Pause, X, Sparkles, Loader2 } from "lucide-react";

const ACCENT = "#2E9BDC";
const AGENT = "#9B7FE8";
const SUCCESS = "#00D4AA";

interface AvaConversation {
  conversation_id: string;
  agent_id: string;
  broker_name: string | null;
  broker_user_id: string | null;
  extension: string | null;
  start_time: string | null;
  duration_secs: number;
  status: string;
  call_successful: string | null;
  message_count: number | null;
}

const fmtDur = (s: number) => {
  if (!s) return "—";
  const m = Math.floor(s / 60);
  const r = s % 60;
  return m ? `${m}m${String(r).padStart(2, "0")}s` : `${r}s`;
};

async function invokeGET(action: string, params: Record<string, string> = {}): Promise<Response> {
  const { data: { session } } = await supabase.auth.getSession();
  const projectId = (import.meta as any).env?.VITE_SUPABASE_PROJECT_ID ?? "gejxisrqtvxavbrfcoxz";
  const anonKey = (import.meta as any).env?.VITE_SUPABASE_PUBLISHABLE_KEY ?? "";
  const qs = new URLSearchParams({ action, ...params });
  return fetch(`https://${projectId}.supabase.co/functions/v1/pp-admin-ava-elevenlabs?${qs}`, {
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${session?.access_token ?? anonKey}`,
    },
  });
}

export default function AvaCallRecordingsPanel() {
  const [rows, setRows] = useState<AvaConversation[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<any | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioLoading, setAudioLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const resp = await invokeGET("list", { limit: "100" });
      const j = await resp.json();
      if (!resp.ok) throw new Error(j?.error ?? `HTTP ${resp.status}`);
      setRows(j.conversations ?? []);
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const openDetail = async (row: AvaConversation) => {
    setDetail({ ...row });
    setAudioUrl(null);
    setDetailLoading(true);
    try {
      const resp = await invokeGET("details", { conversation_id: row.conversation_id });
      const j = await resp.json();
      if (resp.ok) setDetail({ ...row, ...j });
    } catch (e) {
      console.warn("details failed", e);
    } finally {
      setDetailLoading(false);
    }
  };

  const loadAudio = async () => {
    if (!detail?.conversation_id) return;
    setAudioLoading(true);
    try {
      const resp = await invokeGET("audio", { conversation_id: detail.conversation_id });
      const ct = resp.headers.get("Content-Type") ?? "";
      if (resp.ok && ct.includes("audio")) {
        const blob = await resp.blob();
        setAudioUrl(URL.createObjectURL(blob));
      } else {
        const j = await resp.json().catch(() => ({}));
        toast.error(`Audio indisponible: ${j?.error ?? resp.status}`);
      }
    } catch (e: any) {
      toast.error(`Audio: ${e?.message ?? e}`);
    } finally {
      setAudioLoading(false);
    }
  };

  const transcript: Array<{ role?: string; message?: string; time_in_call_secs?: number }> = Array.isArray(detail?.transcript)
    ? detail.transcript
    : [];

  return (
    <div className="space-y-4">
      <div className="pp-card p-4 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Bot className="w-4 h-4" style={{ color: AGENT }} />
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--pp-text-primary)" }}>Enregistrements Agent AVA (ElevenLabs)</div>
            <div style={{ fontSize: 11, color: "var(--pp-text-faint)" }}>
              Conversations vocales IA · endpoint <code>/v1/convai/conversations</code>
            </div>
          </div>
        </div>
        <button
          onClick={load}
          className="px-3 py-1.5 rounded-lg flex items-center gap-1.5 hover:bg-white/5"
          style={{ background: "var(--pp-bg-deep)", border: "1px solid var(--pp-bg-border-2)", fontSize: 11, color: "var(--pp-text-muted)" }}
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          Actualiser
        </button>
      </div>

      {error && (
        <div className="p-3 rounded-md" style={{ background: "rgba(232,76,76,0.08)", border: "1px solid rgba(232,76,76,0.25)", fontSize: 12, color: "#E84C4C" }}>
          {error}
        </div>
      )}

      <div className="pp-card overflow-hidden">
        <table className="w-full text-sm">
          <thead style={{ background: "var(--pp-bg-elevated)" }}>
            <tr style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--pp-text-faint)" }} className="text-left">
              <th className="p-3">Courtier</th>
              <th>Agent</th>
              <th>Durée</th>
              <th>Statut</th>
              <th>Messages</th>
              <th>Date</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <tr key={i} style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}>
                  {Array.from({ length: 7 }).map((_, j) => (
                    <td key={j} className="p-3">
                      <div className="h-3 w-3/4 animate-pulse rounded" style={{ background: "var(--pp-bg-elevated)" }} />
                    </td>
                  ))}
                </tr>
              ))
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="p-8 text-center" style={{ fontSize: 12, color: "var(--pp-text-faint)" }}>
                  Aucune conversation AVA trouvée. Vérifiez la config ElevenLabs des courtiers.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr
                  key={r.conversation_id}
                  className="cursor-pointer hover:bg-white/[0.02]"
                  style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}
                  onClick={() => openDetail(r)}
                >
                  <td className="p-3" style={{ color: "var(--pp-text-primary)" }}>
                    {r.broker_name ?? "—"}
                    {r.extension && <span className="ml-1" style={{ fontSize: 10, color: "var(--pp-text-faint)" }}>ext. {r.extension}</span>}
                  </td>
                  <td style={{ fontSize: 10, color: "var(--pp-text-faint)", fontFamily: "monospace" }}>{r.agent_id.slice(0, 12)}…</td>
                  <td style={{ color: "var(--pp-text-muted)" }}>{fmtDur(r.duration_secs)}</td>
                  <td>
                    <span style={{
                      fontSize: 10, padding: "2px 8px", borderRadius: 999,
                      background: r.call_successful === "success" ? "rgba(0,212,170,0.15)" : "rgba(155,127,232,0.14)",
                      color: r.call_successful === "success" ? SUCCESS : AGENT,
                      border: `1px solid ${r.call_successful === "success" ? SUCCESS : AGENT}55`,
                      fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4,
                    }}>
                      {r.status}
                    </span>
                  </td>
                  <td className="tabular-nums" style={{ color: "var(--pp-text-muted)", fontSize: 12 }}>{r.message_count ?? "—"}</td>
                  <td style={{ fontSize: 11, color: "var(--pp-text-faint)" }}>
                    {r.start_time ? new Date(r.start_time).toLocaleString("fr-CA", { dateStyle: "short", timeStyle: "short" }) : "—"}
                  </td>
                  <td><Sparkles className="w-3.5 h-3.5" style={{ color: AGENT }} /></td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {detail && (
        <div className="fixed inset-0 z-50 bg-black/60 flex justify-end" onClick={() => { setDetail(null); setAudioUrl(null); }}>
          <div
            className="h-full w-full max-w-md overflow-y-auto p-5"
            style={{ background: "var(--pp-bg-surface)", borderLeft: "1px solid var(--pp-bg-border-2)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 style={{ fontWeight: 600, color: "var(--pp-text-primary)" }}>Conversation AVA</h3>
              <button onClick={() => { setDetail(null); setAudioUrl(null); }}>
                <X className="w-4 h-4" style={{ color: "var(--pp-text-muted)" }} />
              </button>
            </div>

            <div className="space-y-3 text-sm" style={{ color: "var(--pp-text-secondary)" }}>
              <div>Courtier: <span style={{ color: "var(--pp-text-primary)" }}>{detail.broker_name ?? "—"}</span></div>
              <div style={{ fontSize: 11, fontFamily: "monospace", color: "var(--pp-text-faint)" }}>
                conv: {detail.conversation_id}<br />
                agent: {detail.agent_id}
              </div>
              <div>
                Durée: {fmtDur(detail.duration_secs ?? detail.call_duration_secs ?? 0)} · Statut: {detail.status ?? "—"}
              </div>
              <div>Date: {detail.start_time ? new Date(detail.start_time).toLocaleString("fr-CA") : "—"}</div>

              <div>
                <p style={{ fontSize: 11, color: "var(--pp-text-muted)", marginBottom: 4 }}>Audio</p>
                {audioUrl ? (
                  <audio src={audioUrl} controls className="w-full" />
                ) : (
                  <button
                    onClick={loadAudio}
                    disabled={audioLoading}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-white text-xs"
                    style={{ background: ACCENT }}
                  >
                    {audioLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                    Charger l'audio
                  </button>
                )}
              </div>

              <div>
                <p style={{ fontSize: 11, color: "var(--pp-text-muted)", marginBottom: 4 }}>Transcription</p>
                {detailLoading ? (
                  <div className="flex items-center gap-2 p-3 rounded-lg text-xs" style={{ background: "var(--pp-bg-elevated)", border: "1px solid var(--pp-bg-border-2)" }}>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Chargement…
                  </div>
                ) : transcript.length > 0 ? (
                  <div className="space-y-2">
                    {transcript.map((s, i) => {
                      const isUser = String(s.role ?? "").toLowerCase() === "user";
                      const bg = isUser ? "rgba(46,155,220,0.10)" : "rgba(155,127,232,0.10)";
                      const border = isUser ? "#2E9BDC55" : "#9B7FE855";
                      const nameColor = isUser ? "#2E9BDC" : "#9B7FE8";
                      return (
                        <div key={i} className="p-2.5 rounded-lg" style={{ background: bg, border: `1px solid ${border}`, fontSize: 12 }}>
                          <div className="flex items-center justify-between mb-1">
                            <span style={{ fontWeight: 700, color: nameColor, fontSize: 11 }}>{isUser ? "Client" : "AVA"}</span>
                            {s.time_in_call_secs != null && (
                              <span style={{ fontSize: 10, color: "var(--pp-text-faint)", fontFamily: "monospace" }}>
                                {fmtDur(Math.round(s.time_in_call_secs))}
                              </span>
                            )}
                          </div>
                          <div style={{ color: "var(--pp-text-primary)" }} className="whitespace-pre-wrap">{s.message}</div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="p-3 rounded-lg text-xs" style={{ background: "var(--pp-bg-elevated)", border: "1px solid var(--pp-bg-border-2)" }}>
                    Aucune transcription disponible.
                  </div>
                )}
              </div>

              {detail.analysis?.transcript_summary && (
                <div>
                  <p style={{ fontSize: 11, color: "var(--pp-text-muted)", marginBottom: 4 }}>Résumé IA</p>
                  <div className="p-3 rounded-lg text-xs" style={{ background: "var(--pp-bg-elevated)", border: "1px solid var(--pp-bg-border-2)", color: "var(--pp-text-primary)" }}>
                    {detail.analysis.transcript_summary}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
