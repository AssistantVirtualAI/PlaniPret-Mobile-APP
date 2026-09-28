import { useEffect, useState } from "react";
import { X, UserPlus, Loader2, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { invalidateCallerClient, resolveCallerClient } from "@/lib/planipret/callerClient";

export interface CreateClientTarget {
  phone: string;
  name?: string | null;
  callId?: string | null;
}

/**
 * Crée un client dans Maestro (POST documenté), puis relit Maestro avant de
 * confirmer. Ne dit jamais « créé » sans relecture réussie.
 */
export default function CreateMaestroClientSheet({
  target, onClose, onCreated,
}: {
  target: CreateClientTarget | null;
  onClose: () => void;
  onCreated?: (c: { maestroClientId: string; name: string }) => void;
}) {
  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [webUrl, setWebUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!target) return;
    const parts = String(target.name ?? "").trim().split(/\s+/).filter((p) => p && !/\d/.test(p));
    setFirst(parts[0] ?? "");
    setLast(parts.slice(1).join(" "));
    setEmail("");
    setPhone(target.phone ?? "");
    setWebUrl(null);
  }, [target]);

  if (!target) return null;

  const emailOk = !email.trim() || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const canSubmit = first.trim().length > 0 && first.length <= 80 && last.length <= 80 && emailOk && phone.replace(/\D/g, "").length >= 10 && !busy;

  const submit = async () => {
    if (!canSubmit) return;
    setBusy(true);
    setWebUrl(null);
    try {
      // A caller-ID name is not a trusted Maestro identity. Resolve the exact
      // phone through the broker-scoped directory immediately before a write
      // so a delayed UI/cache cannot create a duplicate client.
      const existing = await resolveCallerClient(phone);
      if (existing.found && existing.maestroClientId) {
        const name = existing.name || [first.trim(), last.trim()].filter(Boolean).join(" ") || "Client Maestro";
        invalidateCallerClient(phone);
        toast.message("Ce numéro est déjà lié à un client Maestro", { description: name });
        onCreated?.({ maestroClientId: existing.maestroClientId, name });
        onClose();
        return;
      }
      const { data, error } = await supabase.functions.invoke("maestro-client-create", {
        body: {
          first_name: first.trim(),
          last_name: last.trim() || undefined,
          email: email.trim() || undefined,
          phone: phone.trim(),
          call_id: target.callId ?? undefined,
        },
      });
      const d = data as any;
      if (d?.error === "maestro_endpoint_unavailable" && d?.web_url) {
        setWebUrl(d.web_url);
        toast.message("Terminez la création dans Maestro", { description: d.message });
        return;
      }
      if (d?.error === "maestro_not_connected") throw new Error("Connectez votre compte Maestro dans Réglages → Maestro.");
      if (error || !d?.success || !d?.client_id) throw new Error(d?.message || d?.error || error?.message || "Création refusée par Maestro");

      const id = String(d.client_id);
      // Relecture Maestro avant confirmation.
      const { data: rb } = await supabase.functions.invoke("maestro-actions", {
        body: { action: "client_profile", payload: { client_id: id, with_contracts: false } },
      });
      if (!(rb as any)?.success) {
        toast.warning("Création envoyée — confirmation Maestro en attente", { description: "Le client apparaîtra dès que Maestro le confirme." });
        return;
      }
      invalidateCallerClient(phone);
      const name = [first.trim(), last.trim()].filter(Boolean).join(" ");
      toast.success("Client créé et confirmé dans Maestro", { description: name });
      onCreated?.({ maestroClientId: id, name });
      onClose();
    } catch (e: any) {
      toast.error("Échec de la création", { description: e?.message });
    } finally {
      setBusy(false);
    }
  };

  const field = "w-full rounded-xl px-3 py-2.5 text-sm outline-none";
  const fieldStyle: React.CSSProperties = { background: "var(--pp-bg-elevated)", border: "1px solid var(--pp-bg-border)", color: "var(--pp-text-primary)" };

  return (
    <div className="fixed inset-0 z-[95] flex items-end justify-center" style={{ background: "rgba(0,0,0,.5)" }} onClick={onClose}>
      <div className="w-full max-w-md rounded-t-3xl p-5 space-y-3" onClick={(e) => e.stopPropagation()}
        style={{ background: "var(--pp-bg-surface)", color: "var(--pp-text-primary)", paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 20px)" }}>
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold flex items-center gap-2"><UserPlus className="w-4 h-4" /> Créer le client dans Maestro</h2>
          <button onClick={onClose} aria-label="Fermer" className="p-2 rounded-full" style={{ background: "var(--pp-bg-elevated)" }}><X className="w-4 h-4" /></button>
        </div>
        <input className={field} style={fieldStyle} placeholder="Prénom *" value={first} maxLength={80} onChange={(e) => setFirst(e.target.value)} />
        <input className={field} style={fieldStyle} placeholder="Nom" value={last} maxLength={80} onChange={(e) => setLast(e.target.value)} />
        <input className={field} style={fieldStyle} placeholder="Courriel (facultatif)" type="email" value={email} maxLength={255} onChange={(e) => setEmail(e.target.value)} />
        {!emailOk && <p className="text-[11px]" style={{ color: "var(--pp-danger)" }}>Courriel invalide</p>}
        <input className={field} style={fieldStyle} placeholder="Téléphone *" inputMode="tel" value={phone} maxLength={30} onChange={(e) => setPhone(e.target.value)} />
        {webUrl && (
          <a href={webUrl} target="_blank" rel="noreferrer" className="flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold"
            style={{ background: "var(--pp-bg-elevated)", color: "var(--pp-brand-accent)" }}>
            <ExternalLink className="w-4 h-4" /> Ouvrir le formulaire Maestro prérempli
          </a>
        )}
        <button onClick={() => void submit()} disabled={!canSubmit}
          className="w-full rounded-xl px-3 py-3 text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
          style={{ background: "var(--pp-brand-accent)", color: "#fff" }}>
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />} Créer le client
        </button>
      </div>
    </div>
  );
}
