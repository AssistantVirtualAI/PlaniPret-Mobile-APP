// Écran de fin d'appel : le courtier décide s'il sauvegarde l'appel dans
// Maestro, et AVA propose (sans jamais envoyer automatiquement) un texto ou un
// courriel de suivi qu'il doit relire et confirmer avant l'envoi.
//
// Règles appliquées ici (et revalidées côté serveur) :
//  • rien n'est transcrit, analysé ni poussé vers Maestro avant un « Oui » ;
//  • la question est liée au seul appel qui vient de se terminer ;
//  • fermer, revenir en arrière ou perdre la connexion = annulation ;
//  • un double tap n'envoie jamais deux fois (clé d'idempotence serveur).
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  canSendFollowup,
  clientNameOf,
  clientNumberOf,
  followupIdempotencyKey,
  needsClientSelection,
  pickEndedCall,
  type ConsentCall,
  type EndedDetail,
} from "@/lib/planipret/postCallConsent";

const SELECT =
  "id, user_id, from_number, to_number, direction, maestro_client_id, maestro_client_name, from_name, to_name, duration_seconds, save_consent";

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
const btn = (bg: string): React.CSSProperties => ({
  flex: 1, padding: "12px 14px", borderRadius: 12, border: "none",
  background: bg, color: "#fff", fontWeight: 700, fontSize: 14,
});
const input: React.CSSProperties = {
  width: "100%", minHeight: 96, borderRadius: 12, padding: 10, fontSize: 14,
  background: "rgba(255,255,255,0.06)", color: "#fff",
  border: "1px solid rgba(255,255,255,0.14)",
};

function speak(text: string) {
  try {
    const s = window.speechSynthesis;
    if (!s) return;
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "fr-CA";
    s.speak(u);
  } catch { /* la question reste affichée à l'écran */ }
}

