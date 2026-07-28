import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Link } from "react-router-dom";

const CURRENT_VERSION = "2026-06";
// localStorage key to avoid re-showing the modal on every render before the
// full profile is loaded (BOOT_COLUMNS may not include privacy_version yet).
const LS_KEY = "pp_privacy_accepted_v";

function isAcceptedLocally(): boolean {
  try {
    return localStorage.getItem(LS_KEY) === CURRENT_VERSION;
  } catch {
    return false;
  }
}

function markAcceptedLocally() {
  try {
    localStorage.setItem(LS_KEY, CURRENT_VERSION);
  } catch {}
}

export default function PrivacyConsentGate({ profile, onAccepted }: { profile: any; onAccepted: () => void }) {
  // If already accepted locally (cached), never show the modal again in this session.
  const alreadyLocal = isAcceptedLocally();

  const needs =
    !alreadyLocal &&
    (!profile?.privacy_accepted_at || profile?.privacy_version !== CURRENT_VERSION);

  const [policy, setPolicy] = useState(false);
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(needs);

  // Only open if `needs` transitions from false → true (i.e. profile loaded and
  // consent is genuinely missing). Never re-open once the user has accepted.
  useEffect(() => {
    if (needs && !isAcceptedLocally()) setOpen(true);
  }, [needs]);

  if (!open) return null;

  const accept = async () => {
    setBusy(true);
    const { error } = await supabase
      .from("planipret_profiles")
      .update({
        privacy_accepted_at: new Date().toISOString(),
        privacy_version: CURRENT_VERSION,
        recording_consent: recording,
      })
      .eq("user_id", profile.user_id);
    setBusy(false);
    if (error) return;
    // Cache locally so the modal never re-appears even before the next profile reload.
    markAcceptedLocally();
    setOpen(false);
    onAccepted();
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4"
      style={{ background: "rgba(6,13,26,0.92)", backdropFilter: "blur(8px)" }}>
      <div className="planipret-scope w-full max-w-md pp-card" style={{ padding: 24, maxHeight: "90vh", overflow: "auto" }}>
        <h2 style={{ fontFamily: "Inter,sans-serif", fontWeight: 700, fontSize: 18, color: "var(--pp-text-primary)", marginBottom: 12 }}>
          🔏 Politique de confidentialité Planiprêt
        </h2>
        <ul style={{ fontSize: 13, color: "var(--pp-text-secondary)", lineHeight: 1.6, marginBottom: 16, paddingLeft: 18, listStyle: "disc" }}>
          <li>Vos appels et messages sont stockés pour fins de qualité et de conformité.</li>
          <li>Conservation : 365 jours (appels/SMS), 90 jours (enregistrements), 730 jours (audit).</li>
          <li>Vos données ne sont jamais vendues. <Link to="/planipret/privacy" className="underline" style={{ color: "var(--pp-brand-accent)" }}>Lire la politique complète</Link>.</li>
        </ul>

        <label className="flex gap-2 items-start mb-3 cursor-pointer" style={{ fontSize: 13, color: "var(--pp-text-primary)" }}>
          <input type="checkbox" checked={policy} onChange={(e) => setPolicy(e.target.checked)} className="mt-1" />
          <span>J'ai lu et j'accepte la <Link to="/planipret/privacy" target="_blank" className="underline" style={{ color: "var(--pp-brand-accent)" }}>politique de confidentialité</Link>.</span>
        </label>
        <label className="flex gap-2 items-start mb-4 cursor-pointer" style={{ fontSize: 13, color: "var(--pp-text-primary)" }}>
          <input type="checkbox" checked={recording} onChange={(e) => setRecording(e.target.checked)} className="mt-1" />
          <span>Je consens à l'enregistrement des appels à des fins de qualité et de formation.</span>
        </label>

        <button
          onClick={accept}
          disabled={!policy || !recording || busy}
          className="pp-btn-primary w-full"
          style={{ opacity: !policy || !recording ? 0.5 : 1 }}
        >
          {busy ? "…" : "Accepter et continuer"}
        </button>
      </div>
    </div>
  );
}
