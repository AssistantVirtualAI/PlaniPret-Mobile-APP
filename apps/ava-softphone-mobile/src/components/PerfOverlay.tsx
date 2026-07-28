/**
 * Overlay temps réel des métriques de performance.
 *
 * Activation :
 *  - ?perf=1 dans l'URL
 *  - localStorage.setItem('ava.perf','1')
 *
 * Affiche : requêtes, cache hits/misses, dédoublonnages in-flight, erreurs,
 * et le top 6 des chargements (cacheKey + dernier temps + moyenne).
 */
import React, { useEffect, useState } from 'react';
import { perf, isPerfOverlayEnabled } from '../lib/perfMetrics';
import { useT } from '../lib/i18n';

export default function PerfOverlay() {
  const { tx } = useT();
  const [, setTick] = useState(0);
  const [open, setOpen] = useState(true);
  const [enabled] = useState(isPerfOverlayEnabled());

  useEffect(() => {
    if (!enabled) return;
    return perf.subscribe(() => setTick((t) => t + 1));
  }, [enabled]);

  if (!enabled) return null;
  const snap = perf.snapshot();
  const hitRate = snap.counters.cacheHits + snap.counters.cacheMisses === 0
    ? 0
    : Math.round(100 * snap.counters.cacheHits / (snap.counters.cacheHits + snap.counters.cacheMisses));

  return (
    <div style={{
      position: 'fixed', right: 8, bottom: 80, zIndex: 9999,
      background: 'rgba(8,12,22,0.92)', color: '#cfe1ff',
      border: '1px solid rgba(120,160,255,0.35)', borderRadius: 12,
      padding: open ? 10 : 6, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
      fontSize: 11, lineHeight: 1.35, maxWidth: 280, boxShadow: '0 10px 30px rgba(0,0,0,0.45)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <strong style={{ color: '#9fd0ff' }}>Perf</strong>
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={() => perf.reset()} style={btn}>{tx('Réinit.', 'Reset')}</button>
          <button onClick={() => setOpen(o => !o)} style={btn}>{open ? '–' : '+'}</button>
        </div>
      </div>
      {open && (
        <>
          <div style={{ marginTop: 6 }}>
            {tx('Req', 'Req')} : <b>{snap.counters.requests}</b> · {tx('Hits', 'Hits')} : <b>{snap.counters.cacheHits}</b> · {tx('Misses', 'Misses')} : <b>{snap.counters.cacheMisses}</b>
          </div>
          <div>{tx('Taux cache', 'Cache rate')} : <b>{hitRate}%</b> · {tx('Dédup', 'Dedup')} : <b>{snap.counters.inflightDedupes}</b> · {tx('Err', 'Err')} : <b>{snap.counters.errors}</b></div>
          <div style={{ marginTop: 6, opacity: 0.9 }}>{tx('Chargements récents :', 'Recent loads:')}</div>
          <div style={{ maxHeight: 160, overflow: 'auto' }}>
            {snap.timings.slice(0, 6).map(t => (
              <div key={t.key} style={{ display: 'flex', justifyContent: 'space-between', gap: 6 }}>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.key}</span>
                <span style={{ color: t.lastMs > 1500 ? '#ffb4a8' : '#a8ffcf' }}>
                  {Math.round(t.lastMs)}ms · {tx('moy', 'avg')} {Math.round(t.avgMs)}
                </span>
              </div>
            ))}
            {snap.timings.length === 0 && <div style={{ opacity: 0.6 }}>{tx("Aucune mesure pour l'instant.", 'No measurements yet.')}</div>}
          </div>
        </>
      )}
    </div>
  );
}

const btn: React.CSSProperties = {
  background: 'rgba(120,160,255,0.15)', color: '#cfe1ff',
  border: '1px solid rgba(120,160,255,0.35)', borderRadius: 6,
  padding: '2px 6px', fontSize: 10, cursor: 'pointer',
};
