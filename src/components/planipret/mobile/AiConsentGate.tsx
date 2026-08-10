// AiConsentGate — explicit AI consent shown the first time a broker uses the
// AVA chatbot or the AVA voice agent (App Store 5.1.2 / Loi 25 transparency).
import { useState } from "react";
import { Link } from "react-router-dom";
import { Bot, ShieldCheck } from "lucide-react";
import { useMplanipretLang } from "@/hooks/useMplanipretLang";

const KEY = "pp_ai_consent_v1";

export function hasAiConsent(): boolean {
  try { return localStorage.getItem(KEY) === "1"; } catch { return false; }
}

export function setAiConsent(): void {
  try {
    localStorage.setItem(KEY, "1");
    localStorage.setItem("pp_ai_consent_at", new Date().toISOString());
  } catch {}
}

export function revokeAiConsent(): void {
  try { localStorage.removeItem(KEY); } catch {}
}

export default function AiConsentGate({ onAccept, onDecline }: { onAccept: () => void; onDecline?: () => void }) {
  const { lang } = useMplanipretLang();
  const fr = lang !== "en";
  const [checked, setChecked] = useState(false);

  const accept = () => { setAiConsent(); onAccept(); };

  return (
    <div className="absolute inset-0 z-[80] flex items-center justify-center px-5"
      style={{ background: "rgba(4,11,22,0.96)", backdropFilter: "blur(14px)" }}>
      <div className="w-full max-w-sm rounded-2xl p-6"
        style={{ background: "var(--pp-bg-surface, #0A1628)", border: "1px solid var(--pp-bg-border, rgba(155,127,232,0.28))", maxHeight: "88vh", overflow: "auto" }}>
        <div className="flex items-center gap-2 mb-3">
          <Bot className="w-5 h-5" style={{ color: "var(--pp-brand-accent, #9B7FE8)" }} />
          <span className="text-[15px] font-bold" style={{ color: "var(--pp-text-primary, #E8EDF5)" }}>
            {fr ? "Assistant IA AVA" : "AVA AI assistant"}
          </span>
        </div>

        <p className="text-[13px] leading-relaxed mb-3" style={{ color: "var(--pp-text-secondary, #B4C6D8)" }}>
          {fr
            ? "AVA (clavardage et agent vocal) utilise des fournisseurs d'IA tiers : OpenAI, Google (Gemini) et Anthropic (Claude) pour le texte, ElevenLabs pour la voix."
            : "AVA (chat and voice agent) uses third-party AI providers: OpenAI, Google (Gemini) and Anthropic (Claude) for text, ElevenLabs for voice."}
        </p>
        <ul className="text-[12.5px] leading-relaxed mb-3 pl-4 list-disc" style={{ color: "var(--pp-text-secondary, #B4C6D8)" }}>
          <li>{fr ? "Transmis : vos messages, transcriptions d'appels et, si pertinent, le nom et le numéro du contact concerné." : "Sent: your messages, call transcripts and, when relevant, the related contact's name and number."}</li>
          <li>{fr ? "Jamais transmis : identifiants, mots de passe, jetons Microsoft 365 ou Maestro." : "Never sent: credentials, passwords, Microsoft 365 or Maestro tokens."}</li>
          <li>{fr ? "Les fournisseurs n'utilisent pas ces données pour entraîner leurs modèles." : "Providers do not use this data to train their models."}</li>
          <li>{fr ? "Vous pouvez refuser et continuer à utiliser l'app sans AVA." : "You can decline and keep using the app without AVA."}</li>
        </ul>

        <label className="flex gap-2 items-start mb-4 cursor-pointer text-[13px]" style={{ color: "var(--pp-text-primary, #E8EDF5)" }}>
          <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} className="mt-1" />
          <span>
            {fr ? "J'accepte le traitement par IA tierce décrit dans la " : "I consent to the third-party AI processing described in the "}
            <Link to="/planipret/privacy" target="_blank" className="underline" style={{ color: "var(--pp-brand-accent, #9B7FE8)" }}>
              {fr ? "politique de confidentialité" : "privacy policy"}
            </Link>.
          </span>
        </label>

        <button onClick={accept} disabled={!checked}
          className="w-full h-11 rounded-xl text-[14px] font-semibold flex items-center justify-center gap-2"
          style={{ background: "var(--pp-brand-accent, #9B7FE8)", color: "#0A1628", opacity: checked ? 1 : 0.5 }}>
          <ShieldCheck className="w-4 h-4" />
          {fr ? "Accepter et continuer" : "Accept and continue"}
        </button>
        {onDecline && (
          <button onClick={onDecline} className="w-full h-10 mt-2 rounded-xl text-[13px]"
            style={{ background: "transparent", color: "var(--pp-text-secondary, #B4C6D8)", border: "1px solid var(--pp-bg-border, rgba(255,255,255,0.12))" }}>
            {fr ? "Plus tard" : "Not now"}
          </button>
        )}
      </div>
    </div>
  );
}
