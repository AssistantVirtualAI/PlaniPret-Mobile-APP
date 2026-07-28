/**
 * Bottom-sheet de sélection de numéro lorsqu'un contact en a plusieurs
 * (mobile, bureau, extension SIP, e-mail). Affiche un libellé localisé
 * et déclenche le callback `onPick` avec le numéro normalisé.
 */
import React from 'react';
import { colors, font, radius } from '../lib/theme';
import { useT } from '../lib/i18n';

export type NumberOption = {
  label: string;        // "Mobile", "Bureau", "Extension 1015"…
  number: string;       // brut, sera nettoyé par dialNumber
  hint?: string;        // sous-label optionnel
};

export default function NumberPickerSheet({
  title, options, onPick, onClose,
}: {
  title?: string;
  options: NumberOption[];
  onPick: (n: string) => void;
  onClose: () => void;
}) {
  const { lang } = useT();
  const fr = lang === 'fr';
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 60,
        background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'flex-end',
      }}
    >
      <div onClick={(e) => e.stopPropagation()} style={{
        width: '100%', padding: '14px 14px 22px',
        borderTopLeftRadius: 18, borderTopRightRadius: 18,
        background: '#0d1426', border: `1px solid ${colors.border}`,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
          <div style={{ flex: 1, color: colors.textIce, fontWeight: 900, fontSize: 16 }}>
            {title || (fr ? 'Choisir un numéro' : 'Choose a number')}
          </div>
          <button onClick={onClose} aria-label="Fermer" style={{
            width: 34, height: 34, borderRadius: 17,
            border: `1px solid ${colors.border}`,
            background: 'rgba(255,255,255,0.04)', color: colors.textIce, cursor: 'pointer',
          }}>✕</button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {options.map((opt, i) => (
            <button key={`${opt.number}-${i}`} onClick={() => { onPick(opt.number); onClose(); }} style={{
              display: 'flex', alignItems: 'center', gap: 12,
              width: '100%', padding: '12px 14px',
              borderRadius: radius.lg,
              border: `1px solid ${colors.border}`,
              background: 'rgba(255,255,255,0.04)',
              color: colors.textIce, cursor: 'pointer', textAlign: 'left',
            }}>
              <div style={{
                width: 36, height: 36, borderRadius: '50%',
                background: 'linear-gradient(135deg, #22c55e, #16a34a)',
                color: '#fff', display: 'grid', placeItems: 'center', fontSize: 16,
              }}>☏</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: font.sm, fontWeight: 800 }}>{opt.label}</div>
                <div style={{ fontSize: 11, color: colors.mutedSilver, marginTop: 2, fontFamily: 'JetBrains Mono, monospace' }}>
                  {opt.number}{opt.hint ? ` · ${opt.hint}` : ''}
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
