import { afterEach, describe, expect, it } from "vitest";
import { emailBodyCache } from "../persistentMediaCache";

afterEach(() => emailBodyCache.clear());

describe("persistent media cache (mobile bundle)", () => {
  it("keeps e-mail bodies isolated when cache keys include the broker identity", () => {
    emailBodyCache.set("broker-a:message-1", { subject: "A" });

    expect(emailBodyCache.get("broker-a:message-1")).toEqual({ subject: "A" });
    expect(emailBodyCache.get("broker-b:message-1")).toBeNull();
  });
});
