import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { colors, font, radius } from '../lib/theme';
import { Card, SectionTitle } from '../components/ui/Primitives';
import { useT } from '../lib/i18n';


/**
 * Mobile AI Requests audit view.
 * Shows recent transcription / analysis attempts with status, error codes
 * and a detail drawer. Polls every 4s while a request is in-flight.
 * Each row offers a "Retry" action that re-queues the same call id and
 * inserts a new attempt into the audit log.
 */

const SUPABASE_URL = 'https://gejxisrqtvxavbrfcoxz.supabase.co';
const ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdlanhpc3JxdHZ4YXZicmZjb3h6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE1MDMxNzQsImV4cCI6MjA3NzA3OTE3NH0.kaO-GslE99OCNrZ4_AMnbzGqya2azqz_UMZR34zZvvo';

type Row = {
  id: string;
  created_at: string;
  organization_id: string | null;
  call_record_id: string | null;
  request_type: 'transcribe' | 'analyze' | string;
  status: string;
  error_code: string | null;
  http_status: number | null;
  message: string | null;
  provider: string | null;
  model: string | null;
  latency_ms: number | null;
  metadata: any;
};

const STATUS_COLOR = (s: string) => {
  if (s === 'ok') return colors.success;
  if (s === 'pending' || s === 'queued' || s === 'running') return colors.lemtelBlue;
  if (s === 'no-audio' || s === 'no-transcript') return '#d2a300';
  if (s === 'missing-key') return '#d97706';
  if (s === 'ai-error' || s === 'error' || s === 'timeout') return colors.danger;
  return colors.mutedSilver;
};
const isActive = (s: string) => s === 'pending' || s === 'queued' || s === 'running';

const FILTERS = ['all', 'ok', 'no-audio', 'missing-key', 'ai-error', 'error'] as const;
const FILTER_FR: Record<typeof FILTERS[number], string> = {
  'all': 'tous', 'ok': 'ok', 'no-audio': 'sans audio',
  'missing-key': 'clé manquante', 'ai-error': 'erreur ia', 'error': 'erreur',
};


function getToken(): string | null {
  try { return localStorage.getItem('ava.auth.token') || localStorage.getItem('sb-access-token'); } catch { return null; }
}

