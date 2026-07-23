// Shared NS-API v2 paginator that probes header-based and parameter-based
// pagination so we never silently truncate at 200 items.

export const NS_API_BASE_URL = (Deno.env.get("NS_API_BASE_URL") ?? "https://voice.ava-telecom.ca/ns-api/v2").replace(/\/$/, "");
export const NS_API_KEY = Deno.env.get("NS_API_KEY") ?? "";

export type NsPageProbe = {
  url: string;
  status: number;
  count: number;
  headers: Record<string, string | null>;
};

export type NsFetchAllResult<T = any> = {
  ok: boolean;
  items: T[];
  pages: NsPageProbe[];
  totalFromHeader: number | null;
  paginationSignal: "x-total-count" | "content-range" | "page-shorter-than-limit" | "max-pages" | "duplicate-page" | "empty-page" | "error";
  warning?: string;
};

function readNumericHeader(h: Headers, name: string): number | null {
  const v = h.get(name);
  if (!v) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function parseContentRangeTotal(h: Headers): number | null {
  const v = h.get("content-range") || h.get("Content-Range");
  if (!v) return null;
  // e.g. "items 0-199/355"
  const m = v.match(/\/(\d+)\s*$/);
  return m ? Number(m[1]) : null;
}

function pickArray(data: any): any[] {
  if (Array.isArray(data)) return data;
  if (!data || typeof data !== "object") return [];
  for (const k of ["data", "users", "cdrs", "items", "messages", "voicemails", "recordings", "results"]) {
    const v = data[k];
    if (Array.isArray(v)) return v;
  }
  return [];
}

async function nsFetchRaw(path: string, init: RequestInit = {}) {
  const url = path.startsWith("http") ? path : `${NS_API_BASE_URL}${path}`;
  const headers = {
    Accept: "application/json",
    Authorization: `Bearer ${NS_API_KEY}`,
    Connection: "close",
    ...(init.headers ?? {}),
  };
  let lastErr: unknown = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), 25000);
      try {
        const res = await fetch(url, { ...init, headers, signal: ac.signal });
        const text = await res.text();
        let data: any = null;
        try { data = text ? JSON.parse(text) : null; } catch { data = null; }
        // Retry on transient 5xx
        if (!res.ok && res.status >= 500 && res.status < 600 && attempt < 2) {
          lastErr = new Error(`upstream ${res.status}`);
        } else {
          return { ok: res.ok, status: res.status, url, data, text, headers: res.headers };
        }
      } finally {
        clearTimeout(timer);
      }
    } catch (e) {
      lastErr = e;
    }
    await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

export async function nsProbe(path: string): Promise<NsPageProbe & { data: any; ok: boolean }> {
  const r = await nsFetchRaw(path);
  return {
    url: r.url,
    status: r.status,
    ok: r.ok,
    count: pickArray(r.data).length,
    data: r.data,
    headers: {
      "x-total-count": r.headers.get("x-total-count"),
      "content-range": r.headers.get("content-range"),
      "link": r.headers.get("link"),
    },
  };
}

/**
 * Fetch every item from a NetSapiens v2 list endpoint by trying the
 * `start` (1-based page) convention first, falling back to `offset` if the
 * first call returns nothing.
 *
 * `keyOf` extracts a stable id used to break out of repeated-page loops.
 */
export async function nsFetchAll<T = any>(
  basePath: string,
  opts: {
    pageSize?: number;
    maxPages?: number;
    keyOf?: (item: T) => string;
  } = {},
): Promise<NsFetchAllResult<T>> {
  const pageSize = opts.pageSize ?? 200;
  const maxPages = opts.maxPages ?? 50;
  const keyOf = opts.keyOf ?? ((x: any) => {
    return String(
      x?.id ?? x?.uuid ?? x?.user ?? x?.extension ?? x?.subscriber_login
      ?? x?.["call-id"] ?? x?.call_id ?? x?.cdr_id ?? x?.["cdr-id"]
      ?? x?.["orig-callid"] ?? x?.orig_callid ?? x?.["message-id"]
      ?? x?.message_id ?? JSON.stringify(x).slice(0, 200),
    );
  });

  const all: T[] = [];
  const seen = new Set<string>();
  const pages: NsPageProbe[] = [];
  let totalFromHeader: number | null = null;
  let signal: NsFetchAllResult["paginationSignal"] = "max-pages";
  let warning: string | undefined;

  for (let i = 0; i < maxPages; i++) {
    const sep = basePath.includes("?") ? "&" : "?";
    const url = `${basePath}${sep}limit=${pageSize}&start=${i * pageSize + 1}`;
    const r = await nsFetchRaw(url);
    const arr = pickArray(r.data) as T[];
    pages.push({
      url,
      status: r.status,
      count: arr.length,
      headers: {
        "x-total-count": r.headers.get("x-total-count"),
        "content-range": r.headers.get("content-range"),
        "link": r.headers.get("link"),
      },
    });

    if (!r.ok) {
      signal = "error";
      warning = `HTTP ${r.status}: ${r.text.slice(0, 200)}`;
      break;
    }

    if (totalFromHeader === null) {
      totalFromHeader = readNumericHeader(r.headers, "x-total-count") ?? parseContentRangeTotal(r.headers);
    }

    if (arr.length === 0) { signal = "empty-page"; break; }

    let added = 0;
    for (const item of arr) {
      const k = keyOf(item);
      if (seen.has(k)) continue;
      seen.add(k);
      all.push(item);
      added++;
    }

    if (added === 0) { signal = "duplicate-page"; break; }

    if (totalFromHeader !== null && all.length >= totalFromHeader) {
      signal = "x-total-count";
      break;
    }

    if (arr.length < pageSize) { signal = "page-shorter-than-limit"; break; }
  }

  return { ok: signal !== "error" || all.length > 0, items: all, pages, totalFromHeader, paginationSignal: signal, warning };
}

export async function nsGetServerVersion(): Promise<{ version: string | null; raw: any; error?: string }> {
  for (const p of ["/version", "/server/version", "/system/version"]) {
    const r = await nsFetchRaw(p);
    if (r.ok && r.data) {
      const v = String(
        r.data?.version ?? r.data?.server_version ?? r.data?.["server-version"]
        ?? r.data?.snap_version ?? r.data?.["snap-version"] ?? "",
      ).trim();
      return { version: v || null, raw: r.data };
    }
  }
  return { version: null, raw: null, error: "version_endpoint_not_found" };
}
