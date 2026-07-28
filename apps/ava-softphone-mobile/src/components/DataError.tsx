import React from 'react';
import { colors } from '../lib/theme';

/**
 * Inline error state for failed data fetches in the mobile app.
 * Replaces silent fallback-to-mock behaviour.
 */
export default function DataError({
  message,
  onRetry,
}: {
  message?: string;
  onRetry?: () => void;
}) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', gap: 10, padding: '32px 20px',
      color: colors.textSub, fontSize: 14, textAlign: 'center',
    }}>
      <div style={{ fontSize: 15, color: colors.textIce }}>
        {message || 'Impossible de charger les données.'}
      </div>
      {onRetry && (
        <button
          onClick={onRetry}
          style={{
            marginTop: 8, padding: '10px 18px', borderRadius: 20,
            background: colors.graphite, border: `1px solid ${colors.border}`,
            color: colors.textIce, cursor: 'pointer', fontSize: 13, fontWeight: 600,
          }}
        >
          Réessayer
        </button>
      )}
    </div>
  );
}
