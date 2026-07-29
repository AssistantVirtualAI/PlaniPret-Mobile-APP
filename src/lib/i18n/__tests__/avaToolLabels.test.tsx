import { describe, it, expect } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import {
  AVA_TOOL_LABELS,
  AVA_TOOL_NAMES,
  getAvaToolLabel,
  isAvaToolName,
} from "@/lib/i18n/avaToolLabels";
import { avaFr, avaEn } from "@/lib/i18n/mp-screens/ava";
import { CalendarAwareConfirm } from "@/components/planipret/mobile/AvaVoiceAgent";

describe("AVA tool labels", () => {
  it("defines both FR and EN for every tool", () => {
    for (const name of AVA_TOOL_NAMES) {
      const entry = AVA_TOOL_LABELS[name];
      expect(entry.fr.length).toBeGreaterThan(0);
      expect(entry.en.length).toBeGreaterThan(0);
      expect(entry.fr).not.toBe(entry.en);
    }
  });

  it("returns the right language", () => {
    expect(getAvaToolLabel("send_sms", "fr")).toBe("Envoi d'un SMS");
    expect(getAvaToolLabel("send_sms", "en")).toBe("Sending an SMS");
    expect(getAvaToolLabel("make_call", "fr")).toBe("Lancement d'un appel");
    expect(getAvaToolLabel("make_call", "en")).toBe("Placing a call");
  });

  it("falls back to the raw name for unknown tools in both languages", () => {
    expect(isAvaToolName("nope_tool")).toBe(false);
    expect(getAvaToolLabel("nope_tool", "fr")).toBe("nope_tool");
    expect(getAvaToolLabel("nope_tool", "en")).toBe("nope_tool");
  });

  it("switching language never yields a missing identifier", () => {
    for (const name of AVA_TOOL_NAMES) {
      for (const lang of ["fr", "en"] as const) {
        const label = getAvaToolLabel(name, lang);
        expect(label).toBeTruthy();
        expect(label).not.toBe(name);
      }
    }
  });
});

describe("AVA chat dictionary parity", () => {
  it("has identical keys in FR and EN", () => {
    const walk = (o: Record<string, any>, prefix = ""): string[] =>
      Object.entries(o).flatMap(([k, v]) =>
        typeof v === "object" && v !== null ? walk(v, `${prefix}${k}.`) : [`${prefix}${k}`],
      );
    expect(walk(avaFr).sort()).toEqual(walk(avaEn).sort());
  });

  it("keeps the confirmation strings localized", () => {
    expect(avaFr.avaChat.confirm).toBe("Confirmer");
    expect(avaEn.avaChat.confirm).toBe("Confirm");
    expect(avaFr.avaChat.confirmRequired).not.toBe(avaEn.avaChat.confirmRequired);
  });
});

describe("CalendarAwareConfirm", () => {
  const pending = {
    tool: "send_sms",
    params: { to: "+15145550123", body: "Bonjour" },
    resolve: () => {},
  } as any;

  it("renders the FR tool label", () => {
    render(
      <CalendarAwareConfirm
        pending={pending}
        toolLabel={(n: string) => getAvaToolLabel(n, "fr")}
        onCancel={() => {}}
        onConfirm={() => {}}
      />,
    );
    expect(screen.getByText("Envoi d'un SMS")).toBeInTheDocument();
    cleanup();
  });

  it("renders the EN tool label after a language switch", () => {
    render(
      <CalendarAwareConfirm
        pending={pending}
        toolLabel={(n: string) => getAvaToolLabel(n, "en")}
        onCancel={() => {}}
        onConfirm={() => {}}
      />,
    );
    expect(screen.getByText("Sending an SMS")).toBeInTheDocument();
    cleanup();
  });
});
