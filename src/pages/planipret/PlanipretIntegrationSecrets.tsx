import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AVA_OWNER_USER_ID } from "@/lib/avaOwner";
import { PlanipretLangSwitch } from "@/components/planipret/PlanipretLangSwitch";

type Item = {
  provider: "microsoft" | "maestro";
  updated_at: string | null;
  config_masked: Record<string, string>;
  has_keys: string[];
};

const MS_FIELDS = [
  { key: "client_id", label: "Client ID" },
  { key: "client_secret", label: "Client Secret", secret: true },
  { key: "tenant_id", label: "Tenant ID" },
  { key: "redirect_uri", label: "Redirect URI" },
];
const MAESTRO_FIELDS = [
  { key: "api_url", label: "API URL" },
  { key: "api_key", label: "API Key", secret: true },
];

export default function PlanipretIntegrationSecrets() {
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<Record<string, Item>>({});
  const [form, setForm] = useState<Record<string, Record<string, string>>>({
    microsoft: {},
    maestro: {},
  });
  const [savingFor, setSavingFor] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const reload = async () => {
    setLoading(true);
    const { data, error } = await supabase.functions.invoke("pp-integration-secrets");
    if (error) {
      setMsg(error.message);
    } else {
      const map: Record<string, Item> = {};
      for (const it of (data as any)?.items ?? []) map[it.provider] = it;
      setItems(map);
    }
    setLoading(false);
  };

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || user.id !== AVA_OWNER_USER_ID) { setAuthorized(false); return; }
      setAuthorized(true);
      reload();
    })();
  }, []);

  if (authorized === false) {
    return <div className="p-8 text-center text-slate-600">Accès refusé.</div>;
  }
  if (authorized === null) return null;

  const save = async (provider: "microsoft" | "maestro") => {
    setSavingFor(provider);
    setMsg(null);
    const { error } = await supabase.functions.invoke("pp-integration-secrets", {
      body: { provider, config: form[provider] ?? {} },
    });
    setSavingFor(null);
    if (error) setMsg(error.message);
    else {
      setMsg("Sauvegardé ✓");
      setForm((f) => ({ ...f, [provider]: {} }));
      reload();
    }
  };

  const renderCard = (
    provider: "microsoft" | "maestro",
    title: string,
    fields: { key: string; label: string; secret?: boolean }[]
  ) => {
    const stored = items[provider];
    return (
      <div className="bg-white rounded-xl shadow p-5 border-t-4" style={{ borderTopColor: "#1F4E79" }}>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-lg" style={{ color: "#1F4E79" }}>{title}</h2>
          {stored?.updated_at && (
            <span className="text-xs text-slate-400">
              Maj : {new Date(stored.updated_at).toLocaleString()}
            </span>
          )}
        </div>
        <div className="space-y-3">
          {fields.map((f) => (
            <div key={f.key}>
              <label className="block text-xs font-medium text-slate-600 mb-1">{f.label}</label>
              <input
                type={f.secret ? "password" : "text"}
                placeholder={stored?.config_masked?.[f.key] ?? "—"}
                value={form[provider]?.[f.key] ?? ""}
                onChange={(e) =>
                  setForm((s) => ({
                    ...s,
                    [provider]: { ...(s[provider] ?? {}), [f.key]: e.target.value },
                  }))
                }
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono"
                autoComplete="off"
              />
              {stored?.has_keys?.includes(f.key) && (
                <div className="text-[10px] text-emerald-600 mt-0.5">✓ valeur stockée</div>
              )}
            </div>
          ))}
        </div>
        <button
          onClick={() => save(provider)}
          disabled={savingFor === provider}
          className="mt-4 px-4 py-2 rounded-lg text-white text-sm font-medium disabled:opacity-60"
          style={{ background: "#2E86C1" }}
        >
          {savingFor === provider ? "Sauvegarde…" : "Sauvegarder"}
        </button>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="px-6 py-4 text-white" style={{ background: "#1F4E79" }}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-xs opacity-80">AVA · Planiprêt</div>
            <h1 className="text-xl font-semibold">Intégrations sécurisées</h1>
            <p className="text-xs opacity-80 mt-1">
              Les clés sont stockées côté serveur, masquées à l'affichage, et accessibles uniquement
              par votre compte propriétaire AVA. Elles alimentent l'application mobile via les
              fonctions Edge.
            </p>
          </div>
          <PlanipretLangSwitch />
        </div>
      </header>
      <main className="p-6 max-w-3xl mx-auto space-y-5">
        {msg && (
          <div className="text-sm bg-slate-100 border border-slate-200 rounded-lg px-3 py-2">
            {msg}
          </div>
        )}
        {loading ? (
          <div className="text-slate-500">Chargement…</div>
        ) : (
          <>
            {renderCard("microsoft", "Microsoft 365", MS_FIELDS)}
            {renderCard("maestro", "Maestro", MAESTRO_FIELDS)}
          </>
        )}
      </main>
    </div>
  );
}
