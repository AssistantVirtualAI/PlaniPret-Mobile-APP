import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Plus, Trash2, Edit3, Save, X, Zap } from "lucide-react";
import { toast } from "sonner";
import { PPEmptyState, PPSkeleton } from "@/components/planipret/admin/PPPrimitives";

type Tpl = { id: string; user_id: string | null; title: string; body: string; is_shared: boolean; use_count: number; created_at: string };

const VARIABLES = ["{nom}", "{date}", "{heure}", "{extension}"];

export default function PATemplates() {
  const [tpls, setTpls] = useState<Tpl[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Tpl | null>(null);
  const [creating, setCreating] = useState<{ title: string; body: string } | null>(null);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from("planipret_sms_templates").select("*").eq("is_shared", true).order("title");
    setTpls((data ?? []) as Tpl[]);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const save = async () => {
    if (!creating || !creating.title.trim()) return toast.error("Titre requis");
    const { error } = await supabase.from("planipret_sms_templates").insert({
      title: creating.title, body: creating.body, is_shared: true, user_id: null,
    });
    if (error) return toast.error(error.message);
    toast.success("Template créé"); setCreating(null); load();
  };

  const update = async () => {
    if (!editing) return;
    const { error } = await supabase.from("planipret_sms_templates").update({ title: editing.title, body: editing.body }).eq("id", editing.id);
    if (error) return toast.error(error.message);
    toast.success("Mis à jour"); setEditing(null); load();
  };

  const remove = async (id: string) => {
    if (!confirm("Supprimer ce template ?")) return;
    const { error } = await supabase.from("planipret_sms_templates").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Supprimé"); load();
  };

  const insertVar = (v: string, target: "create" | "edit") => {
    if (target === "create" && creating) setCreating({ ...creating, body: creating.body + " " + v });
    if (target === "edit" && editing) setEditing({ ...editing, body: editing.body + " " + v });
  };

  const inputStyle: React.CSSProperties = {
    background: "var(--pp-bg-elevated)", color: "var(--pp-text-primary)",
    border: "1px solid var(--pp-bg-border)",
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 style={{ fontFamily: "Inter,sans-serif", fontWeight: 700, fontSize: 18, color: "var(--pp-text-primary)" }}>
            Templates SMS partagés
          </h2>
          <p style={{ fontSize: 12, color: "var(--pp-text-muted)" }}>Réutilisés par tous les courtiers</p>
        </div>
        {!creating && (
          <button onClick={() => setCreating({ title: "", body: "" })}
            className="pp-btn-primary flex items-center gap-2 text-sm">
            <Plus className="w-4 h-4" /> Nouveau template
          </button>
        )}
      </div>

      {creating && (
        <div className="pp-card space-y-3" style={{ padding: 16 }}>
          <input placeholder="Titre" value={creating.title}
            onChange={(e) => setCreating({ ...creating, title: e.target.value })}
            className="w-full px-3 py-2 rounded-lg text-sm" style={inputStyle} />
          <textarea placeholder="Corps du message…" rows={4} value={creating.body}
            onChange={(e) => setCreating({ ...creating, body: e.target.value })}
            className="w-full px-3 py-2 rounded-lg text-sm" style={inputStyle} />
          <div className="flex flex-wrap gap-1.5">
            {VARIABLES.map((v) => (
              <button key={v} onClick={() => insertVar(v, "create")}
                className="px-2 py-1 rounded-md text-[11px] font-mono"
                style={{ background: "var(--pp-bg-deep)", border: "1px solid var(--pp-bg-border)", color: "var(--pp-brand-accent)" }}>
                {v}
              </button>
            ))}
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setCreating(null)} className="pp-btn-secondary text-sm">Annuler</button>
            <button onClick={save} className="pp-btn-primary text-sm">Créer</button>
          </div>
        </div>
      )}

      <div className="pp-card overflow-hidden">
        {loading ? (
          <div className="p-4 space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="space-y-2">
                <PPSkeleton style={{ height: 14, width: "30%" }} />
                <PPSkeleton style={{ height: 12, width: "80%" }} />
              </div>
            ))}
          </div>
        ) : tpls.length === 0 ? (
          <PPEmptyState icon={<Zap className="w-6 h-6" />} title="Aucun template partagé"
            description="Créez un premier modèle réutilisable par toute l'équipe." />
        ) : (
          <div style={{ borderTop: "1px solid var(--pp-bg-border)" }}>
            {tpls.map((t) => (
              <div key={t.id} className="p-4" style={{ borderBottom: "1px solid var(--pp-bg-border)" }}>
                {editing?.id === t.id ? (
                  <div className="space-y-2">
                    <input value={editing.title}
                      onChange={(e) => setEditing({ ...editing, title: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg text-sm" style={inputStyle} />
                    <textarea rows={3} value={editing.body}
                      onChange={(e) => setEditing({ ...editing, body: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg text-sm" style={inputStyle} />
                    <div className="flex flex-wrap gap-1.5">
                      {VARIABLES.map((v) => (
                        <button key={v} onClick={() => insertVar(v, "edit")}
                          className="px-2 py-1 rounded-md text-[11px] font-mono"
                          style={{ background: "var(--pp-bg-deep)", border: "1px solid var(--pp-bg-border)", color: "var(--pp-brand-accent)" }}>
                          {v}
                        </button>
                      ))}
                    </div>
                    <div className="flex gap-2 justify-end">
                      <button onClick={() => setEditing(null)} className="pp-btn-secondary text-sm flex items-center gap-1">
                        <X className="w-3 h-3" /> Annuler
                      </button>
                      <button onClick={update} className="pp-btn-primary text-sm flex items-center gap-1">
                        <Save className="w-3 h-3" /> Sauver
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div style={{ fontSize: 13, fontWeight: 600, color: "var(--pp-text-primary)" }}>{t.title}</div>
                      <div className="mt-1" style={{ fontSize: 12, color: "var(--pp-text-secondary)" }}>{t.body}</div>
                      <div className="mt-1.5" style={{ fontSize: 10, color: "var(--pp-text-muted)" }}>
                        Utilisations : {t.use_count}
                      </div>
                    </div>
                    <button onClick={() => setEditing(t)} className="p-1.5 rounded transition"
                      style={{ color: "var(--pp-text-muted)" }}
                      onMouseEnter={(e) => { e.currentTarget.style.color = "var(--pp-brand-accent)"; e.currentTarget.style.background = "var(--pp-bg-elevated)"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.color = "var(--pp-text-muted)"; e.currentTarget.style.background = "transparent"; }}>
                      <Edit3 className="w-4 h-4" />
                    </button>
                    <button onClick={() => remove(t.id)} className="p-1.5 rounded transition"
                      style={{ color: "var(--pp-text-muted)" }}
                      onMouseEnter={(e) => { e.currentTarget.style.color = "var(--pp-danger)"; e.currentTarget.style.background = "var(--pp-bg-elevated)"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.color = "var(--pp-text-muted)"; e.currentTarget.style.background = "transparent"; }}>
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
