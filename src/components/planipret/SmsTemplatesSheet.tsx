import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { X, Plus, Trash2, Edit3, Zap } from "lucide-react";
import { toast } from "sonner";

type Tpl = { id: string; user_id: string | null; title: string; body: string; is_shared: boolean; use_count: number };

const PRIMARY = "var(--pp-brand-accent-2)";

export default function SmsTemplatesSheet({ open, onClose, onPick, userId, isAdmin }: {
  open: boolean; onClose: () => void; onPick: (body: string, id: string) => void; userId: string; isAdmin?: boolean;
}) {
  const [tpls, setTpls] = useState<Tpl[]>([]);
  const [editing, setEditing] = useState<Tpl | null>(null);
  const [creating, setCreating] = useState<{ title: string; body: string; shared: boolean } | null>(null);

  const load = async () => {
    const { data } = await supabase.from("planipret_sms_templates").select("*").order("is_shared").order("title");
    setTpls((data ?? []) as Tpl[]);
  };
  useEffect(() => { if (open) load(); }, [open]);

  if (!open) return null;

  const own = tpls.filter((t) => t.user_id === userId);
  const shared = tpls.filter((t) => t.is_shared);

  const save = async () => {
    if (!creating) return;
    if (!creating.title.trim() || !creating.body.trim()) { toast.error("Titre et message requis"); return; }
    const { error } = await supabase.from("planipret_sms_templates").insert({
      title: creating.title, body: creating.body,
      is_shared: creating.shared && !!isAdmin,
      user_id: creating.shared && isAdmin ? null : userId,
      created_by: userId,
    });
    if (error) { toast.error(error.message); return; }
    toast.success("Template créé ✅");
    setCreating(null); load();
  };

  const remove = async (t: Tpl) => {
    if (!confirm(`Supprimer "${t.title}" ?`)) return;
    const { error } = await supabase.from("planipret_sms_templates").delete().eq("id", t.id);
    if (error) { toast.error(error.message); return; }
    load();
  };

  const pick = async (t: Tpl) => {
    onPick(t.body, t.id);
    supabase.from("planipret_sms_templates").update({ use_count: t.use_count + 1 }).eq("id", t.id);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/40" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full bg-white rounded-t-3xl max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
          <div className="flex items-center gap-2 font-semibold" style={{ color: PRIMARY }}>
            <Zap className="w-4 h-4" /> Templates SMS
          </div>
          <button onClick={onClose}><X className="w-5 h-5 text-slate-500" /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-3">
          {own.length > 0 && (
            <div>
              <div className="text-xs font-semibold text-slate-500 mb-1.5 px-1">Mes templates</div>
              {own.map((t) => <TplRow key={t.id} t={t} onPick={() => pick(t)} onDelete={() => remove(t)} />)}
            </div>
          )}
          <div>
            <div className="text-xs font-semibold text-slate-500 mb-1.5 px-1">Templates partagés</div>
            {shared.map((t) => <TplRow key={t.id} t={t} onPick={() => pick(t)} onDelete={isAdmin ? () => remove(t) : undefined} />)}
          </div>
        </div>

        {creating ? (
          <div className="border-t border-slate-100 p-3 space-y-2">
            <input value={creating.title} onChange={(e) => setCreating({ ...creating, title: e.target.value })}
              placeholder="Titre" className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm" />
            <textarea value={creating.body} onChange={(e) => setCreating({ ...creating, body: e.target.value })}
              placeholder="Message... (variables: {nom}, {date}, {heure}, {extension})"
              rows={3} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm" />
            {isAdmin && (
              <label className="flex items-center gap-2 text-xs text-slate-600">
                <input type="checkbox" checked={creating.shared} onChange={(e) => setCreating({ ...creating, shared: e.target.checked })} />
                Partagé avec tous les courtiers
              </label>
            )}
            <div className="flex gap-2">
              <button onClick={() => setCreating(null)} className="flex-1 py-2 rounded-lg text-sm border border-slate-200">Annuler</button>
              <button onClick={save} className="flex-1 py-2 rounded-lg text-sm font-semibold text-white" style={{ background: PRIMARY }}>Sauvegarder</button>
            </div>
          </div>
        ) : (
          <button onClick={() => setCreating({ title: "", body: "", shared: false })}
            className="border-t border-slate-100 py-3 text-sm font-medium flex items-center justify-center gap-2"
            style={{ color: PRIMARY }}>
            <Plus className="w-4 h-4" /> Créer un template
          </button>
        )}
      </div>
    </div>
  );
}

function TplRow({ t, onPick, onDelete }: { t: Tpl; onPick: () => void; onDelete?: () => void }) {
  return (
    <div className="bg-slate-50 rounded-lg p-2.5 flex items-start gap-2">
      <button onClick={onPick} className="flex-1 text-left min-w-0">
        <div className="font-semibold text-sm text-slate-800 truncate">{t.title}</div>
        <div className="text-xs text-slate-500 truncate">{t.body}</div>
      </button>
      {onDelete && <button onClick={onDelete} className="p-1.5 text-slate-400 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>}
    </div>
  );
}
