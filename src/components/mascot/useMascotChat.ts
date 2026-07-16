import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useLocation } from "react-router-dom";
import { useOrganization } from "@/context/OrganizationContext";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useMemo, useState } from "react";

export function useMascotChat(threadId: string) {
  const location = useLocation();
  const { selectedOrg } = useOrganization();
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (mounted) setToken(data.session?.access_token ?? null);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setToken(session?.access_token ?? null);
    });
    return () => { mounted = false; sub.subscription.unsubscribe(); };
  }, []);

  const transport = useMemo(() => {
    if (!token) return null;
    const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/mascot-agent`;
    return new DefaultChatTransport({
      api: url,
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
      },
      body: {
        context: {
          route: location.pathname,
          organizationId: selectedOrg?.id,
          organizationName: selectedOrg?.name,
          locale: typeof navigator !== "undefined" ? navigator.language : "en",
        },
      },
    });
  }, [token, location.pathname, selectedOrg?.id, selectedOrg?.name]);

  const chat = useChat({
    id: threadId,
    transport: transport ?? undefined,
  });

  return { ...chat, ready: !!transport };
}
