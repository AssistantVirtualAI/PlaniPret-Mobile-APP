import React, { useEffect, useState } from 'react';
import { useSyncStatus, triggerSyncRefresh } from '../lib/syncStatus';
import { useT } from '../lib/i18n';
import { colors } from '../lib/theme';

/**
 * Floating pill: shows current sync state and acts as a manual refresh button.
 * Disabled (non-clickable) while a refresh is in flight to avoid duplicate requests.
 */
export default function SyncIndicator() {
  const { t } = useT();
  const snap = useSyncStatus();
  const [hideSuccess, setHideSuccess] = useState(false);

  useEffect(() => {
    if (snap.state === 'success') {
      setHideSuccess(false);
      const id = setTimeout(() => setHideSuccess(true), 2200);
      return () => clearTimeout(id);
    }
    setHideSuccess(false);
  }, [snap.state, snap.lastSuccessAt]);

  // Always render so users can re-sync; only collapse to a tiny refresh chip when idle.
  const isLoading = snap.state === 'loading';
  const isError = snap.state === 'error';
  const isSuccess = snap.state === 'success' && !hideSuccess;

  const cfg = isLoading
    ? { bg: 'rgba(36,178,255,0.16)', bd: '#24B2FF66', fg: '#7CD9FF', label: t('sync.loading') }
    : isError
    ? { bg: 'rgba(255,77,103,0.16)', bd: `${colors.danger}66`, fg: '#FF8FA1', label: t('sync.error') }
    : isSuccess
    ? { bg: 'rgba(16,185,129,0.16)', bd: '#10B98166', fg: '#7FE8C2', label: t('sync.success') }
    : { bg: 'rgba(255,255,255,0.06)', bd: 'rgba(255,255,255,0.12)', fg: '#B7C3D6', label: t('common.refresh') };

  const onClick = () => { if (!isLoading) triggerSyncRefresh(); };

  return (
    <button
      onClick={onClick}
      disabled={isLoading}
      aria-label={t('common.refresh')}
      title={t('common.refresh')}
      style={{
        position: 'absolute', top: 8, left: '50%', transform: 'translateX(-50%)',
        display: 'inline-flex', alignItems: 'center', gap: 8,
        padding: '6px 12px', borderRadius: 999,
        background: cfg.bg, border: `1px solid ${cfg.bd}`, color: cfg.fg,
        fontSize: 11.5, fontWeight: 700, letterSpacing: 0.4,
        backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
        zIndex: 50,
        cursor: isLoading ? 'not-allowed' : 'pointer',
        opacity: isLoading ? 0.85 : 1,
        boxShadow: '0 6px 18px rgba(0,0,0,0.25)',
        userSelect: 'none',
      }}
    >
      <span style={{ display: 'inline-flex', width: 14, height: 14, alignItems: 'center', justifyContent: 'center' }}>
        {isLoading ? <Spinner /> : isError ? <span>!</span> : isSuccess ? <span>✓</span> : <span style={{ fontSize: 13 }}>↻</span>}
      </span>
      <span>{cfg.label}</span>
      {isLoading && snap.totalLoaders > 0 && (
        <span style={{ opacity: 0.75 }}>· {snap.readyLoaders}/{snap.totalLoaders}</span>
      )}
    </button>
  );
}

function Spinner() {
  return (
    <span style={{
      width: 12, height: 12, borderRadius: '50%',
      border: '2px solid rgba(255,255,255,0.25)', borderTopColor: '#7CD9FF',
      display: 'inline-block', animation: 'avaspin 0.8s linear infinite',
    }}>
      <style>{`@keyframes avaspin { to { transform: rotate(360deg); } }`}</style>
    </span>
  );
}
