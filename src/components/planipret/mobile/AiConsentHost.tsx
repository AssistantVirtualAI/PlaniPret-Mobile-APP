// AiConsentHost — global, on-demand AI consent prompt (App Store 5.1.1(i)/5.1.2(i)).
// Any feature that sends user data to a third-party AI provider must await
// ensureAiConsent() first. If the broker has not consented yet, the disclosure
// dialog is shown and the call proceeds only after an explicit "Accept".
import { useEffect, useState } from "react";
import AiConsentGate, { hasAiConsent } from "./AiConsentGate";

type Resolver = (granted: boolean) => void;

let opener: ((resolve: Resolver) => void) | null = null;

export async function ensureAiConsent(): Promise<boolean> {
  if (hasAiConsent()) return true;
  if (!opener) return false;
  return new Promise<boolean>((resolve) => opener!(resolve));
}

export default function AiConsentHost() {
  const [resolver, setResolver] = useState<Resolver | null>(null);

  useEffect(() => {
    opener = (resolve) => setResolver(() => resolve);
    return () => { opener = null; };
  }, []);

  if (!resolver) return null;

  const finish = (granted: boolean) => {
    resolver(granted);
    setResolver(null);
  };

  return (
    <div className="fixed inset-0 z-[90]">
      <AiConsentGate onAccept={() => finish(true)} onDecline={() => finish(false)} />
    </div>
  );
}
