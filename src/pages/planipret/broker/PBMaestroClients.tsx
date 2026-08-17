import { useEffect, useState } from "react";
import { useOutletContext, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Users, X, Phone, MessageSquare, Mail, RefreshCw } from "lucide-react";
import { PAPage, PAPageHeader, PATableWrap } from "@/components/planipret/admin/PAPageShell";
import { PPEmptyState, PPSkeleton } from "@/components/planipret/admin/PPPrimitives";
import Pagination from "@/components/planipret/admin/Pagination";
import { useMplanipretLang } from "@/hooks/useMplanipretLang";
import type { BrokerCtx } from "./PlanipretBrokerLayout";

type Client = Record<string, any>;

function Section({ title, rows }: { title: string; rows: [string, any][] }) {
  const visible = rows.filter(([, v]) => v !== null && v !== undefined && v !== "");
  if (visible.length === 0) return null;
  return (
    <div>
      <div className="text-[11px] font-semibold uppercase tracking-wide mb-1.5" style={{ color: "var(--pp-text-muted)" }}>{title}</div>
      <div className="space-y-1.5">
        {visible.map(([k, v], i) => (
          <div key={`${k}-${i}`} className="flex justify-between gap-3 items-start">
            <span style={{ color: "var(--pp-text-muted)" }}>{k}</span>
            <span className="font-medium text-right break-all max-w-[65%]">
              {typeof v === "object" ? JSON.stringify(v) : String(v)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function PBMaestroClients() {
  const { } = useOutletContext<BrokerCtx>();
  const { lang } = useMplanipretLang();
  const en = lang === "en";
  const [params, setParams] = useSearchParams();
  const page = Math.max(1, parseInt(params.get("page") ?? "1", 10) || 1);
  const pageSize = Math.max(1, parseInt(params.get("size") ?? "25", 10) || 25);
  const search = params.get("search") ?? "";

  const [term, setTerm] = useState(search);
  const [rows, setRows] = useState<Client[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>("");
  const [detail, setDetail] = useState<Client | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const patch = (next: Record<string, string | null>, resetPage = true) => {
    const p = new URLSearchParams(params);
    Object.entries(next).forEach(([k, v]) => { if (!v) p.delete(k); else p.set(k, v); });
    if (resetPage) p.set("page", "1");
    setParams(p, { replace: true });
  };

  useEffect(() => { setTerm(search); }, [search]);

  useEffect(() => {
    const refreshAfterReconnect = () => setReloadKey((key) => key + 1);
    window.addEventListener("maestro:connected", refreshAfterReconnect);
    return () => window.removeEventListener("maestro:connected", refreshAfterReconnect);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError("");
      const { data, error: fnErr } = await supabase.functions.invoke("maestro-actions", {
        body: {
          action: "list_clients",
          payload: {
            search: search || undefined,
            limit: pageSize,
            offset: (page - 1) * pageSize,
            refresh: reloadKey > 0,
          },
        },
      });
      if (cancelled) return;
      const res = data as any;
      if (fnErr || !res?.success) {
        setRows([]);
        setTotal(0);
        setError(res?.error || (en ? "Unable to load Maestro clients." : "Impossible de charger les clients Maestro."));
      } else {
        setRows(Array.isArray(res.clients) ? res.clients : []);
        setTotal(Number(res.total ?? res.count ?? 0));
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [page, pageSize, search, reloadKey, en]);

  const openDetail = async (c: Client) => {
    setDetail(c);
    const cid = c.maestro_client_id ?? c.id;
    if (!cid) return;
    setDetailLoading(true);
    const { data } = await supabase.functions.invoke("maestro-actions", {
      body: { action: "client_profile", payload: { client_id: String(cid) } },
    });
    const res = data as any;
    if (res?.success && res.profile) setDetail((d) => ({ ...(d ?? {}), ...res.profile }));
    setDetailLoading(false);
  };

  return (
    <PAPage>
      <PAPageHeader
        icon={<Users className="w-4 h-4" />}
        title={en ? "Maestro clients" : "Clients Maestro"}
        subtitle={`${total} ${en ? "clients" : "clients"}`}
      />

      <div className="pp-card flex flex-wrap gap-2 items-center" style={{ padding: 12 }}>
        <form
          onSubmit={(e) => { e.preventDefault(); patch({ search: term || null }); }}
          className="flex gap-2 flex-1 min-w-[240px]"
        >
          <input
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder={en ? "Search name, email, phone…" : "Rechercher nom, courriel, téléphone…"}
            className="flex-1 px-3 py-2 rounded-lg text-[13px]"
            style={{ background: "var(--pp-surface-2, #fff)", border: "1px solid var(--pp-border, #e2e8f0)" }}
          />
          <button type="submit" className="px-3 py-2 rounded-lg text-[13px] font-semibold text-white" style={{ background: "var(--pp-brand-accent-2)" }}>
            {en ? "Search" : "Rechercher"}
          </button>
        </form>
        <button
          onClick={() => setReloadKey((k) => k + 1)}
          className="px-3 py-2 rounded-lg text-[13px] font-medium flex items-center gap-1.5"
          style={{ border: "1px solid var(--pp-border, #e2e8f0)" }}
        >
          <RefreshCw className="w-3.5 h-3.5" /> {en ? "Refresh" : "Actualiser"}
        </button>
      </div>

      {error && (
        <div className="pp-card" style={{ padding: 14, fontSize: 13, color: "#b91c1c" }}>{error}</div>
      )}

      <PATableWrap>
        {loading ? (
          <div style={{ padding: 16 }}><div className="space-y-2">{Array.from({length:6}).map((_,i)=>(<PPSkeleton key={i} style={{height:32}} />))}</div></div>
        ) : rows.length === 0 ? (
          <PPEmptyState
            icon={<Users className="w-5 h-5" />}
            title={en ? "No Maestro clients" : "Aucun client Maestro"}
            description={en ? "Connect Maestro in Settings, or adjust your search." : "Connectez Maestro dans Réglages, ou ajustez votre recherche."}
          />
        ) : (
          <table className="w-full text-[13px]">
            <thead>
              <tr style={{ textAlign: "left", color: "var(--pp-text-muted)" }}>
                <th style={{ padding: "10px 12px" }}>{en ? "Name" : "Nom"}</th>
                <th style={{ padding: "10px 12px" }}>{en ? "Phone" : "Téléphone"}</th>
                <th style={{ padding: "10px 12px" }}>{en ? "Email" : "Courriel"}</th>
                <th style={{ padding: "10px 12px" }} className="text-right">{en ? "Actions" : "Actions"}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c, i) => (
                <tr key={String(c.id ?? i)} className="border-t cursor-pointer hover:bg-slate-50" style={{ borderColor: "var(--pp-border, #e2e8f0)" }} onClick={() => openDetail(c)}>
                  <td style={{ padding: "10px 12px", fontWeight: 600 }}>{c.name || c.display_name || "—"}</td>
                  <td style={{ padding: "10px 12px" }}>{c.phone || "—"}</td>
                  <td style={{ padding: "10px 12px" }}>{c.email || "—"}</td>
                  <td style={{ padding: "10px 12px" }} className="text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                    {c.phone && (
                      <>
                        <a href={`tel:${c.phone}`} className="inline-flex items-center justify-center w-8 h-8 rounded-lg mr-1" style={{ border: "1px solid var(--pp-border, #e2e8f0)" }} title={en ? "Call" : "Appeler"}>
                          <Phone className="w-3.5 h-3.5" />
                        </a>
                        <a href={`/planipret/broker/messages?search=${encodeURIComponent(c.phone)}`} className="inline-flex items-center justify-center w-8 h-8 rounded-lg mr-1" style={{ border: "1px solid var(--pp-border, #e2e8f0)" }} title={en ? "Messages" : "Textos"}>
                          <MessageSquare className="w-3.5 h-3.5" />
                        </a>
                      </>
                    )}
                    {c.email && (
                      <a href={`mailto:${c.email}`} className="inline-flex items-center justify-center w-8 h-8 rounded-lg" style={{ border: "1px solid var(--pp-border, #e2e8f0)" }} title={en ? "Email" : "Courriel"}>
                        <Mail className="w-3.5 h-3.5" />
                      </a>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </PATableWrap>

      <Pagination
        page={page}
        pageSize={pageSize}
        total={total}
        loading={loading}
        onPageChange={(p) => patch({ page: String(p) }, false)}
        onPageSizeChange={(s) => patch({ size: String(s) })}
        unit={en ? "clients" : "clients"}
      />

      {detail && (
        <div className="fixed inset-0 z-50 flex justify-end" style={{ background: "rgba(15,23,42,.45)" }} onClick={() => setDetail(null)}>
          <div className="h-full w-full max-w-md overflow-y-auto" style={{ background: "var(--pp-surface, #fff)" }} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: "var(--pp-border, #e2e8f0)" }}>
              <h2 className="font-semibold text-[15px]">{detail.name || detail.display_name || (en ? "Client" : "Client")}</h2>
              <button onClick={() => setDetail(null)} className="p-1.5 rounded-lg"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-4 space-y-4 text-[13px]">
              {detailLoading && <PPSkeleton style={{height:80}} />}

              <Section title={en ? "Identity" : "Identité"} rows={[
                [en ? "First name" : "Prénom", detail.first_name],
                [en ? "Last name" : "Nom", detail.last_name],
                [en ? "Language" : "Langue", detail.language],
                [en ? "Birth date" : "Date de naissance", detail.birth_date],
                [en ? "Status" : "Statut", detail.status],
                [en ? "Source" : "Source", detail.source],
              ]} />

              <Section title={en ? "Contact" : "Coordonnées"} rows={[
                [en ? "Phone" : "Téléphone", detail.phone],
                [en ? "Mobile" : "Cellulaire", detail.cell_phone],
                [en ? "Work" : "Bureau", detail.work_phone],
                [en ? "Home" : "Domicile", detail.home_phone],
                [en ? "Email" : "Courriel", detail.email],
                ...(Array.isArray(detail.emails) ? detail.emails.slice(1).map((e: string, i: number) => [`${en ? "Email" : "Courriel"} ${i + 2}`, e] as [string, any]) : []),
              ]} />

              {Array.isArray(detail.telephones) && detail.telephones.length > 1 && (
                <Section title={en ? "All numbers" : "Tous les numéros"} rows={detail.telephones.map((t: any, i: number) => [
                  String(t?.telephone_type ?? `#${i + 1}`),
                  t?.telephone_number ?? "",
                ] as [string, any])} />
              )}

              <Section title={en ? "Address" : "Adresse"} rows={[
                [en ? "Address" : "Adresse", detail.address_line],
                [en ? "City" : "Ville", detail.city],
                [en ? "Province" : "Province", detail.province],
                [en ? "Postal code" : "Code postal", detail.postal_code],
                [en ? "Country" : "Pays", detail.country],
              ]} />

              <Section title={en ? "Professional" : "Professionnel"} rows={[
                [en ? "Company" : "Entreprise", detail.company],
                [en ? "Job title" : "Titre", detail.job_title],
                [en ? "Broker ID" : "ID courtier", detail.broker_id],
                ["Maestro ID", detail.maestro_client_id ?? detail.id],
                [en ? "Created" : "Créé le", detail.created_at],
                [en ? "Updated" : "Mis à jour", detail.updated_at],
              ]} />

              {detail.notes && (
                <Section title="Notes" rows={[["", detail.notes]]} />
              )}

              <details className="rounded-lg" style={{ border: "1px solid var(--pp-border, #e2e8f0)" }}>
                <summary className="px-3 py-2 cursor-pointer font-semibold text-[12px]">
                  {en ? "All Maestro fields" : "Tous les champs Maestro"}
                </summary>
                <div className="px-3 pb-3 space-y-1">
                  {Object.entries(detail)
                    .filter(([, v]) => v !== null && v !== undefined && v !== "" && !(Array.isArray(v) && v.length === 0))
                    .sort(([a], [b]) => a.localeCompare(b))
                    .map(([k, v]) => (
                      <div key={k} className="flex justify-between gap-3 items-start">
                        <span className="text-[11px]" style={{ color: "var(--pp-text-muted)" }}>{k}</span>
                        <span className="font-medium text-right break-all text-[11px] max-w-[60%]">
                          {typeof v === "object" ? JSON.stringify(v) : String(v)}
                        </span>
                      </div>
                    ))}
                </div>
              </details>
            </div>

          </div>
        </div>
      )}
    </PAPage>
  );
}
