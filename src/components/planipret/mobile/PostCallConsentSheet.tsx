// Écran de fin d'appel : le courtier décide s'il sauvegarde l'appel dans
// Maestro, et propose (sans jamais envoyer automatiquement) un SMS ou un
// courriel de suivi qu'il doit confirmer avant l'envoi.
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type CallRow = {
  id: string;
  from_number: string | null;
  to_number: string | null;
  direction: string | null;
  maestro_client_name: string | null;
  from_name: string | null;
  to_name: string | null;
  duration_seconds: number | null;
  save_consent: string | null;
};

type Ended = { providerCallId?: string | null; number?: string | null };

const wrap: React.CSSProperties = {
  position: "fixed", inset: 0, zIndex: 9000, background: "rgba(4,10,20,0.72)",
  display: "flex", alignItems: "flex-end", justifyContent: "center",
};
const card: React.CSSProperties = {
  width: "100%", maxWidth: 520, background: "var(--pp-bg-surface, #0A1628)",
  color: "#fff", borderTopLeftRadius: 20, borderTopRightRadius: 20,
  padding: 18, fontFamily: "Urbanist,sans-serif", maxHeight: "88vh", overflowY: "auto",
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
  const [call, setCall] = useState<CallRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState<"consent" | "followup">("consent");
  const [kind, setKind] = useState<"sms" | "email" | null>(null);
  const [draft, setDraft] = useState("");
  const [subject, setSubject] = useState("Suivi de notre appel");
  const [confirmed, setConfirmed] = useState(false);
  const [email, setEmail] = useState("");
  const spokenFor = useRef<string | null>(null);
  const draftEmail = () => email.trim();

  useEffect(() => {
    const onEnded = async (e: Event) => {
      const detail = ((e as CustomEvent).detail ?? {}) as Ended;
      const { data: auth } = await supabase.auth.getUser();
      if (!auth?.user) return;
      const since = new Date(Date.now() - 15 * 60_000).toISOString();
      let row: CallRow | null = null;
      if (detail.providerCallId) {
        const pid = detail.providerCallId;
        const { data } = await supabase
          .from("planipret_phone_calls")
          .select("id, from_number, to_number, direction, maestro_client_name, from_name, to_name, duration_seconds, save_consent")
          .or(`id.eq.${pid},ns_callid.eq.${pid},ns_call_id.eq.${pid}`)
          .limit(1);
        row = (data?.[0] as CallRow) ?? null;
      }
      if (!row) {
        const { data } = await supabase
          .from("planipret_phone_calls")
          .select("id, from_number, to_number, direction, maestro_client_name, from_name, to_name, duration_seconds, save_consent")
          .gte("created_at", since)
          .order("created_at", { ascending: false })
          .limit(1);
        row = (data?.[0] as CallRow) ?? null;
      }
      if (!row || row.save_consent === "approved" || row.save_consent === "declined") return;
      setCall(row);
      setStep("consent");
      setKind(null);
      setDraft("");
      setConfirmed(false);
    };
    window.addEventListener("pp:call-ended", onEnded as EventListener);
    return () => window.removeEventListener("pp:call-ended", onEnded as EventListener);
  }, []);

  const clientNumber = useMemo(() => {
    if (!call) return "";
    return (call.direction === "in" ? call.from_number : call.to_number) ?? "";
  }, [call]);
  const clientName = call?.maestro_client_name
    || (call?.direction === "in" ? call?.from_name : call?.to_name)
    || clientNumber;

  useEffect(() => {
    if (!call || spokenFor.current === call.id) return;
    spokenFor.current = call.id;
    speak(`Voulez-vous sauvegarder cet appel avec ${clientName} dans Maestro ? Voulez-vous aussi envoyer un suivi par texto ou courriel ?`);
  }, [call, clientName]);

  if (!call) return null;

  const close = () => { setCall(null); window.speechSynthesis?.cancel?.(); };

  const consent = async (action: "approve" | "decline" | "delete") => {
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("pp-call-consent", {
        body: { call_id: call.id, action, channel: "screen" },
      });
      if (error) throw error;
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
      toast.error(e?.message ?? "Action impossible.");
    } finally {
      setBusy(false);
    }
  };

  const sendFollowup = async () => {
    if (!kind || !draft.trim() || !confirmed) return;
    setBusy(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const userId = auth?.user?.id;
      const { data: fu } = await supabase.from("planipret_call_followups").insert({
        call_id: call.id,
        user_id: userId,
        kind,
        recipient: kind === "sms" ? clientNumber : draftEmail(),
        recipient_name: clientName,
        subject: kind === "email" ? subject : null,
        body: draft.trim(),
        status: "approved",
        approved_at: new Date().toISOString(),
      }).select("id").maybeSingle();

      if (kind === "sms") {
        const { error } = await supabase.functions.invoke("pp-ns-sms", {
          body: { action: "send", to: clientNumber, message: draft.trim(), idempotency_key: `followup-${call.id}` },
        });
        if (error) throw error;
      } else {
        const { error } = await supabase.functions.invoke("ms365-actions", {
          body: { action: "send_email", payload: { to: [draftEmail()], subject: subject || "Suivi", body: draft.trim() } },
        });
        if (error) throw error;
      }
      if (fu?.id) {
        await supabase.from("planipret_call_followups")
          .update({ status: "sent", sent_at: new Date().toISOString() })
          .eq("id", fu.id);
      }
      toast.success("Suivi envoyé.");
      close();
    } catch (e: any) {
      toast.error(e?.message ?? "Envoi impossible.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={wrap} onClick={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div style={card}>
        <div style={{ fontSize: 12, opacity: 0.7 }}>Fin d'appel</div>
        <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 4 }}>{clientName}</div>
        <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 14 }}>
          {clientNumber} · {call.duration_seconds ?? 0} s
        </div>

        {step === "consent" && (
          <>
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 10 }}>
              Sauvegarder l'enregistrement et le sommaire de cet appel dans Maestro ?
            </div>
            <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 12 }}>
              Tant que vous n'avez pas dit oui, rien n'est transcrit, analysé ni envoyé à Maestro.
            </div>
            <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
              <button disabled={busy} style={btn("#16A34A")} onClick={() => consent("approve")}>Oui, sauvegarder</button>
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
              <button style={btn(kind === "sms" ? "#2E9BDC" : "rgba(255,255,255,0.14)")} onClick={() => setKind("sms")}>Texto</button>
              <button style={btn(kind === "email" ? "#2E9BDC" : "rgba(255,255,255,0.14)")} onClick={() => setKind("email")}>Courriel</button>
              <button style={btn("rgba(255,255,255,0.14)")} onClick={close}>Aucun</button>
            </div>

            {kind && (
              <>
                {kind === "email" && (
                  <>
                    <input
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="Courriel du client"
                      style={{ ...input, minHeight: 0, marginBottom: 8 }}
                    />
                    <input
                      value={subject}
                      onChange={(e) => setSubject(e.target.value)}
                      placeholder="Objet"
                      style={{ ...input, minHeight: 0, marginBottom: 8 }}
                    />
                  </>
                )}
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="Texte proposé — relisez-le avant l'envoi."
                  style={input}
                />
                <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12, margin: "10px 0" }}>
                  <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
                  Je confirme le texte et le destinataire : {kind === "sms" ? clientNumber : (email || "courriel à saisir")}
                </label>
                <button
                  disabled={busy || !confirmed || !draft.trim() || (kind === "email" && !email.trim())}
                  style={{ ...btn("#16A34A"), width: "100%", opacity: busy || !confirmed ? 0.6 : 1 }}
                  onClick={sendFollowup}
                >
                  Envoyer maintenant
                </button>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