export default function PostCallConsentSheet() {
  const [call, setCall] = useState<ConsentCall | null>(null);
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState<"consent" | "followup">("consent");
  const [kind, setKind] = useState<"sms" | "email" | null>(null);
  const [draft, setDraft] = useState("");
  const [subject, setSubject] = useState("Suivi de notre appel");
  const [confirmed, setConfirmed] = useState(false);
  const [recipient, setRecipient] = useState("");
  const [clientChoice, setClientChoice] = useState("");
  const [userId, setUserId] = useState<string | null>(null);
  const spokenFor = useRef<string | null>(null);
  const sending = useRef(false);
  const handled = useRef<Set<string>>(new Set());

  const reset = useCallback(() => {
    setStep("consent"); setKind(null); setDraft(""); setConfirmed(false);
    setRecipient(""); setClientChoice(""); setSubject("Suivi de notre appel");
    sending.current = false;
  }, []);

  useEffect(() => {
    const onEnded = async (e: Event) => {
      const detail = ((e as CustomEvent).detail ?? {}) as EndedDetail;
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth?.user?.id;
      if (!uid) return;
      setUserId(uid);

      const { data: prof } = await supabase
        .from("planipret_profiles").select("id").eq("user_id", uid).maybeSingle();
      const owners = [uid, (prof as any)?.id].filter(Boolean).map(String);

      const since = new Date(Date.now() - 10 * 60_000).toISOString();
      let rows: ConsentCall[] = [];
      if (detail.providerCallId) {
        const pid = detail.providerCallId;
        const { data } = await supabase
          .from("planipret_phone_calls").select(SELECT)
          .or(`id.eq.${pid},ns_callid.eq.${pid},ns_call_id.eq.${pid}`).limit(3);
        rows = (data as any as ConsentCall[]) ?? [];
      }
      if (!rows.length) {
        const { data } = await supabase
          .from("planipret_phone_calls").select(SELECT)
          .in("user_id", owners)
          .gte("created_at", since)
          .order("created_at", { ascending: false }).limit(5);
        rows = (data as any as ConsentCall[]) ?? [];
      }
      const picked = pickEndedCall(rows, detail, owners);
      // Une réponse déjà donnée ne vaut jamais pour un nouvel appel, et un même
      // appel ne repose jamais deux fois la question.
      if (!picked || handled.current.has(picked.id)) return;
      handled.current.add(picked.id);
      setCall(picked);
      reset();
    };
    window.addEventListener("pp:call-ended", onEnded as EventListener);
    return () => window.removeEventListener("pp:call-ended", onEnded as EventListener);
  }, [reset]);

  const clientNumber = useMemo(() => (call ? clientNumberOf(call) : ""), [call]);
  const clientName = useMemo(
    () => (call ? (clientChoice.trim() || clientNameOf(call)) : ""),
    [call, clientChoice],
  );
  const mustPickClient = !!call && needsClientSelection(call) && !clientChoice.trim();

  useEffect(() => {
    if (!call || spokenFor.current === call.id) return;
    spokenFor.current = call.id;
    speak(`Voulez-vous sauvegarder cet appel dans Maestro et préparer le suivi ?`);
  }, [call]);

  const close = useCallback(() => {
    setCall(null);
    reset();
    try { window.speechSynthesis?.cancel?.(); } catch { /* ignore */ }
  }, [reset]);

  // Retour arrière Android / geste iOS = annulation, jamais une confirmation.
  useEffect(() => {
    if (!call) return;
    const onPop = () => close();
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [call, close]);

  useEffect(() => { if (kind === "sms") setRecipient(clientNumber); }, [kind, clientNumber]);

  if (!call) return null;

  const consent = async (action: "approve" | "decline" | "delete") => {
    if (busy) return;
    if (action === "approve" && mustPickClient) {
      toast.error("Choisissez le client associé avant de sauvegarder.");
      return;
    }
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("pp-call-consent", {
        body: {
          call_id: call.id,
          action,
          channel: "screen",
          client_name: clientChoice.trim() || undefined,
        },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error(String((data as any).error));
      if (action === "approve") {
        toast.success("Appel sauvegardé dans Maestro.");
        setStep("followup");
      } else if (action === "decline") {
        toast.success("Appel non sauvegardé. Rien n'a été envoyé.");
        close();
      } else {
        const m = (data as any)?.maestro;
        toast.success(m?.ok ? "Appel supprimé partout, y compris Maestro." : `Supprimé localement. Maestro : ${m?.detail ?? "échec"}`);
        close();
      }
    } catch (e: any) {
      toast.error(e?.message ?? "Action impossible — rien n'a été envoyé.");
    } finally {
      setBusy(false);
    }
  };

  const sendFollowup = async () => {
    if (!kind || sending.current) return;
    if (!canSendFollowup({ kind, body: draft, recipient, confirmed, busy })) return;
    sending.current = true;
    setBusy(true);
    try {
      const key = followupIdempotencyKey({
        userId: userId ?? "anon", callId: call.id, kind,
        recipient, body: draft, subject: kind === "email" ? subject : "",
      });
      const { data, error } = await supabase.functions.invoke("pp-call-followup", {
        body: {
          call_id: call.id,
          kind,
          recipient: recipient.trim(),
          recipient_name: clientName,
          subject: kind === "email" ? subject : null,
          body: draft.trim(),
          confirmed: true,
          idempotency_key: key,
        },
      });
      if (error) throw error;
      if (!(data as any)?.ok) throw new Error(String((data as any)?.error ?? "Envoi refusé par le serveur."));
      toast.success((data as any)?.idempotent_replay ? "Déjà envoyé — aucun deuxième envoi." : "Suivi envoyé.");
      close();
    } catch (e: any) {
      toast.error(e?.message ?? "Envoi impossible. Rien n'a été envoyé.");
      sending.current = false;
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={wrap} onClick={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div style={card} role="dialog" aria-label="Fin d'appel">
        <div style={{ fontSize: 12, opacity: 0.7 }}>Fin d'appel</div>
        <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 4 }}>{clientName || "Client inconnu"}</div>
        <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 14 }}>
          {clientNumber} · {call.duration_seconds ?? 0} s
        </div>

        {step === "consent" && (
          <>
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 10 }}>
              Voulez-vous sauvegarder cet appel dans Maestro et préparer le suivi ?
            </div>
            <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 12 }}>
              Tant que vous n'avez pas dit oui, rien n'est transcrit, analysé ni envoyé à Maestro.
            </div>
            {needsClientSelection(call) && (
              <>
                <div style={{ fontSize: 12, color: "#FBBF24", marginBottom: 6 }}>
                  Client non identifié — indiquez à quel client rattacher cet appel.
                </div>
                <input
                  value={clientChoice}
                  onChange={(e) => setClientChoice(e.target.value)}
                  placeholder="Nom du client"
                  style={{ ...input, minHeight: 0, marginBottom: 10 }}
                />
              </>
            )}
            <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
              <button
                disabled={busy || mustPickClient}
                style={{ ...btn("#16A34A"), opacity: busy || mustPickClient ? 0.6 : 1 }}
                onClick={() => consent("approve")}
              >
                Oui, sauvegarder
              </button>
              <button disabled={busy} style={btn("rgba(255,255,255,0.14)")} onClick={() => consent("decline")}>Non</button>
            </div>
            <button disabled={busy} style={{ ...btn("#B91C1C"), width: "100%" }} onClick={() => consent("delete")}>
              Supprimer l'audio et le sommaire partout
            </button>
          </>
        )}

        {step === "followup" && (
          <>
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 10 }}>Envoyer un suivi au client ?</div>
            <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
              <button style={btn(kind === "sms" ? "#2E9BDC" : "rgba(255,255,255,0.14)")} onClick={() => { setKind("sms"); setConfirmed(false); }}>Texto</button>
              <button style={btn(kind === "email" ? "#2E9BDC" : "rgba(255,255,255,0.14)")} onClick={() => { setKind("email"); setConfirmed(false); setRecipient(""); }}>Courriel</button>
              <button style={btn("rgba(255,255,255,0.14)")} onClick={close}>Aucun</button>
            </div>

            {kind && (
              <>
                <input
                  value={recipient}
                  onChange={(e) => { setRecipient(e.target.value); setConfirmed(false); }}
                  placeholder={kind === "sms" ? "Numéro du client" : "Courriel du client"}
                  style={{ ...input, minHeight: 0, marginBottom: 8 }}
                />
                {kind === "email" && (
                  <input
                    value={subject}
                    onChange={(e) => { setSubject(e.target.value); setConfirmed(false); }}
                    placeholder="Objet"
                    style={{ ...input, minHeight: 0, marginBottom: 8 }}
                  />
                )}
                <textarea
                  value={draft}
                  onChange={(e) => { setDraft(e.target.value); setConfirmed(false); }}
                  placeholder="Brouillon proposé — relisez-le et modifiez-le avant l'envoi."
                  style={input}
                />
                <div style={{ fontSize: 12, opacity: 0.75, marginTop: 8 }}>
                  Canal : {kind === "sms" ? "Texto (votre numéro)" : "Courriel Microsoft 365"} · Destinataire : {recipient || "à saisir"} · Client : {clientName || "—"}
                </div>
                <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12, margin: "10px 0" }}>
                  <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
                  Je confirme le destinataire et le texte complet.
                </label>
                <button
                  disabled={!canSendFollowup({ kind, body: draft, recipient, confirmed, busy })}
                  style={{ ...btn("#16A34A"), width: "100%", opacity: canSendFollowup({ kind, body: draft, recipient, confirmed, busy }) ? 1 : 0.6 }}
                  onClick={sendFollowup}
                >
                  Confirmer et envoyer
                </button>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
