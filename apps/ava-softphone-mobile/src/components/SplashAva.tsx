import React from 'react';
import { colors, gradients } from '../lib/theme';

/**
 * Animated AVA splash — concentric arc orbits with a subtle pulse.
 * Used both for cold boot and during slow auth restore.
 */
export default function SplashAva() {
  return (
    <div style={{
      position: 'fixed', inset: 0, display: 'flex',
      alignItems: 'center', justifyContent: 'center',
      flexDirection: 'column', gap: 28,
      background: gradients.app,
      color: colors.textIce,
    }}>
      <style>{`
        @keyframes ava-spin { to { transform: rotate(360deg); } }
        @keyframes ava-spin-rev { to { transform: rotate(-360deg); } }
        @keyframes ava-pulse { 0%,100% { opacity: .65; transform: scale(1); } 50% { opacity: 1; transform: scale(1.04); } }
        .ava-arc { stroke-linecap: round; fill: none; transform-origin: center; }
      `}</style>
      <div style={{
        width: 120, height: 120, borderRadius: 28,
        overflow: 'hidden', boxShadow: '0 24px 60px -20px rgba(34,211,238,0.45)',
        animation: 'ava-pulse 2.6s ease-in-out infinite',
      }}>
        <img src="/ava-logo.png" alt="AVA" width={120} height={120} style={{ display: 'block' }} />
      </div>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: -0.3 }}>AVA Softphone</div>
        <div style={{ fontSize: 12, color: colors.mutedSilver, marginTop: 4, textTransform: 'uppercase', letterSpacing: 2 }}>Powered by AVA AI</div>
      </div>
    </div>
  );
}
