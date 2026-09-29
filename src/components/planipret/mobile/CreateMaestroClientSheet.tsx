import { useEffect, useState } from "react";
import { X, UserPlus, Loader2, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { invalidateCallerClient, resolveCallerClient } from "@/lib/planipret/callerClient";
import { hasRequiredMaestroClientFields } from "@/lib/planipret/maestroClientDraft";

/** Codes numériques des listes Maestro (salutation, type de rue). */
const MAESTRO_SALUTATIONS = [{ v: "1", l: "M." }, { v: "2", l: "Mme" }];
const MAESTRO_STREET_TYPES = [
  { v: "1", l: "Rue" }, { v: "2", l: "Avenue" }, { v: "3", l: "Boulevard" },
  { v: "4", l: "Chemin" }, { v: "5", l: "Rang" }, { v: "6", l: "Place" },
];

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
  const [salutation, setSalutation] = useState("");
  const [sex, setSex] = useState("");
  const [language, setLanguage] = useState("fr");
  const [streetNumber, setStreetNumber] = useState("");
  const [streetName, setStreetName] = useState("");
  const [streetType, setStreetType] = useState("");
  const [apartment, setApartment] = useState("");
  const [city, setCity] = useState("");
  const [region, setRegion] = useState("QC");
  const [zip, setZip] = useState("");
  const [busy, setBusy] = useState(false);
  const [webUrl, setWebUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!target) return;
    const parts = String(target.name ?? "").trim().split(/\s+/).filter((p) => p && !/\d/.test(p));
    setFirst(parts[0] ?? "");
    setLast(parts.slice(1).join(" "));
    setEmail("");
    setPhone(target.phone ?? "");
    setSalutation(""); setSex(""); setLanguage("fr");
    setStreetNumber(""); setStreetName(""); setStreetType(""); setApartment("");
    setCity(""); setRegion("QC"); setZip("");
    setWebUrl(null);
  }, [target]);

  if (!target) return null;

  const emailOk = !email.trim() || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const zipOk = /^[A-Za-z]\d[A-Za-z] ?\d[A-Za-z]\d$/.test(zip.trim());
  const canSubmit = hasRequiredMaestroClientFields({
    firstName: first,
    lastName: last,
    phone,
    salutation,
    sex,
    language,
    streetNumber,
    streetName,
    streetType,
    city,
    region,
    zip,
  }) && emailOk && !busy;

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
          last_name: last.trim(),
          salutation: Number(salutation),
          sex,
          language,
          address: {
            street_number: streetNumber.trim(),
            street_name: streetName.trim(),
            street_type_dd: Number(streetType),
            apartment: apartment.trim() || undefined,
            city: city.trim(),
            region,
            zip: zip.trim().toUpperCase().replace(/\s/g, ""),
          },
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
      if (d?.errors && typeof d.errors === "object") {
        const first = Object.values(d.errors as Record<string, string[]>).flat()[0];
        throw new Error(first || "Maestro a refusé certaines informations.");
      }
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
      <div className="w-full max-w-md rounded-t-3xl p-5 space-y-3 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}
        style={{ background: "var(--pp-bg-surface)", color: "var(--pp-text-primary)", paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 20px)" }}>
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold flex items-center gap-2"><UserPlus className="w-4 h-4" /> Créer le client dans Maestro</h2>
          <button onClick={onClose} aria-label="Fermer" className="p-2 rounded-full" style={{ background: "var(--pp-bg-elevated)" }}><X className="w-4 h-4" /></button>
        </div>
        <p className="text-[11px]" style={{ color: "var(--pp-text-muted)" }}>
          <span style={{ color: "var(--pp-danger)" }}>*</span> Champs obligatoires exigés par Maestro — sans eux, Maestro refuse la création.
        </p>
        <input className={field} style={fieldStyle} placeholder="Prénom *" value={first} maxLength={80} onChange={(e) => setFirst(e.target.value)} />
        <input className={field} style={fieldStyle} placeholder="Nom *" value={last} maxLength={80} onChange={(e) => setLast(e.target.value)} />
        <input className={field} style={fieldStyle} placeholder="Courriel (facultatif)" type="email" value={email} maxLength={255} onChange={(e) => setEmail(e.target.value)} />
        <div className="grid grid-cols-3 gap-2">
          <select className={field} style={fieldStyle} value={salutation} onChange={(e) => setSalutation(e.target.value)} aria-label="Salutation">
            <option value="">Salutation *</option>
            {MAESTRO_SALUTATIONS.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
          </select>
          <select className={field} style={fieldStyle} value={sex} onChange={(e) => setSex(e.target.value)} aria-label="Sexe">
            <option value="">Sexe *</option><option value="m">Homme</option><option value="f">Femme</option>
          </select>
          <select className={field} style={fieldStyle} value={language} onChange={(e) => setLanguage(e.target.value)} aria-label="Langue">
            <option value="fr">Français *</option><option value="en">English *</option>
          </select>
        </div>
        <p className="text-xs font-semibold pt-1" style={{ color: "var(--pp-text-secondary)" }}>Adresse (exigée par Maestro)</p>
        <div className="grid grid-cols-3 gap-2">
          <input className={field} style={fieldStyle} placeholder="No civique *" value={streetNumber} maxLength={20} onChange={(e) => setStreetNumber(e.target.value)} />
          <select className={field + " col-span-2"} style={fieldStyle} value={streetType} onChange={(e) => setStreetType(e.target.value)} aria-label="Type de rue">
            <option value="">Type de rue *</option>
            {MAESTRO_STREET_TYPES.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
          </select>
        </div>
        <input className={field} style={fieldStyle} placeholder="Nom de la rue *" value={streetName} maxLength={120} onChange={(e) => setStreetName(e.target.value)} />
        <div className="grid grid-cols-3 gap-2">
          <input className={field} style={fieldStyle} placeholder="App." value={apartment} maxLength={20} onChange={(e) => setApartment(e.target.value)} />
          <input className={field + " col-span-2"} style={fieldStyle} placeholder="Ville *" value={city} maxLength={120} onChange={(e) => setCity(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <select className={field} style={fieldStyle} value={region} onChange={(e) => setRegion(e.target.value)} aria-label="Province">
            {["QC","ON","NB","NS","PE","NL","MB","SK","AB","BC","YT","NT","NU"].map((r) => <option key={r} value={r}>{r} *</option>)}
          </select>
          <input className={field} style={fieldStyle} placeholder="Code postal *" value={zip} maxLength={7} onChange={(e) => setZip(e.target.value.toUpperCase())} />
        </div>
        {zip.trim() && !zipOk && <p className="text-[11px]" style={{ color: "var(--pp-danger)" }}>Code postal invalide (ex. H2X 1Y4)</p>}
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
