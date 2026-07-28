/**
 * Single source of truth for call-state accent colors used across the
 * mobile UI (ActiveCallSheet, IncomingCallSheet, status pills, etc.).
 * Keeping this pure makes it trivial to snapshot-test the dark-theme
 * accents for every call state.
 */
import { colors } from './theme';

export type CallStateKey =
  | 'ringing-in'
  | 'ringing-out'
  | 'active'
  | 'held'
  | 'transfer'
  | 'ended'
  | 'idle';

export interface CallStateVisual {
  key: CallStateKey;
  label: string;
  accent: string;
}

export function getCallStateVisual(
  callState: string | undefined,
  flags: { transferring?: boolean } = {},
): CallStateVisual {
  if (flags.transferring) {
    return { key: 'transfer', label: 'Transferring', accent: colors.avaViolet };
  }
  switch (callState) {
    case 'ringing-in':
      return { key: 'ringing-in', label: 'Incoming · Lemtel', accent: colors.avaCyan };
    case 'ringing-out':
      return { key: 'ringing-out', label: 'Outgoing · Lemtel', accent: colors.avaCyan };
    case 'held':
      return { key: 'held', label: 'On hold', accent: colors.warning };
    case 'active':
      return { key: 'active', label: 'In call', accent: colors.lemtelBlue };
    case 'ended':
      return { key: 'ended', label: 'Call ended', accent: colors.mutedSilver };
    default:
      return { key: 'idle', label: 'Lemtel', accent: colors.mutedSilver };
  }
}

/**
 * Regression checklist — every state below MUST keep its dark-theme
 * accent. Used by callStateAccent.test.ts and by manual QA scripts.
 */
export const CALL_STATE_ACCENT_CHECKLIST: Record<CallStateKey, string> = {
  'ringing-in': colors.avaCyan,
  'ringing-out': colors.avaCyan,
  active: colors.lemtelBlue,
  held: colors.warning,
  transfer: colors.avaViolet,
  ended: colors.mutedSilver,
  idle: colors.mutedSilver,
};
