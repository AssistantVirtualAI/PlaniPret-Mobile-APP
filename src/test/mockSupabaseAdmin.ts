// Minimal in-memory stand-in for the supabase-js admin client used by the
// Planiprêt task handler. Supports the exact chains the handler relies on.

type Row = Record<string, any>;

export interface MockDb { [table: string]: Row[] }

interface Filter { col: string; op: "eq" | "is" | "notIn" | "in"; value: any }

class Query implements PromiseLike<{ data: any; error: any }> {
  private filters: Filter[] = [];
  private mode: "select" | "update" | "delete" = "select";
  private patch: Row | null = null;
  private limitN = 1000;
  private failInsert = false;

  constructor(private rows: Row[], private opts: { uniqueOn?: string[]; onInsertError?: () => boolean } = {}) {}

  select(_cols?: string) { this.mode = "select"; return this; }
  update(patch: Row) { this.mode = "update"; this.patch = patch; return this; }
  eq(col: string, value: any) { this.filters.push({ col, op: "eq", value }); return this; }
  neq(col: string, value: any) { this.filters.push({ col, op: "notIn", value: [String(value)] }); return this; }
  in(col: string, values: any[]) { this.filters.push({ col, op: "in", value: values.map(String) }); return this; }
  is(col: string, value: any) { this.filters.push({ col, op: "is", value }); return this; }
  not(col: string, _op: string, list: string) {
    const values = list.replace(/^\(|\)$/g, "").split(",").map((s) => s.replace(/^"|"$/g, ""));
    this.filters.push({ col, op: "notIn", value: values });
    return this;
  }
  order(_col: string, _o?: any) { return this; }
  limit(n: number) { this.limitN = n; return this; }

  insert(row: Row | Row[]) {
    const list = Array.isArray(row) ? row : [row];
    if (this.opts.onInsertError?.()) return Promise.resolve({ data: null, error: { message: "duplicate key" } });
    for (const r of list) {
      const keys = this.opts.uniqueOn ?? [];
      if (keys.length && this.rows.some((e) => keys.every((k) => e[k] === r[k]))) {
        return Promise.resolve({ data: null, error: { message: "duplicate key" } });
      }
      this.rows.push({ ...r });
    }
    return Promise.resolve({ data: list, error: null });
  }

  upsert(rows: Row | Row[], opts?: { onConflict?: string }) {
    const list = Array.isArray(rows) ? rows : [rows];
    const keys = (opts?.onConflict ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    for (const r of list) {
      const idx = keys.length ? this.rows.findIndex((e) => keys.every((k) => e[k] === r[k])) : -1;
      if (idx >= 0) this.rows[idx] = { ...this.rows[idx], ...r };
      else this.rows.push({ ...r });
    }
    return Promise.resolve({ data: list, error: null });
  }

  private matches(row: Row) {
    return this.filters.every((f) => {
      if (f.op === "eq") return row[f.col] === f.value;
      if (f.op === "is") return (row[f.col] ?? null) === f.value;
      if (f.op === "in") return f.value.includes(String(row[f.col]));
      return !f.value.includes(String(row[f.col]));
    });
  }

  private run() {
    const hits = this.rows.filter((r) => this.matches(r));
    if (this.mode === "update") {
      for (const r of hits) Object.assign(r, this.patch);
      return { data: hits, error: null };
    }
    return { data: hits.slice(0, this.limitN), error: null };
  }

  async maybeSingle() {
    const { data } = this.run();
    return { data: (data as Row[])[0] ?? null, error: null };
  }

  then<T1 = any, T2 = never>(
    onfulfilled?: ((v: { data: any; error: any }) => T1 | PromiseLike<T1>) | null,
    onrejected?: ((r: any) => T2 | PromiseLike<T2>) | null,
  ): PromiseLike<T1 | T2> {
    return Promise.resolve(this.run()).then(onfulfilled, onrejected);
  }
}

export function createMockAdmin(db: MockDb = {}) {
  const store: MockDb = db;
  const unique: Record<string, string[]> = {
    planipret_task_mutations: ["user_id", "idempotency_key"],
  };
  const admin = {
    db: store,
    from(table: string) {
      store[table] ??= [];
      return new Query(store[table], { uniqueOn: unique[table] });
    },
  };
  return admin;
}
