import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { functions: { invoke: mocks.invoke } } }));
import { notifyFeedbackReply } from "../feedbackReply";
describe("feedback reply alerts", () => {
  beforeEach(() => vi.clearAllMocks());
  it("sends only the saved comment ID", async () => {
    mocks.invoke.mockResolvedValue({ data: { notification_logged: true, push_status: "accepted", email_status: "sent" } });
    expect(await notifyFeedbackReply("comment-1")).toBe(true);
    expect(mocks.invoke).toHaveBeenCalledWith("pp-feedback-reply-notify", { body: { comment_id: "comment-1" } });
  });
  it("does not treat partial alerts as complete", async () => {
    mocks.invoke.mockResolvedValue({ data: { notification_logged: true, push_status: "unconfirmed", email_status: "sent" } });
    expect(await notifyFeedbackReply("comment-1")).toBe(false);
  });
  it("keeps saved replies when the notification service fails", async () => {
    mocks.invoke.mockRejectedValue(new Error("offline"));
    expect(await notifyFeedbackReply("comment-1")).toBe(false);
  });
  it("accepts a deliberate self-reply skip without claiming delivery", async () => {
    mocks.invoke.mockResolvedValue({ data: { skipped: "self_reply" } });
    expect(await notifyFeedbackReply("comment-1")).toBe(true);
  });
});