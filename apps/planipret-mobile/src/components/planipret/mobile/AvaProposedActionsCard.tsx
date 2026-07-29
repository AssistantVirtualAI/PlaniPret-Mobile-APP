import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, CheckCircle2, XCircle, Edit3, Sparkles, Mail, Calendar, ClipboardList, StickyNote, UserPlus, RefreshCw, ThumbsUp, ThumbsDown } from "lucide-react";


export type AvaAction = {
  id: string;
  type: "email_reply" | "maestro_task" | "maestro_note" | "calendar_event" | "maestro_client_create" | "maestro_status_update";
  title: string;
  description?: string;
  draft_content?: string;
  params?: Record<string, any>;
};

export type AvaAnalysis = {
  id: string;
  ms_message_id: string;
  email_subject: string | null;
  email_from: string | null;
  email_from_name: string | null;
  intent: string | null;
  urgency: string | null;
  lead_score: number | null;
  key_info: any;
  proposed_actions: AvaAction[];
  notification_summary: string | null;
};

const ICONS: Record<string, any> = {
  email_reply: Mail,
  calendar_event: Calendar,
  maestro_task: ClipboardList,
  maestro_note: StickyNote,
  maestro_client_create: UserPlus,
  maestro_status_update: RefreshCw,
};

const INTENT_LABELS: Record<string, string> = {
  contrat_signe: "📄 Contrat signé",
  nouveau_lead: "💡 Nouveau lead",
  demande_rdv: "📅 Demande de RDV",
  documents_recus: "📎 Documents reçus",
  question_info: "❓ Question / info",
  autre: "📧 Courriel",
};

const URGENCY_COLOR: Record<string, string> = {
  high: "var(--pp-danger)",
  medium: "var(--pp-warning, #f59e0b)",
  low: "var(--pp-text-muted)",
};

type ExecState = { status: "idle" | "running" | "done" | "error"; error?: string; mocked?: boolean; result?: any };

