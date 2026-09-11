// Brouillon de texto pour un client : le courtier voit le destinataire et le
// texte complet, coche une confirmation explicite, puis seulement là le texto
// part. Fermer ou revenir en arrière = annulation. Une clé d'idempotence
// serveur empêche tout deuxième envoi (double tap, retry réseau).
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { followupIdempotencyKey } from "@/lib/planipret/postCallConsent";

export type SmsDraftTarget = { name: string; number: string; body?: string; clientKey?: string };

const wrap: React.CSSProperties = {
  position: "fixed", inset: 0, zIndex: 9000, background: "rgba(4,10,20,0.72)",
  display: "flex", alignItems: "flex-end", justifyContent: "center",
};
const card: React.CSSProperties = {
  width: "100%", maxWidth: 520, background: "var(--pp-bg-surface, #0A1628)",
  color: "#fff", borderTopLeftRadius: 20, borderTopRightRadius: 20,
  padding: 18, paddingBottom: "calc(18px + env(safe-area-inset-bottom, 0px))",
  fontFamily: "Urbanist,sans-serif", maxHeight: "88vh", overflowY: "auto",
};
const field: React.CSSProperties = {
  width: "100%", borderRadius: 12, padding: 10, fontSize: 14,
  background: "rgba(255,255,255,0.06)", color: "#fff",
  border: "1px solid rgba(255,255,255,0.14)",
};
const btn = (bg: string): React.CSSProperties => ({
  flex: 1, padding: "12px 14px", borderRadius: 12, border: "none",
  background: bg, color: "#fff", fontWeight: 700, fontSize: 14,
});

export function canSendSmsDraft(d: { recipient: string; body: string; confirmed: boolean; busy: boolean }): boolean {
  const digits = d.recipient.replace(/\D/g, "");
  return d.confirmed && !d.busy && digits.length >= 10 && d.body.trim().length > 0;
}

export default function SmsDraftSheet({
  target, onClose, onSent,
}: {
  target: SmsDraftTarget | null;
  onClose: () => void;
  onSent?: () => void;
}) {
  const [recipient, setRecipient] = useState("");
  const [body, setBody] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const sending = useRef(false);
  const userId = useRef<string>("anon");

  useEffect(() => {
    if (!target) return;
    setRecipient(target.number ?? "");
    setBody(target.body ?? "");
    setConfirmed(false);
    setFailure(null);
    sending.current = false;
    void supabase.auth.getUser().then(({ data }) => { userId.current = data.user?.id ?? "anon"; });
  }, [target]);

  // Retour arrière Android / geste iOS = annulation, jamais un envoi.
  useEffect(() => {
    if (!target) return;
    const onPop = () => onClose();
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [target, onClose]);

  if (!target) return null;

  const ready = canSendSmsDraft({ recipient, body, confirmed, busy });

  const send = async () => {
    if (!ready || sending.current) return;
    sending.current = true;
    setBusy(true);
    setFailure(null);
    try {
      const key = followupIdempotencyKey({
        userId: userId.current,
        callId: target.clientKey || `client:${recipient.replace(/\D/g, "").slice(-10)}`,
        kind: "sms",
        recipient,
        body,
        subject: "",
      });
      const { data, error } = await supabase.functions.invoke("pp-ns-sms", {
        body: {
          action: "send",
          to: recipient.trim(),
          message: body.trim(),
          idempotency_key: key,
        },
      });
      if (error) throw error;
      const res = data as any;
      if (res?.error || res?.ok === false) throw new Error(String(res?.error ?? "Envoi refusé par le serveur."));
      toast.success(res?.idempotent_replay || res?.duplicate ? "Déjà envoyé — aucun deuxième envoi." : "Texto envoyé.");
      onSent?.();
      onClose();
    } catch (e: any) {
      const msg = e?.message ?? "Envoi impossible.";
      setFailure(msg);
      toast.error(`${msg} Rien n'a été envoyé.`);
      // Un nouvel essai exige une nouvelle confirmation.
      setConfirmed(false);
      sending.current = false;
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={wrap} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={card} role="dialog" aria-label="Brouillon de texto">
        <div style={{ fontSize: 12, opacity: 0.7 }}>Brouillon de texto</div>
        <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 12 }}>{target.name || "Client"}</div>

        <label style={{ fontSize: 12, opacity: 0.75 }}>Destinataire</label>
        <input
          value={recipient}
          onChange={(e) => { setRecipient(e.target.value); setConfirmed(false); }}
          inputMode="tel"
          placeholder="Numéro du client"
          style={{ ...field, margin: "6px 0 10px" }}
        />

        <label style={{ fontSize: 12, opacity: 0.75 }}>Message</label>
        <textarea
          value={body}
          onChange={(e) => { setBody(e.target.value); setConfirmed(false); }}
          placeholder="Relisez et modifiez le texte avant l'envoi."
          style={{ ...field, minHeight: 110, margin: "6px 0 8px" }}
        />

        <div style={{ fontSize: 12, opacity: 0.75 }}>
          Canal : Texto depuis votre numéro · Destinataire : {recipient || "à saisir"} · Client : {target.name || "—"}
        </div>

        {failure && (
          <div style={{ fontSize: 12, color: "#FCA5A5", marginTop: 8 }}>
            Échec : {failure} — rien n'a été envoyé.
          </div>
        )}

        <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12, margin: "12px 0" }}>
          <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
          Je confirme le destinataire et le texte complet.
        </label>

        <div style={{ display: "flex", gap: 8 }}>
          <button style={btn("rgba(255,255,255,0.14)")} onClick={onClose} disabled={busy}>Annuler</button>
          <button
            style={{ ...btn("#16A34A"), opacity: ready ? 1 : 0.6 }}
            disabled={!ready}
            onClick={send}
          >
            Confirmer et envoyer
          </button>
        </div>
      </div>
    </div>
  );
}
