import { describe, it, expect } from "vitest";
import { resolveSpeakerName, unescapeTranscript } from "./transcriptSpeakers";
import { normalizeTranscriptTurns } from "./TranscriptConversation";
const ctx = { brokerExt: "1284", brokerName: "Jannie Brassard", internalByExt: { "1137": "Camille Asselin" }, contactsByPhone: { "5145550000": "Jean Client" } };
describe("transcript speakers", () => {
  it("broker ext -> broker name", () => expect(resolveSpeakerName("sip:1284M@planipret.ca", ctx)).toBe("Jannie Brassard"));
  it("contact -> client name", () => expect(resolveSpeakerName("sip:15145550000@sbc1.ucstack.io", ctx)).toBe("Jean Client"));
  it("internal -> colleague name", () => expect(resolveSpeakerName("sip:1137x@planipret.ca", ctx)).toBe("Camille Asselin"));
  it("unknown -> formatted number", () => expect(resolveSpeakerName("sip:15147071203@sbc1.ucstack.io", ctx)).toBe("+1 (514) 707-1203"));
  it("unescapes apostrophes", () => expect(unescapeTranscript("c\\'est")).toBe("c'est"));
  it("parses sip lines", () => {
    const t = normalizeTranscriptTurns(null, "sip:15147071203@sbc1.ucstack.io: c\\'est bon");
    expect(t[0]).toMatchObject({ speaker: "sip:15147071203@sbc1.ucstack.io", text: "c'est bon" });
  });
});
