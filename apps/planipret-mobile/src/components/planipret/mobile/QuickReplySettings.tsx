// Réglages > Réponses rapides : textes envoyés quand on refuse un appel par texto.
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  QUICK_REPLY_IDS, QUICK_REPLY_MAX_LEN, loadQuickReplies, saveQuickReplies, resetQuickReplies,
  type QuickReplyLang, type QuickReplyTemplates,
} from "@/lib/planipret/quickReply";

export default function QuickReplySettings({ lang, onClose }: { lang: QuickReplyLang; onClose: () => void }) {
  const fr = lang === "fr";
  const [uid, setUid] = useState<string | null>(null);
  const [tpl, setTpl] = useState<QuickReplyTemplates>(() => loadQuickReplies(null, lang));

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const id = data.user?.id ?? null;
      setUid(id);
      setTpl(loadQuickReplies(id, lang));
    });
  }, [lang]);

  const save = () => {
    if (!uid) return;
    saveQuickReplies(uid, tpl);
    toast.success(fr ? "Réponses enregistrées" : "Replies saved");
    onClose();
  };
  const reset = () => {
    if (!uid) return;
    resetQuickReplies(uid);
    setTpl(loadQuickReplies(uid, lang));
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-end" style={{ background: "rgba(0,0,0,0.5)" }} onClick={onClose}>
      <div role="dialog" aria-label={fr ? "Réponses rapides" : "Quick replies"} onClick={(e) => e.stopPropagation()}
        className="w-full rounded-t-3xl p-4 pb-8 space-y-3"
        style={{ background: "var(--pp-bg-card, #0F172A)", color: "var(--pp-text-primary, white)" }}>
        <h2 className="text-base font-bold">{fr ? "Réponses rapides" : "Quick replies"}</h2>
        <p className="text-xs" style={{ color: "var(--pp-text-muted)" }}>
          {fr ? "Envoyées par texto quand vous refusez un appel avec « Message »."
              : "Sent by text when you decline a call with “Message”."}
        </p>
        {QUICK_REPLY_IDS.map((id) => (
          <textarea key={id} rows={2} maxLength={QUICK_REPLY_MAX_LEN} value={tpl[id]}
            onChange={(e) => setTpl((t) => ({ ...t, [id]: e.target.value }))}
            className="w-full rounded-xl p-3 text-sm outline-none"
            style={{ background: "var(--pp-bg-elevated, rgba(255,255,255,0.06))", border: "1px solid var(--pp-bg-border)", color: "inherit" }} />
        ))}
        <div className="flex gap-2">
          <button onClick={reset} className="flex-1 py-2.5 rounded-xl text-sm" style={{ border: "1px solid var(--pp-bg-border)" }}>
            {fr ? "Par défaut" : "Defaults"}
          </button>
          <button onClick={save} disabled={!uid} className="flex-1 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-40"
            style={{ background: "var(--pp-color-primary, #0023e6)", color: "white" }}>
            {fr ? "Enregistrer" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
