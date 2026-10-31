import { useEffect, useState } from "react";
import { nativeSip } from "@/lib/planipret/sip/nativeSipService";
import { mobileLinePresentation } from "@/lib/planipret/sip/mobileLinePresentation";

export function useMobileLinePresentation(profileExtension: string | null) {
  const [snapshot, setSnapshot] = useState(() => nativeSip.getDiagnostics());
  useEffect(() => {
    const update = () => setSnapshot(nativeSip.getDiagnostics());
    window.addEventListener("sip-registration-state", update);
    update();
    return () => window.removeEventListener("sip-registration-state", update);
  }, []);
  return mobileLinePresentation(snapshot, profileExtension);
}