import { useEffect, useState } from "react";
import { Loader2, Save, Wand2, RefreshCw } from "lucide-react";
import { toast } from "sonner";

interface Props {
  isFr: boolean;
  call: (payload: any) => Promise<any>;
  /** Optional analysis result coming from the import wizard. */
  analysis?: any;
}

export default function CommissionMappingPanel({ isFr, call, analysis }: Props) {
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [fields, setFields] = useState<string[]>([]);
  const [labels, setLabels] = useState<Record<string, string>>({});
  const [knownTypes, setKnownTypes] = useState<string[]>([]);
  const [columns, setColumns] = useState<Record<string, string>>({});
  const [types, setTypes] = useState<Record<string, string>>({});

  const load = async () => {
    setLoading(true);
    try {
      const res = await call({ action: "mapping.get" });
      setFields(res.fields ?? []);
      setLabels(res.fieldLabels ?? {});
      setKnownTypes(res.knownTypes ?? []);
      setColumns(res.columns ?? {});
      setTypes(res.commissionTypes ?? {});
    } catch (e: any) {
      toast.error(e?.message ?? (isFr ? "Erreur" : "Error"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); /* eslint-disable-next-line */ }, []);

  useEffect(() => {
    if (!analysis) return;
    setColumns((c) => ({ ...analysis.columns, ...c }));
    setTypes((t) => ({ ...analysis.commissionTypes, ...t }));
    if (analysis.fields) setFields(analysis.fields);
    if (analysis.knownTypes) setKnownTypes(analysis.knownTypes);
  }, [analysis]);

  const save = async () => {
    setBusy(true);
    try {
      const items = [
        ...Object.entries(columns).filter(([, v]) => v).map(([k, v]) => ({ kind: "column", sourceKey: k, sourceLabel: k, targetValue: v })),
        ...Object.entries(types).filter(([, v]) => v).map(([k, v]) => ({ kind: "commission_type", sourceKey: k, sourceLabel: k, targetValue: v })),
      ];
      if (!items.length) { toast.error(isFr ? "Rien à sauvegarder" : "Nothing to save"); return; }
      const res = await call({ action: "mapping.upsert", items });
      toast.success(isFr ? `${res.saved} correspondances enregistrées` : `${res.saved} mappings saved`);
    } catch (e: any) {
      toast.error(e?.message ?? (isFr ? "Erreur" : "Error"));
    } finally {
      setBusy(false);
    }
  };

  const remap = async () => {
    setBusy(true);
    try {
      const res = await call({ action: "remap" });
      toast.success(isFr
        ? `${res.updated} lignes recalculées (${res.unmapped} non mappées)`
        : `${res.updated} rows remapped (${res.unmapped} unmapped)`);
    } catch (e: any) {
      toast.error(e?.message ?? (isFr ? "Erreur" : "Error"));
    } finally {
      setBusy(false);
    }
  };

  const selStyle = {
    background: "var(--pp-bg-elevated)",
    border: "1px solid var(--pp-bg-border)",
    color: "var(--pp-text-primary)",
    fontSize: 12.5,
  } as const;

  return (
    <div className="pp-card mt-3" style={{ padding: 16 }}>
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div style={{ fontSize: 13, fontWeight: 700 }}>
          {isFr ? "Mapping persistant (colonnes A:S + types de commission)" : "Persistent mapping (columns A:S + commission types)"}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} className="px-3 py-1.5 rounded-lg flex items-center gap-1.5" style={selStyle}>
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            {isFr ? "Recharger" : "Reload"}
          </button>
          <button onClick={save} disabled={busy} className="px-3 py-1.5 rounded-lg flex items-center gap-1.5"
            style={{ background: "var(--pp-brand-accent-2)", color: "#fff", fontSize: 12.5, fontWeight: 700, opacity: busy ? 0.6 : 1 }}>
            <Save className="w-3.5 h-3.5" />{isFr ? "Enregistrer" : "Save"}
          </button>
          <button onClick={remap} disabled={busy} className="px-3 py-1.5 rounded-lg flex items-center gap-1.5"
            style={{ background: "var(--pp-success,#16a34a)", color: "#fff", fontSize: 12.5, fontWeight: 700, opacity: busy ? 0.6 : 1 }}>
            <Wand2 className="w-3.5 h-3.5" />{isFr ? "Rejouer sur les lignes existantes" : "Re-apply to existing rows"}
          </button>
        </div>
      </div>

      <div className="mt-1" style={{ fontSize: 11.5, color: "var(--pp-text-muted)" }}>
        {isFr
          ? "Corrigez ici les lignes problématiques puis relancez le mapping sans réimporter le classeur."
          : "Fix problem rows here, then re-apply the mapping without re-importing the workbook."}
      </div>

      <div className="mt-3 grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))" }}>
        <div>
          <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 6 }}>{isFr ? "Colonnes" : "Columns"}</div>
          <div className="flex flex-col gap-1.5" style={{ maxHeight: 320, overflowY: "auto" }}>
            {Object.keys(columns).length === 0 && (
              <div style={{ fontSize: 12, color: "var(--pp-text-muted)" }}>{isFr ? "Aucune correspondance enregistrée." : "No saved mapping."}</div>
            )}
            {Object.entries(columns).map(([header, field]) => (
              <div key={header} className="flex items-center gap-2">
                <span style={{ fontSize: 12, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{header}</span>
                <select value={field ?? ""} onChange={(e) => setColumns({ ...columns, [header]: e.target.value })}
                  className="px-2 py-1 rounded-md" style={selStyle}>
                  <option value="__ignore__">{isFr ? "Ignorer" : "Ignore"}</option>
                  {fields.map((f) => <option key={f} value={f}>{labels[f] ?? f}</option>)}
                </select>
              </div>
            ))}
          </div>
        </div>

        <div>
          <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 6 }}>{isFr ? "Types de commission" : "Commission types"}</div>
          <div className="flex flex-col gap-1.5" style={{ maxHeight: 320, overflowY: "auto" }}>
            {Object.keys(types).length === 0 && (
              <div style={{ fontSize: 12, color: "var(--pp-text-muted)" }}>{isFr ? "Aucun type personnalisé." : "No custom type."}</div>
            )}
            {Object.entries(types).map(([raw, target]) => (
              <div key={raw} className="flex items-center gap-2">
                <span style={{ fontSize: 12, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{raw}</span>
                <select value={target ?? ""} onChange={(e) => setTypes({ ...types, [raw]: e.target.value })}
                  className="px-2 py-1 rounded-md" style={selStyle}>
                  {[...knownTypes, "other"].map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