async function authFetch(path: string, init: RequestInit = {}) {
  const token = getToken();
  const res = await fetch(`${SUPABASE_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      apikey: ANON_KEY,
      Authorization: `Bearer ${token || ANON_KEY}`,
      ...(init.headers as any || {}),
    },
  });
  return res;
}

export default function AIAuditScreen() {
  const { lang, t } = useT();
  const fr = lang === 'fr';
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<typeof FILTERS[number]>('all');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Row | null>(null);
  const [retrying, setRetrying] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const stopRef = useRef(false);


  const load = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      params.set('select', '*');
      params.set('order', 'created_at.desc');
      params.set('limit', '100');
      if (filter !== 'all') params.set('status', `eq.${filter}`);
      const res = await authFetch(`/rest/v1/ai_request_audit_log?${params.toString()}`);
      if (res.ok) setRows((await res.json()) as Row[]);
    } finally { setLoading(false); }
  }, [filter]);

  // Initial + filter-change load.
  useEffect(() => { setLoading(true); load(); }, [load]);

  // Live polling: 8s idle, 3s when any in-flight request is visible.
  useEffect(() => {
    stopRef.current = false;
    let t: ReturnType<typeof setTimeout> | null = null;
    const tick = async () => {
      if (stopRef.current) return;
      await load();
      const anyActive = rowsRef.current.some(r => isActive(r.status));
      t = setTimeout(tick, anyActive ? 3000 : 8000);
    };
    t = setTimeout(tick, 4000);
    return () => { stopRef.current = true; if (t) clearTimeout(t); };
  }, [load]);

  // Keep latest rows in a ref for the polling loop.
  const rowsRef = useRef<Row[]>([]);
  useEffect(() => { rowsRef.current = rows; }, [rows]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter(r =>
      (r.call_record_id || '').toLowerCase().includes(s) ||
      (r.error_code || '').toLowerCase().includes(s) ||
      (r.message || '').toLowerCase().includes(s)
    );
  }, [rows, search]);

  const retry = async (row: Row) => {
    if (!row.call_record_id || !row.organization_id) {
      setToast(fr ? 'Impossible de réessayer — identifiant ou organisation manquant.' : 'Cannot retry — missing call id or workspace.');
      return;
    }
    setRetrying(row.id); setToast(null);
    const fn = row.request_type === 'analyze' ? 'ai-analyze-call' : 'ai-transcribe-call';
    try {
      const res = await authFetch(`/functions/v1/${fn}`, {
        method: 'POST',
        body: JSON.stringify({
          call_record_id: row.call_record_id,
          organization_id: row.organization_id,
          retry_of: row.id,
        }),
      });
      const body = await res.json().catch(() => ({}));
      setToast(res.ok
        ? (fr ? `Nouvelle tentative envoyée pour ${row.request_type} · #${row.call_record_id.slice(0, 8)}` : `Retry queued for ${row.request_type} · #${row.call_record_id.slice(0, 8)}`)
        : (fr ? `Échec (${res.status}) ${body?.error || ''}` : `Retry failed (${res.status}) ${body?.error || ''}`));
      // The edge function inserts its own audit row — reload.
      setTimeout(load, 800);
    } catch (e: any) {
      setToast((fr ? 'Échec : ' : 'Retry failed: ') + (e?.message || (fr ? 'erreur réseau' : 'network error')));
    } finally {
      setRetrying(null);
    }
  };

  return (
    <div style={{ padding: 14, overflowY: 'auto', paddingBottom: 120 }}>
      <SectionTitle eyebrow={fr ? 'Diagnostics' : 'Diagnostics'} title={fr ? 'Requêtes IA' : 'AI requests'} />
      <Card padded={true} style={{ marginBottom: 10 }}>
        <p style={{ margin: 0, fontSize: font.sm, color: colors.textSub, lineHeight: 1.5 }}>
          {fr
            ? <>Chaque requête de transcription et d’analyse est enregistrée ici avec son horodatage, statut et code d’erreur. Touchez une ligne pour les détails, ou utilisez <strong>Réessayer</strong> pour relancer le même appel.</>
            : <>Every transcription and analysis request is logged here with timestamp, status and error code. Tap a row for full details, or use <strong>Retry</strong> to re-queue the same call.</>}
        </p>
      </Card>

      {/* Filters + search */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
        {FILTERS.map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            padding: '6px 10px', borderRadius: radius.sm, cursor: 'pointer',
            border: `1px solid ${filter === f ? colors.lemtelBlue : colors.border}`,
            background: filter === f ? 'rgba(0,35,230,0.12)' : 'transparent',
            color: filter === f ? colors.textIce : colors.textSub,
            fontSize: 10.5, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase',
          }}>{fr ? FILTER_FR[f] : f}</button>
        ))}
      </div>
      <input value={search} onChange={e => setSearch(e.target.value)}
        placeholder={fr ? 'Rechercher identifiant, code d’erreur, message…' : 'Search call id, error code, message…'}
        style={{
          width: '100%', padding: '8px 10px', borderRadius: radius.sm,
          border: `1px solid ${colors.border}`, background: 'rgba(255,255,255,0.04)',
          color: colors.textIce, fontSize: font.sm, marginBottom: 10,
        }} />

      {toast && (
        <div style={{
          fontSize: font.xs, color: colors.textIce, background: 'rgba(0,35,230,0.18)',
          border: `1px solid ${colors.lemtelBlue}`, borderRadius: radius.sm,
          padding: '8px 10px', marginBottom: 10,
        }}>{toast}</div>
      )}

      {loading ? (
        <Card padded={true}><div style={{ color: colors.mutedSilver, fontSize: font.sm }}>{t('common.loading')}</div></Card>
      ) : filtered.length === 0 ? (
        <Card padded={true}><div style={{ color: colors.mutedSilver, fontSize: font.sm }}>{fr ? 'Aucune requête IA.' : 'No AI requests yet.'}</div></Card>
      ) : (

        <Card padded={false}>
          {filtered.map((r, i) => (
            <div key={r.id} style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '12px 12px',
              borderTop: i === 0 ? 'none' : `1px solid ${colors.border}`,
            }}>
              <button onClick={() => setSelected(r)} style={{
                flex: 1, minWidth: 0, textAlign: 'left', background: 'transparent',
                border: 'none', cursor: 'pointer', padding: 0, color: colors.textIce,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{
                    fontSize: 9.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.5,
                    padding: '2px 6px', borderRadius: 6, color: STATUS_COLOR(r.status),
                    background: `${STATUS_COLOR(r.status)}22`, border: `1px solid ${STATUS_COLOR(r.status)}55`,
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                  }}>
                    {isActive(r.status) && <span style={{ width: 6, height: 6, borderRadius: 999, background: STATUS_COLOR(r.status), animation: 'pulse 1.2s ease-in-out infinite' }} />}
                    {r.status}
                  </span>
                  <span style={{ fontSize: 10, color: colors.mutedSilver, fontWeight: 700, textTransform: 'uppercase' }}>{r.request_type}</span>
                  <span style={{ marginLeft: 'auto', fontSize: 10, color: colors.mutedSilver }}>
                    {new Date(r.created_at).toLocaleString()}
                  </span>
                </div>
                <div style={{ marginTop: 4, fontSize: font.xs, color: colors.textSub, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {r.call_record_id ? `#${r.call_record_id.slice(0, 12)}` : '—'}
                  {r.error_code && <span style={{ color: colors.danger, marginLeft: 6, fontFamily: 'JetBrains Mono, monospace' }}>· {r.error_code}</span>}
                  {r.latency_ms && <span style={{ color: colors.mutedSilver, marginLeft: 6 }}>· {r.latency_ms}ms</span>}
                </div>
                {r.message && (
                  <div style={{ marginTop: 2, fontSize: 11, color: colors.mutedSilver, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {r.message}
                  </div>
                )}
              </button>
              <button
                onClick={() => retry(r)}
                disabled={retrying === r.id || !r.call_record_id || !r.organization_id}
                style={{
                  padding: '6px 10px', borderRadius: radius.sm,
                  border: `1px solid ${colors.lemtelBlue}`,
                  background: retrying === r.id ? 'rgba(0,35,230,0.35)' : 'rgba(0,35,230,0.15)',
                  color: colors.textIce, fontSize: 10.5, fontWeight: 700, cursor: 'pointer',
                  opacity: !r.call_record_id || !r.organization_id ? 0.4 : 1,
                  whiteSpace: 'nowrap',
                }}
              >{retrying === r.id ? '…' : (fr ? '↻ Réessayer' : '↻ Retry')}</button>
            </div>
          ))}
        </Card>
      )}

      {selected && (
        <div onClick={() => setSelected(null)} style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          background: 'rgba(2,6,20,0.7)', backdropFilter: 'blur(8px)',
          display: 'flex', alignItems: 'flex-end',
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            background: '#0a1024', borderTopLeftRadius: 18, borderTopRightRadius: 18,
            width: '100%', maxHeight: '82vh', overflowY: 'auto',
            padding: 18, borderTop: `1px solid ${colors.border}`,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h3 style={{ margin: 0, fontSize: font.md, color: colors.textIce }}>
                {fr ? `IA ${selected.request_type === 'analyze' ? 'analyse' : 'transcription'}` : `AI ${selected.request_type}`}
              </h3>
              <button onClick={() => setSelected(null)} style={{
                background: 'transparent', border: 'none', color: colors.mutedSilver,
                fontSize: 22, cursor: 'pointer',
              }}>✕</button>
            </div>
            <KV k={fr ? 'Statut' : 'Status'} v={selected.status} accent={STATUS_COLOR(selected.status)} />
            <KV k={fr ? 'Identifiant appel' : 'Call id'} v={selected.call_record_id || '—'} mono />
            <KV k={fr ? 'Organisation' : 'Workspace'} v={selected.organization_id || '—'} mono />
            <KV k={fr ? 'Code d’erreur' : 'Error code'} v={selected.error_code || '—'} mono accent={selected.error_code ? colors.danger : undefined} />
            <KV k="HTTP" v={selected.http_status?.toString() || '—'} />
            <KV k={fr ? 'Fournisseur' : 'Provider'} v={`${selected.provider || '—'}${selected.model ? ' · ' + selected.model : ''}`} />
            <KV k={fr ? 'Latence' : 'Latency'} v={selected.latency_ms ? `${selected.latency_ms}ms` : '—'} />
            <KV k={fr ? 'Date' : 'When'} v={new Date(selected.created_at).toLocaleString()} />
            {selected.message && (
              <div style={{ marginTop: 10 }}>
                <div style={{ fontSize: 10, color: colors.mutedSilver, textTransform: 'uppercase', letterSpacing: 0.6 }}>Message</div>
                <div style={{ fontSize: font.sm, color: colors.textIce, lineHeight: 1.5, marginTop: 4 }}>{selected.message}</div>
              </div>
            )}
            {selected.metadata && Object.keys(selected.metadata).length > 0 && (
              <div style={{ marginTop: 12 }}>
                <div style={{ fontSize: 10, color: colors.mutedSilver, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 4 }}>{fr ? 'Charge utile' : 'Raw payload'}</div>
                <pre style={{
                  background: 'rgba(0,0,0,0.35)', padding: 10, borderRadius: 8,
                  fontSize: 10.5, color: colors.textIce, overflow: 'auto', margin: 0,
                  fontFamily: 'JetBrains Mono, monospace',
                }}>{JSON.stringify(selected.metadata, null, 2)}</pre>
              </div>
            )}
            <button
              onClick={() => retry(selected)}
              disabled={retrying === selected.id}
              style={{
                marginTop: 14, width: '100%', padding: '11px 12px', borderRadius: radius.md,
                background: colors.lemtelBlue, color: '#fff', border: 'none',
                fontSize: font.sm, fontWeight: 700, cursor: 'pointer',
                opacity: retrying === selected.id ? 0.5 : 1,
              }}
            >{retrying === selected.id ? (fr ? 'Nouvelle tentative…' : 'Retrying…') : (fr ? '↻ Relancer cette requête' : '↻ Retry this request')}</button>

          </div>
        </div>
      )}

      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.35} }`}</style>
    </div>
  );
}

function KV({ k, v, mono, accent }: { k: string; v: string; mono?: boolean; accent?: string }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', gap: 10,
      padding: '6px 0', borderBottom: `1px solid ${colors.border}`,
    }}>
      <span style={{ fontSize: font.xs, color: colors.mutedSilver }}>{k}</span>
      <span style={{
        fontSize: font.xs, color: accent || colors.textIce,
        fontFamily: mono ? 'JetBrains Mono, monospace' : undefined,
        textAlign: 'right', wordBreak: 'break-all',
      }}>{v}</span>
    </div>
  );
}
