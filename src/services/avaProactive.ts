import { supabase } from "@/integrations/supabase/client";

export type AvaSuggestion = {
  id: string;
  label: string;
  kind: "call" | "sms" | "email" | "reminder" | "maestro_action" | "open_voice" | "open_coach";
  payload?: Record<string, any>;
};

export type AvaResponse = {
  reply: string;
  suggestions: AvaSuggestion[];
  openCoach?: boolean;
  openVoice?: boolean;
};

type AvaArgs = {
  mode?: "chat" | "summarize" | "recommend";
  message?: string;
  history?: { role: "user" | "assistant"; content: string }[];
  context?: Record<string, any>;
  level?: "short" | "standard" | "detailed";
};

export async function callAva(args: AvaArgs): Promise<AvaResponse> {
  const { data, error } = await supabase.functions.invoke("pp-ava-chat", {
    body: {
      mode: args.mode ?? "chat",
      user_message: args.message ?? "",
      history: args.history ?? [],
      context: args.context ?? {},
      level: args.level ?? "standard",
    },
  });
  if (error) {
    return { reply: "Désolé, je rencontre un problème pour répondre.", suggestions: [] };
  }
  const d = (data ?? {}) as any;
  return {
    reply: String(d.reply ?? "…"),
    suggestions: Array.isArray(d.suggestions) ? d.suggestions : [],
    openCoach: !!d.openCoach,
    openVoice: !!d.openVoice,
  };
}

export type AvaActionContext = {
  openDialer: (n?: string) => void;
  openAva: () => void;
  openCoach?: (suggestions: AvaSuggestion[]) => void;
  navigateSms?: (number: string, text?: string) => void;
  userId?: string;
  profileId?: string;
};

export async function applyAvaSuggestion(s: AvaSuggestion, ctx: AvaActionContext): Promise<{ ok: boolean; message?: string }> {
  try {
    switch (s.kind) {
      case "call": {
        const n = String(s.payload?.number ?? s.payload?.to ?? "");
        if (!n) return { ok: false, message: "Numéro manquant" };
        ctx.openDialer(n);
        return { ok: true };
      }
      case "sms": {
        const n = String(s.payload?.number ?? s.payload?.to ?? "");
        const t = String(s.payload?.text ?? s.payload?.message ?? "");
        if (!n) return { ok: false, message: "Numéro manquant" };
        ctx.navigateSms?.(n, t);
        return { ok: true };
      }
      case "email": {
        // Surface via toast/log; the Emails tab composer handles it.
        return { ok: true, message: "Ouvrez l'onglet Emails pour envoyer." };
      }
      case "reminder": {
        if (!ctx.userId) return { ok: false, message: "Session manquante" };
        const { error } = await supabase.from("planipret_reminders").insert({
          user_id: ctx.userId,
          title: String(s.payload?.title ?? s.label ?? "Rappel"),
          due_at: s.payload?.due_at ?? new Date(Date.now() + 3600_000).toISOString(),
          status: "pending",
        } as any);
        if (error) return { ok: false, message: error.message };
        return { ok: true, message: "Rappel créé" };
      }
      case "maestro_action": {
        const { data, error } = await supabase.functions.invoke("maestro-pipeline-orchestrator", {
          body: s.payload ?? {},
        });
        if (error) return { ok: false, message: error.message };
        return { ok: true, message: (data as any)?.message ?? "Action Maestro exécutée" };
      }
      case "open_voice": {
        ctx.openAva();
        return { ok: true };
      }
      case "open_coach": {
        ctx.openCoach?.([s]);
        return { ok: true };
      }
    }
  } catch (e: any) {
    return { ok: false, message: String(e?.message ?? e) };
  }
}
