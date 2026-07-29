/**
 * Diagnostic de build — version du bundle/app, état Tailwind et dernier
 * résultat de la sonde OAuth Maestro (pp-maestro-oauth-probe).
 */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, RefreshCw, CheckCircle2, XCircle, AlertTriangle, Play } from 'lucide-react';
import { App } from '@capacitor/app';
import { Device } from '@capacitor/device';
import { Capacitor } from '@capacitor/core';
import { supabase } from '@/lib/supabase';
import { runRuntimeSmokeCheck, getLastSmokeResult, type SmokeResult } from '@/lib/runtimeSmoke';

const PROBE_KEY = 'pp_maestro_oauth_probe_last';

interface ProbeRecord {
  at: string;
  ok: boolean;
  data: unknown;
  error?: string;
}

function Card({ title, children, right }: { title: string; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="rounded-xl p-4 mb-3" style={{ background: '#0A1628', border: '1px solid #0E2A45' }}>
      <div className="flex items-center justify-between mb-3">
        <div className="text-sm font-bold">{title}</div>
        {right}
      </div>
      {children}
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-start justify-between gap-3 text-xs py-1.5" style={{ borderBottom: '1px solid #0E2A4577' }}>
      <span style={{ color: '#8FA8C0' }}>{k}</span>
      <span className="font-mono text-right break-all" style={{ color: '#E8EDF5' }}>{v}</span>
    </div>
  );
}

export default function MBuildDiagnostics() {
  const nav = useNavigate();
  const [build, setBuild] = useState<Record<string, string>>({});
  const [smoke, setSmoke] = useState<SmokeResult | null>(null);
  const [probe, setProbe] = useState<ProbeRecord | null>(null);
  const [probing, setProbing] = useState(false);

  async function loadBuild() {
    const [appInfo, deviceInfo] = await Promise.all([
      App.getInfo().catch(() => ({ versionName: '—', build: '—', id: '—' }) as any),
      Device.getInfo().catch(() => ({ osVersion: '—', model: '—' }) as any),
    ]);
    setBuild({
      'Version app': appInfo.versionName ?? '—',
      'Build natif': String(appInfo.build ?? '—'),
      'Bundle ID': appInfo.id ?? '—',
      Plateforme: Capacitor.getPlatform(),
      Natif: Capacitor.isNativePlatform() ? 'oui' : 'non',
      OS: deviceInfo.osVersion ?? '—',
      Modèle: deviceInfo.model ?? '—',
      'Build web (ID)': (import.meta as any).env?.VITE_BUILD_ID ?? '—',
      'Build web (date)': (import.meta as any).env?.VITE_BUILD_TIME ?? '—',
    });
  }

  function loadProbe() {
    try {
      const raw = localStorage.getItem(PROBE_KEY);
      setProbe(raw ? (JSON.parse(raw) as ProbeRecord) : null);
    } catch {
      setProbe(null);
    }
  }

  async function runProbe() {
    setProbing(true);
    let rec: ProbeRecord;
    try {
      const { data, error } = await supabase.functions.invoke('pp-maestro-oauth-probe', { body: {} });
      rec = error
        ? { at: new Date().toISOString(), ok: false, data: null, error: error.message }
        : { at: new Date().toISOString(), ok: true, data };
    } catch (e) {
      rec = { at: new Date().toISOString(), ok: false, data: null, error: (e as Error).message };
    }
    try {
      localStorage.setItem(PROBE_KEY, JSON.stringify(rec));
    } catch {}
    setProbe(rec);
    setProbing(false);
  }

  function refreshAll() {
    void loadBuild();
    setSmoke(runRuntimeSmokeCheck());
    loadProbe();
  }

  useEffect(() => {
    void loadBuild();
    setSmoke(getLastSmokeResult() ?? runRuntimeSmokeCheck());
    loadProbe();
  }, []);

  const twOk = smoke ? smoke.tailwindUtility && smoke.tailwindVars : null;
  const StatusIcon = twOk === null ? AlertTriangle : twOk ? CheckCircle2 : XCircle;
  const statusColor = twOk === null ? '#F5A623' : twOk ? '#2EDC78' : '#E84C4C';

  return (
    <div className="min-h-screen p-4" style={{ background: '#060D1A', color: '#E8EDF5' }}>
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center gap-3 mb-4">
          <button onClick={() => nav(-1)} className="p-2 rounded-lg" style={{ background: '#0A1628', border: '1px solid #0E2A45' }}>
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="flex-1">
            <h1 className="text-lg font-bold">Diagnostic de build</h1>
            <p className="text-xs" style={{ color: '#8FA8C0' }}>Version, Tailwind et sonde OAuth Maestro</p>
          </div>
          <button onClick={refreshAll} className="p-2 rounded-lg" style={{ background: '#0A1628', border: '1px solid #0E2A45' }}>
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>

        <div className="rounded-xl p-4 mb-3" style={{ background: '#0A1628', border: `1px solid ${statusColor}44` }}>
          <div className="flex items-center gap-3">
            <StatusIcon className="w-8 h-8" style={{ color: statusColor }} />
            <div className="flex-1">
              <div className="text-base font-bold" style={{ color: statusColor }}>
                {twOk === null ? 'Analyse…' : twOk ? 'Tailwind compilé' : 'Tailwind non compilé'}
              </div>
              <div className="text-xs" style={{ color: '#8FA8C0' }}>
                {smoke
                  ? `#root: ${smoke.rootChildren} enfant(s), ${smoke.rootTextLength} caractères · ${smoke.utilityProbe}`
                  : '—'}
              </div>
            </div>
          </div>
        </div>

        <Card title="Smoke check runtime">
          <Row k="Statut" v={smoke ? (smoke.passed ? '✓ réussi' : `✗ ${smoke.failures.join(', ')}`) : '—'} />
          <Row k="#root non vide" v={smoke ? (smoke.rootHasContent ? 'oui' : 'non') : '—'} />
          <Row k="Utility Tailwind (.flex .px-4)" v={smoke ? (smoke.tailwindUtility ? 'oui' : 'non') : '—'} />
          <Row k="Variables --tw-*" v={smoke ? (smoke.tailwindVars ? 'oui' : 'non') : '—'} />
          <Row k="Exécuté à" v={smoke?.at ?? '—'} />
        </Card>

        <Card title="Build">
          {Object.entries(build).map(([k, v]) => (
            <Row key={k} k={k} v={v} />
          ))}
        </Card>

        <Card
          title="pp-maestro-oauth-probe"
          right={
            <button
              onClick={runProbe}
              disabled={probing}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold"
              style={{ background: '#0E2A45', color: '#E8EDF5', opacity: probing ? 0.6 : 1 }}
            >
              {probing ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
              {probing ? 'Sonde…' : 'Relancer'}
            </button>
          }
        >
          {!probe ? (
            <p className="text-xs" style={{ color: '#8FA8C0' }}>Aucun résultat enregistré — lancez la sonde.</p>
          ) : (
            <>
              <Row k="Dernière exécution" v={probe.at} />
              <Row k="Statut" v={probe.ok ? '✓ OK' : `✗ ${probe.error ?? 'erreur'}`} />
              <pre
                className="mt-3 text-[10px] p-3 rounded-lg overflow-auto"
                style={{ background: '#040B16', border: '1px solid #0E2A45', color: '#8FA8C0', maxHeight: 320 }}
              >
                {JSON.stringify(probe.data ?? probe.error, null, 2)}
              </pre>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
