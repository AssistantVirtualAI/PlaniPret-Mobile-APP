import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type Handlers = {
  onInboundRinging?: (call: any) => void;
  onAiInsight?: (call: any) => void;
};

/**
 * Global Supabase Realtime manager for the Planiprêt mobile app.
 * Subscribes to phone_calls / phone_messages / voicemails for the current user,
 * surfaces toasts and triggers callbacks for inbound ringing + AI insights.
 */
export function useRealtimeManager(userId: string | undefined, handlers: Handlers = {}) {
  const navigate = useNavigate();
  const seenInsights = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!userId) return;
    const ch = supabase
      .channel(`pp-rt:${userId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "planipret_phone_calls", filter: `user_id=eq.${userId}` },
        (p) => {
          const row: any = p.new;
          if (row.status === "inbound_ringing") handlers.onInboundRinging?.(row);
          else if (row.status === "outbound_ringing") navigate("/mplanipret/calls");
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "planipret_phone_calls", filter: `user_id=eq.${userId}` },
        (p) => {
          const row: any = p.new;
          const prev: any = p.old;
          if (row.status === "completed" && prev?.status !== "completed") {
            const dur = row.duration_seconds ? `${Math.round(row.duration_seconds)}s` : "";
            toast.success(`Appel terminé${dur ? ` · ${dur}` : ""}`);
            supabase.functions.invoke("ns-cdrs").catch(() => {});
          }
          if (row.ai_summary && !prev?.ai_summary && !seenInsights.current.has(row.id)) {
            seenInsights.current.add(row.id);
            handlers.onAiInsight?.(row);
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "planipret_phone_messages", filter: `user_id=eq.${userId}` },
        (p) => {
          const row: any = p.new;
          if (row.direction !== "inbound") return;
          const preview = String(row.body ?? "").slice(0, 60);
          toast(`💬 SMS de ${row.from_number ?? ""}`, {
            description: preview,
            action: { label: "Voir", onClick: () => navigate("/mplanipret/messages") },
          });
        }
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "planipret_voicemails", filter: `user_id=eq.${userId}` },
        (p) => {
          const row: any = p.new;
          toast(`📬 Nouveau voicemail de ${row.from_number ?? ""}`, {
            action: { label: "Écouter", onClick: () => navigate("/mplanipret/voicemail") },
          });
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [userId, navigate, handlers]);
}
