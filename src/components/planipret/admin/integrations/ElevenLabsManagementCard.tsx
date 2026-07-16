import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useElevenLabsSetupProgress } from "@/hooks/useElevenLabsSetupProgress";
import { Mic, Rocket, RefreshCw, Wrench, Volume2, Brain, FileText, FlaskConical, CheckCircle2, AlertCircle, Loader2, Copy, ChevronDown, ChevronUp, Play } from "lucide-react";

type Voice = { voice_id: string; name: string; preview_url?: string; labels?: any };
type ToolDef = { name: string; description: string };

function call(action: string, payload?: any) {
  return supabase.functions.invoke("elevenlabs-manage-agent", { body: { action, payload } });
}

export default function ElevenLabsManagementCard({ userId }: { userId: string | null }) {
  const [agent, setAgent] = useState<any>(null);
  const [agentId, setAgentId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [expected, setExpected] = useState<ToolDef[]>([]);
  const [voices, setVoices] = useState<Voice[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [open, setOpen] = useState<Record<string, boolean>>({ agent: true });
  const { events, reset } = useElevenLabsSetupProgress(userId);

  const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL || "").replace(/\/$/, "");
  const webhookUrl = `${supabaseUrl}/functions/v1/ava-tool-executor`;

  const refresh = async () => {
    setLoading(true);
    const [exp, ag] = await Promise.all([call("list_expected_tools"), call("get_agent")]);
    if ((exp.data as any)?.success) setExpected((exp.data as any).tools);
    if ((ag.data as any)?.success) {
      setAgent((ag.data as any).agent);
      setAgentId((ag.data as any).agent_id);
      call("get_agent_stats").then((r) => { if ((r.data as any)?.success) setStats((r.data as any).stats); });
    } else {
      setAgent(null);
    }
    setLoading(false);
  };

  useEffect(() => { refresh(); /* eslint-disable-next-line */ }, []);

  const run = async (label: string, fn: () => Promise<any>) => {
    setBusy(label); setMsg(null);
    try {
      const res = await fn();
      const data = (res?.data ?? res) as any;
      if (data?.success === false) setMsg({ ok: false, text: data.error || "Erreur" });
      else setMsg({ ok: true, text: data?.message || "OK" });
      return data;
    } catch (e: any) {
      setMsg({ ok: false, text: e?.message ?? String(e) });
    } finally { setBusy(null); }
  };

  const oneClickSetup = async () => {
    reset();
    setBusy("setup");
    setMsg(null);
    try {
      const create = await call("create_agent");
      const cd = (create.data as any);
      if (!cd?.success) { setMsg({ ok: false, text: cd?.error || "Échec création agent" }); return; }
      await call("sync_all_tools");
      setMsg({ ok: true, text: `Agent créé (${cd.agent_id}) — 29 outils synchronisés` });
      await refresh();
    } finally { setBusy(null); }
  };

  const syncTools = () => run("sync", async () => { const r = await call("sync_all_tools"); await refresh(); return r; });
  const loadVoices = async () => { const r = await call("get_all_voices"); if ((r.data as any)?.success) setVoices((r.data as any).voices); };
  const testApi = () => run("test", () => call("test_connection"));

  const currentTools: any[] = agent?.conversation_config?.agent?.prompt?.tools ?? [];
  const currentToolNames = new Set(currentTools.map((t: any) => t.name));
  const configuredCount = expected.filter((t) => currentToolNames.has(t.name)).length;

  const copyText = (txt: string) => { navigator.clipboard.writeText(txt); setMsg({ ok: true, text: "Copié" }); };

  const Panel = ({ id, title, children, defaultOpen = false }: any) => {
    const isOpen = open[id] ?? defaultOpen;
    return (
      <div className="border border-slate-200 rounded-lg overflow-hidden">
        <button onClick={() => setOpen((s) => ({ ...s, [id]: !isOpen }))} className="w-full px-4 py-3 flex items-center justify-between bg-slate-50 hover:bg-slate-100 text-sm font-semibold text-slate-700">
          <span>{title}</span>
          {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
        {isOpen && <div className="p-4">{children}</div>}
      </div>
    );
  };

  return (
    <div className="bg-white rounded-xl shadow border-t-4 overflow-hidden" style={{ borderTopColor: "#6C3CE1" }}>
      <div className="p-5 space-y-4">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-lg" style={{ background: "#6C3CE115", color: "#6C3CE1" }}>
            <Mic className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-slate-800">ElevenLabs — Centre de gestion AVA</h3>
              <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${agentId ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
                {agentId ? "Connecté" : "Configuration requise"}
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">Gestion complète de l'agent vocal via l'API ElevenLabs</p>
          </div>
        </div>

        {msg && (
          <div className={`text-xs rounded-lg px-3 py-2 border ${msg.ok ? "bg-emerald-50 border-emerald-200 text-emerald-700" : "bg-red-50 border-red-200 text-red-700"}`}>
            {msg.text}
          </div>
        )}

        {/* One-click setup banner */}
        {!loading && !agentId && (
          <div className="rounded-2xl p-6 border" style={{ background: "linear-gradient(135deg, rgba(108,60,225,0.15), rgba(46,155,220,0.15))", borderColor: "rgba(108,60,225,0.4)" }}>
            <h4 className="text-lg font-bold text-slate-800">⚡ Configuration rapide ElevenLabs</h4>
            <p className="text-sm text-slate-600 mt-1 mb-1">Configurez AVA en 1 clic — création de l'agent + 29 outils + voix + connexion Supabase.</p>
            <p className="text-[11px] text-slate-500 mb-4">ℹ️ Utilise uniquement la clé <code>ELEVENLABS_API_KEY</code>. La clé Claude (<code>ANTHROPIC_API_KEY</code>) n'est pas requise ici — ElevenLabs choisit le modèle LLM côté serveur.</p>
            <button onClick={oneClickSetup} disabled={busy === "setup"} className="w-full px-4 py-3 rounded-xl text-white font-semibold disabled:opacity-60" style={{ background: "linear-gradient(135deg,#6C3CE1,#2E9BDC)" }}>
              {busy === "setup" ? <span className="flex items-center justify-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Configuration en cours…</span> : <span className="flex items-center justify-center gap-2"><Rocket className="w-4 h-4" /> Configurer AVA automatiquement</span>}
            </button>
            {events.length > 0 && (
              <div className="mt-3 text-xs text-slate-700 max-h-32 overflow-auto space-y-0.5">
                {events.map((e, i) => (
                  <div key={i}>{e.type === "tool_added" ? `✓ ${e.tool_name} (${e.count}/${e.total})` : e.type === "setup_complete" ? `✅ Terminé — agent ${e.agent_id}` : `❌ ${e.step}: ${e.error}`}</div>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="flex items-center gap-2">
          <button onClick={testApi} disabled={busy === "test"} className="px-3 py-1.5 rounded-lg text-xs font-medium border border-slate-300 text-slate-700 hover:bg-slate-50">Tester la clé API</button>
          <button onClick={refresh} className="px-3 py-1.5 rounded-lg text-xs font-medium border border-slate-300 text-slate-700 hover:bg-slate-50 flex items-center gap-1"><RefreshCw className="w-3 h-3" /> Recharger</button>
        </div>

        {/* Panel: Agent AVA */}
        {agentId && (
          <Panel id="agent" title="🤖 Agent AVA" defaultOpen>
            <div className="rounded-xl p-4 border" style={{ background: "linear-gradient(135deg, rgba(108,60,225,0.08), rgba(46,155,220,0.08))", borderColor: "rgba(108,60,225,0.3)" }}>
              <div className="flex items-center gap-3 mb-3">
                <div className="w-12 h-12 rounded-full flex items-center justify-center text-white" style={{ background: "linear-gradient(135deg,#6C3CE1,#2E9BDC)" }}><Mic className="w-6 h-6" /></div>
                <div className="flex-1">
                  <div className="font-bold text-slate-800">{agent?.name ?? "AVA — Planiprêt AI Portal"}</div>
                  <div className="flex items-center gap-2 text-xs text-slate-500 font-mono">
                    <span>{agentId}</span>
                    <button onClick={() => copyText(agentId)} className="hover:text-slate-700"><Copy className="w-3 h-3" /></button>
                  </div>
                </div>
              </div>
              {stats && (
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div className="bg-white/60 rounded px-2 py-1.5"><div className="text-slate-500">Sessions</div><div className="font-bold text-slate-800">{stats.total_conversations}</div></div>
                  <div className="bg-white/60 rounded px-2 py-1.5"><div className="text-slate-500">Durée moy.</div><div className="font-bold text-slate-800">{stats.avg_duration_seconds}s</div></div>
                  <div className="bg-white/60 rounded px-2 py-1.5"><div className="text-slate-500">Erreurs</div><div className="font-bold text-slate-800">{stats.error_rate}%</div></div>
                </div>
              )}
            </div>
          </Panel>
        )}

        {/* Panel: Tools */}
        {agentId && (
          <Panel id="tools" title={`🔧 Outils (${configuredCount}/${expected.length})`}>
            <div className="space-y-2">
              <button onClick={syncTools} disabled={busy === "sync"} className="w-full px-4 py-2.5 rounded-lg text-white text-sm font-medium disabled:opacity-60 flex items-center justify-center gap-2" style={{ background: "linear-gradient(135deg,#2E9BDC,#6C3CE1)" }}>
                {busy === "sync" ? <><Loader2 className="w-4 h-4 animate-spin" /> Synchronisation…</> : <><Wrench className="w-4 h-4" /> Synchroniser tous les outils</>}
              </button>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-2 max-h-64 overflow-auto">
                {expected.map((t) => {
                  const ok = currentToolNames.has(t.name);
                  return (
                    <div key={t.name} className="flex items-center gap-2 px-2 py-1 text-xs">
                      <span className={`w-2 h-2 rounded-full ${ok ? "bg-emerald-500" : "bg-red-400"}`} />
                      <span className="font-mono text-slate-700">{t.name}</span>
                      <span className="text-slate-400 truncate flex-1">{t.description}</span>
                    </div>
                  );
                })}
              </div>
              <div className="text-xs text-slate-500">
                Webhook : <code className="bg-slate-100 px-1 rounded">{webhookUrl}</code>
                <button onClick={() => copyText(webhookUrl)} className="ml-1 text-slate-500 hover:text-slate-700"><Copy className="w-3 h-3 inline" /></button>
              </div>
            </div>
          </Panel>
        )}

        {/* Panel: Voice */}
        {agentId && (
          <Panel id="voice" title="🎙️ Voix d'AVA">
            <div className="space-y-3">
              <div className="text-xs text-slate-600">Voix actuelle: <span className="font-mono">{agent?.conversation_config?.tts?.voice_id ?? "—"}</span></div>
              <button onClick={loadVoices} className="px-3 py-1.5 rounded-lg text-xs border border-slate-300 hover:bg-slate-50">Charger les voix disponibles</button>
              {voices.length > 0 && (
                <div className="grid grid-cols-2 gap-2 max-h-64 overflow-auto">
                  {voices.slice(0, 24).map((v) => (
                    <div key={v.voice_id} className="border border-slate-200 rounded p-2 text-xs">
                      <div className="font-semibold text-slate-800">{v.name}</div>
                      <div className="text-slate-500 truncate">{v.labels?.language ?? ""} · {v.labels?.gender ?? ""}</div>
                      <div className="flex items-center gap-1 mt-1">
                        {v.preview_url && <button onClick={() => new Audio(v.preview_url).play()} className="text-slate-600 hover:text-slate-900"><Play className="w-3 h-3" /></button>}
                        <button onClick={() => run("voice", () => call("update_voice", { voice_id: v.voice_id }))} className="ml-auto text-violet-700 hover:underline">Appliquer</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Panel>
        )}

        {/* Panel: LLM */}
        {agentId && (
          <Panel id="llm" title="🧠 Modèle IA">
            <LlmEditor onSave={(p) => run("llm", () => call("update_llm", p))} current={agent?.conversation_config?.agent?.prompt} busy={busy === "llm"} />
          </Panel>
        )}

        {/* Panel: System Prompt */}
        {agentId && (
          <Panel id="prompt" title="📝 System Prompt">
            <PromptEditor current={agent?.conversation_config?.agent?.prompt?.prompt ?? ""} onSave={(p) => run("prompt", () => call("update_system_prompt", { system_prompt: p }))} busy={busy === "prompt"} />
          </Panel>
        )}

        {/* Panel: Test */}
        {agentId && (
          <Panel id="test" title="🧪 Test & Validation">
            <PipelineTest webhookUrl={webhookUrl} agentId={agentId} expectedCount={expected.length} currentCount={configuredCount} />
          </Panel>
        )}
        {/* Panel: Webhooks */}
        {agentId && (
          <Panel id="webhooks" title="🌐 Webhooks connectés">
            <WebhooksPanel toolExecutorUrl={webhookUrl} />
          </Panel>
        )}


        {/* Panel: Per-broker gating reminder */}
        <Panel id="gating" title="👥 Activation par courtier">
          <p className="text-xs text-slate-600">
            AVA n'est pas active pour tous les courtiers par défaut. Activez/désactivez l'agent vocal pour chaque courtier dans
            <span className="font-semibold"> Gestion Utilisateurs → toggle « Agent IA »</span>.
            Les courtiers désactivés reçoivent une erreur 403 si une session AVA est tentée.
          </p>
        </Panel>
      </div>
    </div>
  );
}

function LlmEditor({ current, onSave, busy }: any) {
  const [llm, setLlm] = useState(current?.llm ?? "claude-3-5-sonnet");
  const [temp, setTemp] = useState(current?.temperature ?? 0.7);
  const [maxT, setMaxT] = useState(current?.max_tokens ?? 500);
  const options = ["claude-3-5-sonnet", "claude-3-haiku", "gpt-4o", "gpt-4o-mini"];
  return (
    <div className="space-y-2 text-xs">
      <div className="grid grid-cols-2 gap-2">
        {options.map((o) => (
          <label key={o} className={`flex items-center gap-2 p-2 rounded border cursor-pointer ${llm === o ? "border-violet-500 bg-violet-50" : "border-slate-200"}`}>
            <input type="radio" name="llm" checked={llm === o} onChange={() => setLlm(o)} />
            <span className="font-mono">{o}</span>
          </label>
        ))}
      </div>
      <label className="block">Temperature: {temp}
        <input type="range" min="0" max="1" step="0.1" value={temp} onChange={(e) => setTemp(parseFloat(e.target.value))} className="w-full" />
      </label>
      <label className="block">Max tokens
        <input type="number" value={maxT} onChange={(e) => setMaxT(parseInt(e.target.value) || 0)} className="w-full border border-slate-300 rounded px-2 py-1 mt-1" />
      </label>
      <button disabled={busy} onClick={() => onSave({ llm, temperature: temp, max_tokens: maxT })} className="px-3 py-1.5 rounded-lg bg-violet-600 text-white font-medium disabled:opacity-60">
        {busy ? "..." : "Appliquer"}
      </button>
    </div>
  );
}

function PromptEditor({ current, onSave, busy }: any) {
  const [val, setVal] = useState(current);
  useEffect(() => setVal(current), [current]);
  return (
    <div className="space-y-2 text-xs">
      <div className="bg-blue-50 border border-blue-200 text-blue-800 rounded px-2 py-1.5">ℹ️ Le prompt complet est généré par session via <code>ava-agent-config</code>. Ceci est le fallback par défaut.</div>
      <textarea value={val} onChange={(e) => setVal(e.target.value)} rows={10} className="w-full border border-slate-300 rounded p-2 font-mono text-[11px]" />
      <div className="flex items-center justify-between">
        <span className="text-slate-500">{val?.length ?? 0}/4000</span>
        <button disabled={busy} onClick={() => onSave(val)} className="px-3 py-1.5 rounded-lg bg-violet-600 text-white font-medium disabled:opacity-60">{busy ? "..." : "Sauvegarder"}</button>
      </div>
    </div>
  );
}

function PipelineTest({ webhookUrl, agentId, expectedCount, currentCount }: any) {
  const [results, setResults] = useState<{ name: string; ok: boolean; msg: string }[]>([]);
  const [running, setRunning] = useState(false);
  const run = async () => {
    setRunning(true); setResults([]);
    const tests: { name: string; ok: boolean; msg: string }[] = [];
    // 1 — connexion API
    const c = await call("test_connection"); const cd = (c.data as any);
    tests.push({ name: "Connexion API ElevenLabs", ok: !!cd?.success, msg: cd?.success ? `Plan: ${cd.user?.subscription?.tier ?? "?"}` : cd?.error || "Erreur" });
    setResults([...tests]);
    // 2 — agent accessible
    const a = await call("get_agent"); const ad = (a.data as any);
    tests.push({ name: "Agent AVA accessible", ok: !!ad?.success, msg: ad?.success ? `ID: ${agentId}` : ad?.error || "—" });
    setResults([...tests]);
    // 3 — outils
    tests.push({ name: `${expectedCount} outils configurés`, ok: currentCount === expectedCount, msg: `${currentCount}/${expectedCount}` });
    setResults([...tests]);
    // 4 — webhook joignable (OPTIONS)
    try {
      const r = await fetch(webhookUrl, { method: "OPTIONS" });
      tests.push({ name: "Webhook ava-tool-executor", ok: r.ok || r.status === 204, msg: `HTTP ${r.status}` });
    } catch (e: any) { tests.push({ name: "Webhook ava-tool-executor", ok: false, msg: e.message }); }
    setResults([...tests]);
    setRunning(false);
  };
  return (
    <div className="space-y-2 text-xs">
      <button onClick={run} disabled={running} className="px-3 py-1.5 rounded-lg bg-blue-600 text-white font-medium flex items-center gap-1 disabled:opacity-60">
        <FlaskConical className="w-3 h-3" /> {running ? "En cours…" : "Lancer le pipeline de test"}
      </button>
      {results.map((r, i) => (
        <div key={i} className="flex items-center gap-2">
          {r.ok ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <AlertCircle className="w-4 h-4 text-red-600" />}
          <span className="font-medium text-slate-700">{r.name}</span>
          <span className="text-slate-500">— {r.msg}</span>
        </div>
      ))}
    </div>
  );
}

function WebhooksPanel({ toolExecutorUrl }: { toolExecutorUrl: string }) {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = async () => {
    setLoading(true); setErr(null);
    const r = await call("list_workspace_webhooks");
    const d = (r.data as any);
    if (!d?.success) setErr(d?.error ?? "Erreur");
    else setData(d);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const copy = (t: string) => navigator.clipboard.writeText(t);

  return (
    <div className="space-y-3 text-xs">
      <div className="flex items-center justify-between">
        <div className="text-slate-600">Vue d'ensemble des webhooks reliés à l'agent AVA.</div>
        <button onClick={load} className="px-2 py-1 rounded border border-slate-300 hover:bg-slate-50 flex items-center gap-1">
          <RefreshCw className="w-3 h-3" /> Recharger
        </button>
      </div>
      {err && <div className="rounded bg-red-50 border border-red-200 text-red-700 px-2 py-1.5">{err}</div>}
      {loading && <div className="text-slate-500">Chargement…</div>}

      {data && (
        <>
          <div className="rounded-lg border border-slate-200 p-3 bg-slate-50">
            <div className="font-semibold text-slate-700 mb-1">Webhook exécuteur d'outils (Supabase)</div>
            <div className="flex items-center gap-2">
              <code className="bg-white border border-slate-200 rounded px-2 py-1 flex-1 truncate">{toolExecutorUrl}</code>
              <button onClick={() => copy(toolExecutorUrl)} className="text-slate-500 hover:text-slate-800"><Copy className="w-3 h-3" /></button>
            </div>
            <div className="text-slate-500 mt-1">Chaque outil AVA appelle cette URL Supabase Edge Function.</div>
          </div>

          <div>
            <div className="font-semibold text-slate-700 mb-1">Webhook post-appel de l'agent</div>
            {data.agent_webhook ? (
              <div className="rounded border border-slate-200 p-2">
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${data.agent_webhook.is_disabled ? "bg-slate-400" : "bg-emerald-500"}`} />
                  <code className="flex-1 truncate">{data.agent_webhook.url ?? data.agent_webhook.webhook_id ?? "—"}</code>
                  {data.agent_webhook.url && <button onClick={() => copy(data.agent_webhook.url)} className="text-slate-500"><Copy className="w-3 h-3" /></button>}
                </div>
              </div>
            ) : (
              <div className="text-slate-500 italic">Aucun webhook post-appel configuré.</div>
            )}
          </div>

          <div>
            <div className="font-semibold text-slate-700 mb-1">Webhooks workspace ElevenLabs ({data.workspace_webhooks?.length ?? 0})</div>
            {(!data.workspace_webhooks || data.workspace_webhooks.length === 0) ? (
              <div className="text-slate-500 italic">Aucun webhook workspace.</div>
            ) : (
              <div className="space-y-1 max-h-56 overflow-auto">
                {data.workspace_webhooks.map((w: any) => (
                  <div key={w.webhook_id} className="rounded border border-slate-200 p-2">
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${w.is_disabled ? "bg-slate-400" : "bg-emerald-500"}`} />
                      <span className="font-semibold text-slate-800">{w.name ?? w.webhook_id}</span>
                      <span className="ml-auto text-slate-400">{Array.isArray(w.usages) ? `${w.usages.length} usage(s)` : ""}</span>
                    </div>
                    {w.webhook_url && (
                      <div className="flex items-center gap-2 mt-1">
                        <code className="flex-1 truncate">{w.webhook_url}</code>
                        <button onClick={() => copy(w.webhook_url)} className="text-slate-500"><Copy className="w-3 h-3" /></button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <div className="font-semibold text-slate-700 mb-1">Outils de l'agent avec webhook ({data.agent_tool_webhooks?.length ?? 0})</div>
            <div className="rounded border border-slate-200 max-h-56 overflow-auto">
              {(data.agent_tool_webhooks ?? []).map((t: any) => (
                <div key={t.name} className="px-2 py-1 flex items-center gap-2 border-b border-slate-100 last:border-b-0">
                  <span className="w-2 h-2 rounded-full bg-violet-500" />
                  <span className="font-mono text-slate-700">{t.name}</span>
                  <span className="text-slate-400 truncate flex-1">{t.method} {t.url ?? ""}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

