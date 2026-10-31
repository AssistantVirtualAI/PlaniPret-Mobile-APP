// Liste « Répondre par texto » affichée sur l'écran d'appel entrant.
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  QUICK_REPLY_IDS, QUICK_REPLY_MAX_LEN, loadQuickReplies, type QuickReplyLang, type QuickReplyTemplates,
} from "@/lib/planipret/quickReply";

export default function QuickReplySheet({
  lang, busy, onPick, onClose,
}: {
  lang: QuickReplyLang;
  busy?: boolean;
  onPick: (text: string) => void;
  onClose: () => void;
}) {
  const fr = lang === "fr";
  const [tpl, setTpl] = useState<QuickReplyTemplates>(() => loadQuickReplies(null, lang));
  const [custom, setCustom] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    supabase.auth.getUser().then(({ data }) => {
      if (alive) setTpl(loadQuickReplies(data.user?.id ?? null, lang));
    });
    return () => { alive = false; };
  }, [lang]);

  return (
    <div role="dialog" aria-label={fr ? "Répondre par texto" : "Reply by text"}
      className="absolute inset-x-0 bottom-0 z-10 rounded-t-3xl p-4 pb-8 space-y-2"
      style={{ background: "rgba(15,23,42,0.97)", borderTop: "1px solid rgba(255,255,255,0.12)", color: "white" }}>
      <p className="text-sm font-semibold text-center mb-1">
        {fr ? "Refuser et répondre par texto" : "Decline and reply by text"}
      </p>
      {custom === null ? (
        <>
          {QUICK_REPLY_IDS.map((id) => (
            <button key={id} disabled={busy} onClick={() => onPick(tpl[id])}
              className="w-full text-left px-4 py-3 rounded-2xl text-sm active:scale-[0.99] transition disabled:opacity-40"
              style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.14)" }}>
              {tpl[id]}
            </button>
          ))}
          <button disabled={busy} onClick={() => setCustom("")}
            className="w-full text-left px-4 py-3 rounded-2xl text-sm font-semibold disabled:opacity-40"
            style={{ background: "rgba(46,155,220,0.18)", border: "1px solid rgba(46,155,220,0.4)" }}>
            {fr ? "Personnalisé…" : "Custom…"}
          </button>
        </>
      ) : (
        <>
          <textarea autoFocus value={custom} maxLength={QUICK_REPLY_MAX_LEN}
            onChange={(e) => setCustom(e.target.value)} rows={3}
            aria-label={fr ? "Votre message" : "Your message"}
            className="w-full rounded-2xl p-3 text-sm outline-none"
            style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.18)", color: "white" }} />
          <button disabled={busy || !custom.trim()} onClick={() => onPick(custom)}
            className="w-full px-4 py-3 rounded-2xl text-sm font-semibold disabled:opacity-40"
            style={{ background: "linear-gradient(135deg,#1D4ED8,#2E9BDC)" }}>
            {fr ? "Refuser et envoyer" : "Decline and send"}
          </button>
        </>
      )}
      <button onClick={onClose} className="w-full py-2 text-sm text-white/70">{fr ? "Annuler" : "Cancel"}</button>
    </div>
  );
}
