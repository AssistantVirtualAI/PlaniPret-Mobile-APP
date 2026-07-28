import React, { useState } from 'react';
import { ImpactStyle } from '@capacitor/haptics';
import DialerScreen from '../screens/DialerScreen';
import { colors, gradients, shadow } from '../lib/theme';

/**
 * Floating dialer button shown above the bottom tab bar on every tab.
 * Opens a full-screen keypad modal wired to the existing softphone.
 */
export default function DialerFab({
  sp,
  haptic,
  preferClickToCall = false,
}: {
  sp: any;
  haptic: (s?: ImpactStyle) => Promise<void>;
  preferClickToCall?: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => {
          haptic(ImpactStyle.Medium);
          setOpen(true);
        }}
        aria-label="Open keypad to place a call"
        title="Keypad"
        style={{
          position: 'fixed',
          // Respect right safe area (notch/rounded corners on landscape iOS)
          right: `calc(16px + env(safe-area-inset-right, 0px))`,
          // Sit above the bottom tab bar (tab height ~66 + 8 margin + safe area)
          bottom: `calc(82px + env(safe-area-inset-bottom, 0px) + var(--safe-bottom))`,
          // Min 44x44 tap target (Apple HIG) / 48dp (Material) — we use 64 for comfort
          width: 64,
          height: 64,
          minWidth: 44,
          minHeight: 44,
          borderRadius: '50%',
          border: '2px solid rgba(255,255,255,0.6)',
          cursor: 'pointer',
          background: gradients.shinyPrimary,
          color: '#fff',
          fontSize: 28,
          fontWeight: 700,
          display: 'grid',
          placeItems: 'center',
          boxShadow: shadow.lift,
          zIndex: 60,
          outlineOffset: 3,
          WebkitTapHighlightColor: 'transparent',
          touchAction: 'manipulation',
        }}
      >
        ⌨
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 80,
            background: 'rgba(10,18,40,0.86)',
            backdropFilter: 'blur(14px)',
            display: 'flex',
            flexDirection: 'column',
            paddingTop: 'var(--safe-top)',
            paddingBottom: 'var(--safe-bottom)',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '10px 14px',
            }}
          >
            <span style={{ color: '#fff', fontWeight: 800, fontSize: 16 }}>Keypad</span>
            <button
              onClick={() => setOpen(false)}
              aria-label="Close keypad"
              style={{
                background: 'rgba(255,255,255,0.12)',
                color: '#fff',
                border: 'none',
                borderRadius: 999,
                width: 36,
                height: 36,
                fontSize: 18,
                cursor: 'pointer',
              }}
            >
              ✕
            </button>
          </div>
          <div style={{ flex: 1, minHeight: 0 }}>
            <DialerScreen sp={sp} haptic={haptic} />
          </div>
        </div>
      )}
    </>
  );
}