export default function AvaProposedActionsCard({ analysis, onDismiss }: { analysis: AvaAnalysis; onDismiss?: () => void }) {
  const [drafts, setDrafts] = useState<Record<string, string>>(() =>
    Object.fromEntries(analysis.proposed_actions.map((a) => [a.id, a.draft_content ?? ""]))
  );
  const [editing, setEditing] = useState<Record<string, boolean>>({});
  const [exec, setExec] = useState<Record<string, ExecState>>({});
  const [feedback, setFeedback] = useState<Record<string, "up" | "down" | "skipped" | "modified">>({});
  const [showComment, setShowComment] = useState<Record<string, boolean>>({});
  const [comments, setComments] = useState<Record<string, string>>({});

  const sendFeedback = async (action: AvaAction, rating: "up" | "down" | "skipped" | "modified", comment?: string) => {
    setFeedback((f) => ({ ...f, [action.id]: rating }));
    const original = action.draft_content ?? "";
    const final = drafts[action.id] ?? "";
    const modified = rating === "modified" || (rating !== "skipped" && final && final !== original);
    const { error } = await supabase.functions.invoke("ava-feedback-record", {
      body: {
        analysis_id: analysis.id,
        action_id: action.id,
        action_type: action.type,
        rating: modified && rating === "up" ? "modified" : rating,
        comment: comment ?? null,
        original_draft: original || null,
        final_content: final || null,
      },
    });
    if (error) { toast.error("Feedback non enregistré"); return; }
    toast.success(rating === "up" ? "Merci — AVA apprend 👍" : rating === "down" ? "Noté — AVA s'améliorera" : "Enregistré");
  };

  const runAction = async (action: AvaAction) => {
    setExec((s) => ({ ...s, [action.id]: { status: "running" } }));
    const { data, error } = await supabase.functions.invoke("ava-action-executor", {
      body: {
        analysis_id: analysis.id,
        action_id: action.id,
        modified_content: drafts[action.id] !== action.draft_content ? drafts[action.id] : undefined,
      },
    });
    if (error || !(data as any)?.success) {
      const msg = (data as any)?.error ?? error?.message ?? "Échec de l'action";
      setExec((s) => ({ ...s, [action.id]: { status: "error", error: msg } }));
      toast.error(msg);
      return;
    }
    setExec((s) => ({
      ...s,
      [action.id]: { status: "done", mocked: (data as any).execution_mode === "mock", result: (data as any).result },
    }));
    toast.success((data as any).execution_mode === "mock" ? "Action journalisée (Maestro pas encore branché)" : "Action effectuée");
  };

  const runAll = async () => {
    for (const a of analysis.proposed_actions) {
      if (exec[a.id]?.status === "done") continue;
      await runAction(a);
    }
  };


  return (
    <div
      className="rounded-2xl p-3 space-y-3"
      style={{
        background: "linear-gradient(135deg, #1A0D3D, #2D1A5A)",
        border: "1px solid rgba(155,127,232,0.35)",
        boxShadow: "0 4px 24px rgba(155,127,232,0.15)",
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <div
            className="w-9 h-9 rounded-full flex items-center justify-center text-lg"
            style={{ background: "linear-gradient(135deg, #2D1A5A, #9B7FE8)" }}
          >
            🤖
          </div>
          <div>
            <p className="text-sm font-bold text-white flex items-center gap-1.5">
              AVA <Sparkles className="w-3.5 h-3.5" style={{ color: "#9B7FE8" }} />
            </p>
            <p className="text-[11px]" style={{ color: "rgba(255,255,255,0.6)" }}>
              {INTENT_LABELS[analysis.intent ?? "autre"] ?? "📧 Courriel"}
              {analysis.urgency && (
                <span className="ml-2" style={{ color: URGENCY_COLOR[analysis.urgency] }}>
                  ● {analysis.urgency === "high" ? "urgent" : analysis.urgency}
                </span>
              )}
              {(analysis.lead_score ?? 0) > 0 && (
                <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: "rgba(255,255,255,0.1)", color: "white" }}>
                  🔥 {analysis.lead_score}/10
                </span>
              )}
            </p>
          </div>
        </div>
        {onDismiss && (
          <button onClick={onDismiss} className="text-xs" style={{ color: "rgba(255,255,255,0.5)" }}>×</button>
        )}
      </div>

      {analysis.notification_summary && (
        <p className="text-sm" style={{ color: "rgba(255,255,255,0.9)" }}>{analysis.notification_summary}</p>
      )}

      {Array.isArray(analysis.key_info) && analysis.key_info.length > 0 && (
        <ul className="text-xs space-y-0.5" style={{ color: "rgba(255,255,255,0.7)" }}>
          {analysis.key_info.slice(0, 4).map((k: string, i: number) => (
            <li key={i}>• {k}</li>
          ))}
        </ul>
      )}

      <div className="space-y-2">
        {analysis.proposed_actions.map((a, idx) => {
          const Icon = ICONS[a.type] ?? Mail;
          const st = exec[a.id];
          const isDone = st?.status === "done";
          const isRunning = st?.status === "running";
          const isErr = st?.status === "error";
          const isEditing = editing[a.id];
          return (
            <div
              key={a.id}
              className="rounded-xl p-2.5"
              style={{
                background: isDone ? "rgba(34,197,94,0.10)" : "rgba(255,255,255,0.06)",
                border: `1px solid ${isDone ? "rgba(34,197,94,0.30)" : "rgba(255,255,255,0.12)"}`,
              }}
            >
              <div className="flex items-start gap-2">
                <div
                  className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{ background: "rgba(155,127,232,0.20)" }}
                >
                  <Icon className="w-3.5 h-3.5" style={{ color: "#9B7FE8" }} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-white flex items-center gap-1">
                    <span className="opacity-60">{idx + 1}️⃣</span> {a.title}
                  </p>
                  {a.description && (
                    <p className="text-[11px] mt-0.5" style={{ color: "rgba(255,255,255,0.6)" }}>{a.description}</p>
                  )}
                  {(a.draft_content || drafts[a.id]) && (
                    <div className="mt-2">
                      {isEditing ? (
                        <textarea
                          value={drafts[a.id]}
                          onChange={(e) => setDrafts((d) => ({ ...d, [a.id]: e.target.value }))}
                          rows={5}
                          className="w-full text-[11px] rounded-lg px-2 py-1.5 outline-none"
                          style={{
                            background: "rgba(0,0,0,0.35)",
                            border: "1px solid rgba(255,255,255,0.15)",
                            color: "white",
                          }}
                        />
                      ) : (
                        <p
                          className="text-[11px] italic rounded-lg px-2 py-1.5 whitespace-pre-wrap"
                          style={{
                            background: "rgba(0,0,0,0.25)",
                            color: "rgba(255,255,255,0.85)",
                            maxHeight: 100,
                            overflow: "hidden",
                          }}
                        >
                          {drafts[a.id]}
                        </p>
                      )}
                    </div>
                  )}
                  {isErr && (
                    <p className="text-[10px] mt-1" style={{ color: "#f87171" }}>{st?.error}</p>
                  )}
                  {isDone && st?.mocked && (
                    <p className="text-[10px] mt-1" style={{ color: "rgba(255,255,255,0.6)" }}>
                      ⏳ Sera synchronisé quand Maestro sera branché
                    </p>
                  )}
                </div>
              </div>
              <div className="flex gap-1.5 mt-2">
                {!isDone && (
                  <button
                    onClick={() => runAction(a)}
                    disabled={isRunning}
                    className="flex-1 py-1.5 rounded-full text-[11px] font-semibold flex items-center justify-center gap-1 disabled:opacity-50"
                    style={{ background: "linear-gradient(135deg, #2E9BDC, #1A4A8A)", color: "white" }}
                  >
                    {isRunning ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
                    {isRunning ? "En cours…" : "Approuver"}
                  </button>
                )}
                {isDone && (
                  <div className="flex-1 py-1.5 rounded-full text-[11px] font-semibold flex items-center justify-center gap-1"
                    style={{ background: "rgba(34,197,94,0.20)", color: "#4ade80" }}>
                    <CheckCircle2 className="w-3 h-3" /> Effectué
                  </div>
                )}
                {!isDone && (
                  <button
                    onClick={() => setEditing((e) => ({ ...e, [a.id]: !e[a.id] }))}
                    className="px-2.5 py-1.5 rounded-full text-[11px] font-semibold flex items-center gap-1"
                    style={{ background: "rgba(255,255,255,0.08)", color: "white", border: "1px solid rgba(255,255,255,0.15)" }}
                  >
                    <Edit3 className="w-3 h-3" /> {isEditing ? "OK" : "Modifier"}
                  </button>
                )}
                {!isDone && (
                  <button
                    onClick={() => { sendFeedback(a, "skipped"); setExec((s) => ({ ...s, [a.id]: { status: "done", mocked: false, result: { skipped: true } } })); }}
                    className="px-2.5 py-1.5 rounded-full text-[11px]"
                    style={{ background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.6)" }}
                  >
                    <XCircle className="w-3 h-3" />
                  </button>
                )}
              </div>

              {isDone && !st?.result?.skipped && (
                <div className="mt-2 pt-2 flex items-center gap-2" style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}>
                  <span className="text-[10px]" style={{ color: "rgba(255,255,255,0.55)" }}>AVA a-t-elle bien fait ?</span>
                  <button
                    onClick={() => sendFeedback(a, "up")}
                    disabled={!!feedback[a.id]}
                    className="p-1 rounded-full disabled:opacity-100"
                    style={{ background: feedback[a.id] === "up" ? "rgba(74,222,128,0.25)" : "rgba(255,255,255,0.06)", color: feedback[a.id] === "up" ? "#4ade80" : "rgba(255,255,255,0.75)" }}
                  ><ThumbsUp className="w-3 h-3" /></button>
                  <button
                    onClick={() => { setShowComment((c) => ({ ...c, [a.id]: true })); }}
                    disabled={!!feedback[a.id] && feedback[a.id] !== "down"}
                    className="p-1 rounded-full disabled:opacity-100"
                    style={{ background: feedback[a.id] === "down" ? "rgba(248,113,113,0.25)" : "rgba(255,255,255,0.06)", color: feedback[a.id] === "down" ? "#f87171" : "rgba(255,255,255,0.75)" }}
                  ><ThumbsDown className="w-3 h-3" /></button>
                  {feedback[a.id] && (
                    <span className="text-[10px]" style={{ color: "rgba(255,255,255,0.5)" }}>merci</span>
                  )}
                </div>
              )}
              {showComment[a.id] && !feedback[a.id] && (
                <div className="mt-2 space-y-1.5">
                  <textarea
                    value={comments[a.id] ?? ""}
                    onChange={(e) => setComments((c) => ({ ...c, [a.id]: e.target.value }))}
                    placeholder="Qu'est-ce qui n'allait pas ? (optionnel)"
                    rows={2}
                    className="w-full text-[11px] rounded-lg px-2 py-1.5 outline-none"
                    style={{ background: "rgba(0,0,0,0.35)", border: "1px solid rgba(255,255,255,0.15)", color: "white" }}
                  />
                  <div className="flex gap-1.5">
                    <button
                      onClick={() => { sendFeedback(a, "down", comments[a.id]); setShowComment((c) => ({ ...c, [a.id]: false })); }}
                      className="flex-1 py-1 rounded-full text-[10px] font-semibold"
                      style={{ background: "rgba(248,113,113,0.25)", color: "#f87171" }}
                    >Envoyer</button>
                    <button
                      onClick={() => setShowComment((c) => ({ ...c, [a.id]: false }))}
                      className="px-2 py-1 rounded-full text-[10px]"
                      style={{ background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.6)" }}
                    >Annuler</button>
                  </div>
                </div>
              )}
            </div>

          );
        })}
      </div>

      {analysis.proposed_actions.some((a) => exec[a.id]?.status !== "done") && (
        <button
          onClick={runAll}
          className="w-full py-2 rounded-full text-xs font-bold flex items-center justify-center gap-1.5"
          style={{ background: "linear-gradient(135deg, #9B7FE8, #6C3CE1)", color: "white" }}
        >
          ✅ Tout approuver
        </button>
      )}
    </div>
  );
}
