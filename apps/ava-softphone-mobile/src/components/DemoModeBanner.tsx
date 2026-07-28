import React from 'react';
import { isMockMode } from '../lib/buildGuard';

/**
 * Visible strip shown whenever the mobile app runs with VITE_AVA_MOCK=true.
 * Production builds can never reach this state (see buildGuard.ts).
 */
export default function DemoModeBanner() {
  if (!isMockMode()) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        background: '#facc15',
        color: '#1f1300',
        fontSize: 11,
        fontWeight: 700,
        padding: '4px 10px',
        textAlign: 'center',
        letterSpacing: 0.4,
        textTransform: 'uppercase',
      }}
    >
      Mode démonstration — données fictives
    </div>
  );
}
