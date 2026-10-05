import { render, screen, waitFor, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

const state: { responses: any[][]; calls: { table: string; ops: any[] }[] } = { responses: [], calls: [] };

function builder(table: string) {
  const rec = { table, ops: [] as any[] };
  state.calls.push(rec);
  let inFilter: { col: string; vals: string[] } | null = null;
  const b: any = {
    select: (...a: any[]) => { rec.ops.push(["select", ...a]); return b; },
    eq: (...a: any[]) => { rec.ops.push(["eq", ...a]); return b; },
    or: (...a: any[]) => { rec.ops.push(["or", ...a]); return b; },
    gte: (...a: any[]) => { rec.ops.push(["gte", ...a]); return b; },
    in: (col: string, vals: string[]) => { rec.ops.push(["in", col, vals]); inFilter = { col, vals }; return b; },
    order: (...a: any[]) => { rec.ops.push(["order", ...a]); return b; },
    maybeSingle: async () => ({ data: { id: "prof-1" }, error: null }),
    limit: async () => {
      const isProvider = rec.ops.some((o) => o[0] === "or" && String(o[1]).startsWith("id.eq."));
      if (isProvider) return { data: [], error: null };
      let rows = state.responses.length > 1 ? state.responses.shift()! : (state.responses[0] ?? []);
      if (inFilter) rows = rows.filter((r) => inFilter!.vals.includes(String(r[inFilter!.col])));
      return { data: rows, error: null };
    },
  };
  return b;
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { getUser: async () => ({ data: { user: { id: "u-1" } } }) },
    from: (t: string) => builder(t),
    functions: { invoke: vi.fn() },
  },
}));

import PostCallConsentSheet from "../PostCallConsentSheet";

const NUM = "+1 514 555 0101";
const iso = (msAgo: number) => new Date(Date.now() - msAgo).toISOString();
const row = (o: Partial<Record<string, any>>) => ({
  id: "c-1", user_id: "u-1", from_number: "5145550101", to_number: "5140000000",
  direction: "inbound", maestro_client_id: null, maestro_client_name: "Client A",
  from_name: null, to_name: null, duration_seconds: 120, save_consent: null,
  answered_at: iso(120_000), status: "completed", created_at: iso(130_000), ended_at: iso(1_000), ...o,
});
const fire = () => act(() => {
  window.dispatchEvent(new CustomEvent("pp:call-ended", {
    detail: { providerCallId: "sip-local-xyz", number: NUM, direction: "in", answered: true },
  }));
});
const dialog = () => screen.queryByRole("dialog", { name: "Décision après l'appel" });

beforeEach(() => { state.responses = []; state.calls = []; });

describe("PostCallConsentSheet — repli par numéro", () => {
  it("A. providerCallId introuvable → repli par numéro du courtier → fenêtre affichée", async () => {
    state.responses = [[row({})]];
    render(<PostCallConsentSheet />);
    fire();
    await waitFor(() => expect(dialog()).toBeInTheDocument());
    const fb = state.calls.find((c) => c.ops.some((o) => o[0] === "in"))!;
    expect(fb.ops).toContainEqual(["in", "user_id", ["u-1", "prof-1"]]);
    expect(fb.ops.find((o) => o[0] === "or")[1]).toMatch(/^ended_at\.gte\./);
  });

  it("B. appel créé il y a plus de 10 minutes mais terminé maintenant → fenêtre affichée", async () => {
    state.responses = [[row({ created_at: iso(45 * 60_000), answered_at: iso(44 * 60_000), duration_seconds: 2640 })]];
    render(<PostCallConsentSheet />);
    fire();
    await waitFor(() => expect(dialog()).toBeInTheDocument());
    expect(screen.getByText(/2640 s/)).toBeInTheDocument();
  });

  it("C. autre appel proche au même numéro : sens et heure choisissent le bon", async () => {
    state.responses = [[
      row({ id: "wrong-dir", direction: "outbound", maestro_client_name: "Mauvais sens", ended_at: iso(500) }),
      row({ id: "wrong-time", maestro_client_name: "Trop ancien", ended_at: iso(8 * 60_000) }),
      row({ id: "good", maestro_client_name: "Bon appel", ended_at: iso(2_000) }),
    ]];
    render(<PostCallConsentSheet />);
    fire();
    await waitFor(() => expect(dialog()).toBeInTheDocument());
    expect(screen.getByText("Bon appel")).toBeInTheDocument();
  });

  it("D. ended_at absent au premier essai puis écrit pendant les retries", async () => {
    state.responses = [[], [row({ ended_at: iso(500) })]];
    render(<PostCallConsentSheet />);
    fire();
    await waitFor(() => expect(dialog()).toBeInTheDocument(), { timeout: 3000 });
  });

  it("E. la ligne d'un autre courtier n'est jamais retenue", async () => {
    state.responses = [[row({ user_id: "other-broker", maestro_client_name: "Autre" })]];
    render(<PostCallConsentSheet />);
    fire();
    await new Promise((r) => setTimeout(r, 1700));
    expect(dialog()).toBeNull();
  }, 5000);

  it("appel manqué ou déjà tranché → aucune fenêtre", async () => {
    state.responses = [[
      row({ id: "m", answered_at: null, status: "missed", duration_seconds: 0 }),
      row({ id: "d", save_consent: "approved" }),
    ]];
    render(<PostCallConsentSheet />);
    fire();
    await new Promise((r) => setTimeout(r, 1700));
    expect(dialog()).toBeNull();
  }, 5000);
});
