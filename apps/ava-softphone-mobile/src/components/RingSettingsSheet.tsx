import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import {
  getRingPreferences,
  setRingVolume,
  setVibrationEnabled,
  onRingPreferencesChange,
  type RingPreferences,
} from '../lib/sip/ringPreferences';

interface Props {
  open: boolean;
  onClose: () => void;
}

/**
 * User-facing controls for incoming ringtone volume and vibration on VoIP calls.
 */
export default function RingSettingsSheet({ open, onClose }: Props) {
  const [prefs, setPrefs] = useState<RingPreferences>(() => getRingPreferences());

  useEffect(() => onRingPreferencesChange(setPrefs), []);

  if (!open) return null;

  const node = (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 99998,
        background: 'rgba(2,6,23,0.6)', backdropFilter: 'blur(8px)',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 480,
          background: 'linear-gradient(180deg,#0b1220,#060912)',
          borderTopLeftRadius: 24, borderTopRightRadius: 24,
          padding: 20, paddingBottom: 'calc(env(safe-area-inset-bottom,0px) + 24px)',
          color: '#e2e8f0',
          border: '1px solid rgba(255,255,255,0.08)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>Ring & Vibration</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer' }}
          >
            <X size={20} />
          </button>
        </div>

        <section style={{ marginBottom: 20 }}>
          <label style={labelStyle}>
            Ringtone volume <span style={{ opacity: 0.6 }}>· {Math.round(prefs.volume * 100)}%</span>
          </label>
          <input
            type="range"
            min={0} max={100}
            value={Math.round(prefs.volume * 100)}
            onChange={(e) => setRingVolume(parseInt(e.target.value, 10) / 100)}
            style={{ width: '100%', accentColor: '#3b82f6' }}
          />
          <p style={hintStyle}>
            Applied to both outgoing ringback and the incoming ring. Set to 0 for a
            silent ring (vibration still fires if enabled below).
          </p>
        </section>

        <section style={{ marginBottom: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <div>
              <div style={labelStyle as any}>Vibrate on incoming calls</div>
              <p style={{ ...hintStyle, marginTop: 4 }}>
                Triggers a haptic pulse on every ring so you still feel calls when the
                phone is on vibrate.
              </p>
            </div>
            <Toggle on={prefs.vibration} onChange={setVibrationEnabled} />
          </div>
        </section>
      </div>
    </div>
  );

  return createPortal(node, document.body);
}

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 14, fontWeight: 600, color: '#e2e8f0', marginBottom: 8,
};

const hintStyle: React.CSSProperties = {
  fontSize: 12, color: '#94a3b8', margin: 0, lineHeight: 1.4,
};

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      style={{
        width: 50, height: 28, borderRadius: 999,
        background: on ? '#22c55e' : '#475569',
        position: 'relative', border: 'none', cursor: 'pointer',
        transition: 'background 150ms ease', flexShrink: 0,
      }}
    >
      <span
        style={{
          position: 'absolute', top: 3, left: on ? 25 : 3,
          width: 22, height: 22, borderRadius: '50%',
          background: '#fff', transition: 'left 150ms ease',
        }}
      />
    </button>
  );
}
