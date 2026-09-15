import { describe, expect, it } from "vitest";
import { AVA_SENSITIVE_TOOLS } from "../../../../supabase/functions/_shared/ava-confirm";
import {
  buildAvaToolConfigs,
  buildAvaToolsArray,
  EXPECTED_TOOL_NAMES,
} from "../../../../supabase/functions/_shared/ava-tools";

describe("contrat des outils AVA / ElevenLabs", () => {
  it("expose exactement 77 outils uniques", () => {
    const configs = buildAvaToolConfigs("https://example.supabase.co", "anon-test");
    const names = configs.map((entry: any) => entry.tool_config.name);
    expect(configs).toHaveLength(77);
    expect(new Set(names).size).toBe(77);
    expect(new Set(EXPECTED_TOOL_NAMES)).toEqual(new Set(names));
  });

  it("déclare chaque mutation enregistrée comme client tool", () => {
    const configs = buildAvaToolConfigs("https://example.supabase.co", "anon-test");
    for (const entry of configs as any[]) {
      const cfg = entry.tool_config;
      if (AVA_SENSITIVE_TOOLS.has(cfg.name)) {
        expect(cfg.type, cfg.name).toBe("client");
        expect(cfg.expects_response, cfg.name).toBe(true);
        expect(cfg.api, cfg.name).toBeUndefined();
      } else {
        expect(cfg.type, cfg.name).toBe("webhook");
        expect(cfg.api_schema?.url, cfg.name).toContain("/functions/v1/ava-tool-executor");
      }
    }
  });

  it("préserve la même séparation dans le format inline legacy", () => {
    const tools = buildAvaToolsArray("https://example.supabase.co", "anon-test") as any[];
    const byName = new Map(tools.map((tool) => [tool.name, tool]));
    expect(byName.get("send_sms")?.type).toBe("client");
    expect(byName.get("make_call")?.type).toBe("client");
    expect(byName.get("hangup_call")?.type).toBe("client");
    expect(byName.get("get_call_history")?.type).toBe("webhook");
    expect(byName.get("list_tasks")?.type).toBe("webhook");
  });

  it("classe les mutations critiques dans la barrière de confirmation", () => {
    for (const name of [
      "make_call", "hangup_call", "send_sms", "send_email",
      "create_task", "update_task", "delete_task",
      "create_client", "update_client",
      "create_calendar_event", "update_calendar_event", "delete_calendar_event",
      "create_teams_chat", "send_teams_message",
      "push_call_summary", "push_client_note", "push_communication_log",
    ]) {
      expect(AVA_SENSITIVE_TOOLS.has(name), name).toBe(true);
    }
  });
});
