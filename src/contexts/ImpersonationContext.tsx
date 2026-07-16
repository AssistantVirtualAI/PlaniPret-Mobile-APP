import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

interface ImpersonationState {
  orgId: string | null;
  orgName: string | null;
  enteredAt: string | null;
}

interface Ctx extends ImpersonationState {
  enter: (orgId: string, orgName: string) => Promise<void>;
  exit: () => void;
  isImpersonating: boolean;
}

const STORAGE_KEY = "ava_impersonation_v1";

const ImpersonationContext = createContext<Ctx>({
  orgId: null,
  orgName: null,
  enteredAt: null,
  enter: async () => {},
  exit: () => {},
  isImpersonating: false,
});

export const ImpersonationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = useState<ImpersonationState>({
    orgId: null,
    orgName: null,
    enteredAt: null,
  });

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (raw) setState(JSON.parse(raw));
    } catch {}
  }, []);

  const persist = (s: ImpersonationState) => {
    setState(s);
    try {
      if (s.orgId) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(s));
      else sessionStorage.removeItem(STORAGE_KEY);
    } catch {}
  };

  const enter = useCallback(async (orgId: string, orgName: string) => {
    try {
      await supabase.functions.invoke("start-impersonation", { body: { orgId } });
    } catch {}
    persist({ orgId, orgName, enteredAt: new Date().toISOString() });
  }, []);

  const exit = useCallback(() => {
    persist({ orgId: null, orgName: null, enteredAt: null });
  }, []);

  return (
    <ImpersonationContext.Provider
      value={{ ...state, enter, exit, isImpersonating: Boolean(state.orgId) }}
    >
      {children}
    </ImpersonationContext.Provider>
  );
};

export const useImpersonation = () => useContext(ImpersonationContext);
