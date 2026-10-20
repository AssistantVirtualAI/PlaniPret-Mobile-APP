import { supabase } from "@/integrations/supabase/client";

/** Only the saved comment ID is sent; the recipient is resolved server-side. */
export async function notifyFeedbackReply(commentId: string): Promise<boolean> {
  try {
    const { data, error } = await supabase.functions.invoke("pp-feedback-reply-notify", {
      body: { comment_id: commentId },
    });
    if (error || !data || data.error) return false;
    if (data.skipped) return true;
    return data.notification_logged === true && data.push_status === "accepted" && data.email_status === "sent";
  } catch { return false; }
}
