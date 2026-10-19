import { render, screen, act, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

let currentUid: string | null = "A";
let authCb: ((e: string, s: any) => void) | null = null;
const data: Record<string, any> = {
  A: { me: { extension: "1284", full_name: "Courtier A" }, contacts: [{ full_name: "Client de A", phone: "5145550000" }] },
  B: { me: { extension: "1300", full_name: "Courtier B" }, contacts: [] },
};
vi.mock("@/integrations/supabase/client", () => {
  const q = (table: string) => {
    let uid: string | null = null; let single = false;
    const b: any = {
      select: () => b, not: () => b, limit: () => b,
      eq: (_c: string, v: string) => { uid = v; return b; },
      maybeSingle: () => { single = true; return b; },
      then: (res: any) => {
        if (table === "planipret_contacts") return Promise.resolve({ data: data[uid!]?.contacts ?? [] }).then(res);
        if (single) return Promise.resolve({ data: data[uid!]?.me ?? null }).then(res);
        return Promise.resolve({ data: [] }).then(res);
      },
    };
    return b;
  };
  return { supabase: {
    from: q,
    auth: {
      getUser: () => Promise.resolve({ data: { user: currentUid ? { id: currentUid } : null } }),
      onAuthStateChange: (cb: any) => { authCb = cb; return { data: { subscription: { unsubscribe: () => {} } } }; },
    },
  } };
});

import { TranscriptConversation } from "./TranscriptConversation";
import { resetSpeakerCtxCache } from "./transcriptSpeakers";

const turns = [{ speaker: "sip:1284M@planipret.ca", text: "Bonjour" }, { speaker: "sip:15145550000@sbc1.ucstack.io", text: "Allô" }];

describe("speaker context isolation", () => {
  beforeEach(() => { resetSpeakerCtxCache(); currentUid = "A"; data.A.me = { extension: "1284", full_name: "Courtier A" }; });
  it("reloads profile on USER_UPDATED with the same user id", async () => {
    const { container } = render(<TranscriptConversation turns={turns} />);
    await waitFor(() => expect(screen.getByText("Courtier A")).toBeInTheDocument());
    // Profile data changes (e.g. broker renamed) but uid stays "A".
    data.A.me = { extension: "1284", full_name: "Courtier A modifié" };
    await act(async () => { authCb?.("USER_UPDATED", { user: { id: "A" } }); });
    await waitFor(() => expect(screen.getByText("Courtier A modifié")).toBeInTheDocument());
    // The refreshed broker name shows, not the stale "Poste 1284" fallback.
    expect(container.textContent).not.toContain("Poste 1284");
  });

  it("never shows user A's names after sign-out and sign-in as B", async () => {
    const { container } = render(<TranscriptConversation turns={turns} />);
    await waitFor(() => expect(screen.getByText("Client de A")).toBeInTheDocument());
    expect(screen.getByText("Courtier A")).toBeInTheDocument();
    await act(async () => { currentUid = null; authCb?.("SIGNED_OUT", null); });
    expect(container.textContent).not.toContain("Client de A");
    expect(container.textContent).not.toContain("Courtier A");
    await act(async () => { currentUid = "B"; authCb?.("SIGNED_IN", { user: { id: "B" } }); });
    await waitFor(() => expect(screen.getByText("+1 (514) 555-0000")).toBeInTheDocument());
    expect(container.textContent).not.toContain("Client de A");
    expect(container.textContent).not.toContain("Courtier A");
    expect(screen.getByText("Poste 1284")).toBeInTheDocument();
  });
});
