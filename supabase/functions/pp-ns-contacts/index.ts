// pp-ns-contacts — Proxy NS-API v2 Contacts pour Planiprêt.
// Accepte action via query (?action=) OU body { action }.
//   list      → contacts personnels
//   shared    → contacts partagés du domaine
//   directory → annuaire interne (extensions)
//   create    → créer un contact personnel (body: first_name, last_name, phone, email, company)
//   update    → maj (body: contact_id, …)
//   delete    → suppr (body: contact_id)

import {
  corsHeaders,
  jsonResponse,
  requirePlanipretBroker,
  nsFetch,
} from "../_shared/planipret-ns.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const guard = await requirePlanipretBroker(req);
  if (guard instanceof Response) return guard;
  const { ctx } = guard;

  const url = new URL(req.url);
  let body: any = {};
  if (req.method !== "GET" && req.method !== "DELETE") {
    body = await req.json().catch(() => ({}));
  }
  const action = (body?.action ?? url.searchParams.get("action") ?? "list").toString();

  const userBase = `/domains/${encodeURIComponent(ctx.nsDomain)}/users/${encodeURIComponent(ctx.extension)}`;
  const domainBase = `/domains/${encodeURIComponent(ctx.nsDomain)}`;

  try {
    if (action === "list") {
      const limit = body?.limit ?? url.searchParams.get("limit") ?? "500";
      const res = await nsFetch(`${userBase}/contacts?limit=${limit}`, { method: "GET" });
      if (!res.ok) return jsonResponse({ error: "NS-API contacts fetch failed", status: res.status, body: await res.text() }, 502);
      const raw = await res.json();
      const contacts = Array.isArray(raw) ? raw : (raw?.contacts ?? raw?.data ?? []);
      return jsonResponse({ ok: true, count: contacts.length, contacts });
    }

    if (action === "shared") {
      const limit = body?.limit ?? url.searchParams.get("limit") ?? "500";
      const res = await nsFetch(`${domainBase}/contacts?limit=${limit}`, { method: "GET" });
      if (!res.ok) return jsonResponse({ error: "NS-API shared contacts fetch failed", status: res.status, body: await res.text() }, 502);
      const raw = await res.json();
      const contacts = Array.isArray(raw) ? raw : (raw?.contacts ?? raw?.data ?? []);
      return jsonResponse({ ok: true, count: contacts.length, contacts });
    }

    if (action === "directory") {
      const debug = body?.debug === true || url.searchParams.get("debug") === "1";
      const limit = body?.limit ?? url.searchParams.get("limit") ?? "500";
      const res = await nsFetch(`${domainBase}/users?limit=${encodeURIComponent(String(limit))}`, { method: "GET" });
      if (!res.ok) return jsonResponse({ error: "NS-API directory fetch failed", status: res.status, body: await res.text() }, 502);
      const raw = await res.json();
      const users = Array.isArray(raw) ? raw : (raw?.users ?? raw?.data ?? []);

      const pick = (u: any, keys: string[]) => {
        for (const k of keys) {
          const v = u?.[k];
          if (v !== undefined && v !== null && String(v).trim()) return String(v).trim();
        }
        return "";
      };

      const extractName = (u: any) => {
        const first =
          pick(u, ["first_name", "firstname", "first-name", "name-first-name", "given_name", "givenName", "fname"]);
        const last =
          pick(u, ["last_name", "lastname", "last-name", "name-last-name", "family_name", "familyName", "surname", "lname"]);
        const composed = `${first} ${last}`.trim();
        const display =
          pick(u, ["name", "display_name", "displayName", "full_name", "fullName", "name-display", "name-display-name", "caller_id_name", "callerid_name"]);
        const parts = !composed && display.includes(" ") ? display.split(/\s+/) : [];
        return { first: first || parts.slice(0, -1).join(" "), last: last || parts.slice(-1).join(" "), composed: composed || (parts.length > 1 ? display : ""), display };
      };

      const extractPosition = (u: any) =>
        pick(u, ["position", "job_title", "jobTitle", "title", "role_title", "roleTitle", "poste", "department", "name-job-title"]) || null;

      // First pass — figure out who is missing a real name
      const initial = users.map((u: any) => ({
        u,
        ext: u.user ?? u.extension ?? u.uid,
        ...extractName(u),
        position: extractPosition(u),
      }));

      // Enrich in parallel (bounded concurrency) for users where name/poste is missing.
      const missing = initial.filter((x) => (!x.composed || !x.display || !x.position) && x.ext);
      const CONCURRENCY = 8;
      let idx = 0;
      const details = new Map<string, any>();
      async function worker() {
        while (idx < missing.length) {
          const i = idx++;
          const ext = missing[i].ext;
          try {
            const r = await nsFetch(`${domainBase}/users/${encodeURIComponent(ext)}`, { method: "GET" });
            if (r.ok) {
              const j = await r.json().catch(() => null);
              if (j) details.set(String(ext), Array.isArray(j) ? j[0] : (j?.user ?? j));
            }
          } catch (_) { /* ignore */ }
        }
      }
      await Promise.all(Array.from({ length: Math.min(CONCURRENCY, missing.length) }, worker));

      const directory = initial.map(({ u, ext, first, last, composed, display, position }) => {
        let f = first, l = last, d = display, c = composed;
        const detail = ext ? details.get(String(ext)) : null;
        if (detail) {
          const ex = extractName(detail);
          f = f || ex.first;
          l = l || ex.last;
          d = d || ex.display;
          c = `${f} ${l}`.trim();
        }
        const name = (c || d || ext || "").toString();
        return {
          extension: ext,
          name,
          first_name: f || undefined,
          last_name: l || undefined,
          email: pick(u, ["email", "email-address", "user-email"]) || (detail ? pick(detail, ["email", "email-address", "user-email"]) : null),
          department: pick(u, ["department", "name-department"]) || (detail ? pick(detail, ["department", "name-department"]) : null),
          position: position ?? (detail ? extractPosition(detail) : null),
          presence: u.presence ?? u.status ?? (detail?.presence ?? detail?.status ?? "unknown"),
        };
      });

      if (debug) {
        return jsonResponse({
          ok: true,
          count: directory.length,
          sample_raw: users.slice(0, 2),
          sample_detail: Array.from(details.entries()).slice(0, 2),
          directory,
        });
      }
      return jsonResponse({ ok: true, count: directory.length, directory });
    }

    if (action === "create") {
      const { first_name, last_name, phone, email, company } = body ?? {};
      if (!first_name && !last_name && !phone) {
        return jsonResponse({ error: "first_name, last_name ou phone requis" }, 400);
      }
      const res = await nsFetch(`${userBase}/contacts`, {
        method: "POST",
        body: JSON.stringify({ first_name, last_name, phone, email, company }),
      });
      if (!res.ok) return jsonResponse({ error: "NS-API create contact failed", status: res.status, body: await res.text() }, 502);
      const result = await res.json().catch(() => ({}));
      return jsonResponse({ ok: true, contact: result });
    }

    if (action === "update") {
      const { contact_id, ...fields } = body ?? {};
      if (!contact_id) return jsonResponse({ error: "contact_id requis" }, 400);
      const res = await nsFetch(`${userBase}/contacts/${encodeURIComponent(contact_id)}`, {
        method: "PUT",
        body: JSON.stringify(fields),
      });
      if (!res.ok) return jsonResponse({ error: "NS-API update contact failed", status: res.status, body: await res.text() }, 502);
      const result = await res.json().catch(() => ({}));
      return jsonResponse({ ok: true, contact: result });
    }

    if (action === "delete" || req.method === "DELETE") {
      const contactId = body?.contact_id ?? url.searchParams.get("contact_id");
      if (!contactId) return jsonResponse({ error: "contact_id requis" }, 400);
      const res = await nsFetch(`${userBase}/contacts/${encodeURIComponent(contactId)}`, { method: "DELETE" });
      if (!res.ok && res.status !== 404) {
        return jsonResponse({ error: "NS-API delete contact failed", status: res.status, body: await res.text() }, 502);
      }
      return jsonResponse({ ok: true });
    }

    return jsonResponse({ error: `Action inconnue: ${action}` }, 400);
  } catch (e) {
    console.error("[pp-ns-contacts] Erreur:", e);
    return jsonResponse({ error: (e as Error).message }, 500);
  }
});
