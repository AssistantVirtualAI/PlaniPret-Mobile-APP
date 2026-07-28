import { describe, it, expect } from 'vitest';
import { getCallStateVisual, CALL_STATE_ACCENT_CHECKLIST } from './callStateAccent';
import { colors } from './theme';

describe('dark-theme call state accents (UI regression checklist)', () => {
  const cases: Array<{ state: string; transferring?: boolean; expect: string; label: string }> = [
    { state: 'ringing-in',  expect: colors.avaCyan,      label: 'Incoming · Lemtel' },
    { state: 'ringing-out', expect: colors.avaCyan,      label: 'Outgoing · Lemtel' },
    { state: 'active',      expect: colors.lemtelBlue,   label: 'In call' },
    { state: 'held',        expect: colors.warning,      label: 'On hold' },
    { state: 'active', transferring: true, expect: colors.avaViolet, label: 'Transferring' },
    { state: 'ended',       expect: colors.mutedSilver,  label: 'Call ended' },
  ];

  it.each(cases)('$state → accent $expect, label $label', ({ state, transferring, expect: accent, label }) => {
    const v = getCallStateVisual(state, { transferring });
    expect(v.accent).toBe(accent);
    expect(v.label).toBe(label);
  });

  it('checklist snapshot is stable', () => {
    expect(CALL_STATE_ACCENT_CHECKLIST).toMatchInlineSnapshot(`
      {
        "active": "${colors.lemtelBlue}",
        "ended": "${colors.mutedSilver}",
        "held": "${colors.warning}",
        "idle": "${colors.mutedSilver}",
        "ringing-in": "${colors.avaCyan}",
        "ringing-out": "${colors.avaCyan}",
        "transfer": "${colors.avaViolet}",
      }
    `);
  });
});
