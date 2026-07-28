import type React from 'react';
/**
 * Lemtel AI Phone — Mobile design tokens.
 *
 * The `colors` export is a runtime Proxy that resolves each token against
 * the *current* theme (dark by default, light when
 * `document.documentElement.dataset.theme === 'light'`). This lets every
 * `colors.textIce` style read pick the correct value without refactoring
 * every screen import. Components that need reactive re-render on theme
 * toggle should additionally call `useThemeColors()` from ThemeContext.
 */
export const darkColors: Record<string, string> = {
  // Dark foundation
  midnight:   '#0A1429',
  midnight2:  '#0E1B3D',
  graphite:   'rgba(255,255,255,0.06)',
  graphite2:  'rgba(255,255,255,0.10)',
  // Brand
  lemtelBlue: '#0023e6',
  blueGlow:   '#2a4dff',
  signalGold: '#E0A800',
  goldSoft:   '#F2C94C',
  // AI shimmer
  avaCyan:    '#23d6ff',
  avaViolet:  '#7A4CFF',
  // Text on dark
  textIce:    '#E8EEFB',
  textSub:    '#B0BACC',
  mutedSilver:'#7C8AA8',
  // Lines
  border:     'rgba(255,255,255,0.08)',
  borderGold: 'rgba(255,196,0,0.45)',
  borderAI:   'rgba(122,76,255,0.40)',
  // State
  danger:     '#EF4444',
  success:    '#10B981',
  warning:    '#F59E0B',
};

export type ColorTokens = typeof darkColors;

/** Light-mode parallel palette — same keys, readable on white surfaces. */
export const lightColors: ColorTokens = {
  midnight:   '#ffffff',
  midnight2:  '#f5f7ff',
  graphite:   '#ffffff',
  graphite2:  '#f0f4ff',
  lemtelBlue: '#0023e6',
  blueGlow:   '#2a4dff',
  signalGold: '#b8860b',
  goldSoft:   '#d4a017',
  avaCyan:    '#0891b2',
  avaViolet:  '#7c3aed',
  textIce:    '#0d1426',
  textSub:    '#3a4560',
  mutedSilver:'#6b7a99',
  border:     'rgba(0,0,0,0.10)',
  borderGold: 'rgba(184,134,11,0.45)',
  borderAI:   'rgba(124,58,237,0.40)',
  danger:     '#dc2626',
  success:    '#16a34a',
  warning:    '#d97706',
};

function currentPalette(): ColorTokens {
  if (typeof document !== 'undefined') {
    const t =
      document.documentElement.getAttribute('data-theme') ||
      document.body.getAttribute('data-theme');
    if (t === 'light') return lightColors;
  }
  return darkColors;
}

/**
 * Runtime-resolving palette. Always read tokens via `colors.X`, never
 * destructure at module top-level, or the value will freeze to dark.
 */
export const colors: ColorTokens = new Proxy({} as ColorTokens, {
  get(_t, prop: string) {
    return (currentPalette() as any)[prop];
  },
  has(_t, prop: string) {
    return prop in darkColors;
  },
  ownKeys() {
    return Reflect.ownKeys(darkColors);
  },
  getOwnPropertyDescriptor(_t, prop: string) {
    return {
      enumerable: true,
      configurable: true,
      value: (currentPalette() as any)[prop],
    };
  },
}) as ColorTokens;

export const gradients = {
  app:    `radial-gradient(1000px 620px at 6% -12%, rgba(0,35,230,0.32), transparent 62%), radial-gradient(780px 560px at 105% 105%, rgba(224,168,0,0.18), transparent 58%), linear-gradient(180deg, #060C1C 0%, #0A1429 52%, #0E1B3D 100%)`,
  call:   `linear-gradient(135deg, ${colors.lemtelBlue} 0%, ${colors.blueGlow} 50%, ${colors.signalGold} 140%)`,
  ai:     `linear-gradient(135deg, ${colors.avaViolet}, ${colors.avaCyan})`,
  card:   `linear-gradient(155deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.03) 100%)`,
  hero:   `linear-gradient(160deg, rgba(0,35,230,0.32) 0%, rgba(42,77,255,0.16) 45%, rgba(255,255,255,0.0) 100%)`,
  shiny:  `linear-gradient(135deg, rgba(255,255,255,0.10) 0%, rgba(255,255,255,0.04) 45%, rgba(255,255,255,0.08) 100%)`,
  shinyPrimary: `linear-gradient(135deg, #0023e6 0%, #2a4dff 55%, #6680ff 100%)`,
} as const;

export const radius = { sm: 10, md: 14, lg: 18, xl: 24, xxl: 30, pill: 999 } as const;
export const space  = { 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 7: 32, 8: 40 } as const;

export const font = {
  family: `'Inter', -apple-system, BlinkMacSystemFont, 'SF Pro Text', system-ui, sans-serif`,
  mono:   `'JetBrains Mono', 'SF Mono', ui-monospace, monospace`,
  xs: 10, sm: 11, base: 13, md: 15, lg: 18, xl: 22, xxl: 28, display: 34,
} as const;

export const shadow = {
  card: '0 12px 34px -18px rgba(0,0,0,0.6)',
  lift: '0 22px 48px -22px rgba(0,0,0,0.7)',
  gold: '0 14px 36px -16px rgba(224,168,0,0.40)',
  ai:   '0 14px 36px -16px rgba(122,76,255,0.40)',
  glass: '0 8px 24px -10px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.08)',
} as const;

export const glass = {
  surface: {
    background: gradients.card,
    border: `1px solid ${colors.border}`,
    backdropFilter: 'blur(18px) saturate(160%)',
    WebkitBackdropFilter: 'blur(18px) saturate(160%)',
    boxShadow: shadow.card,
    borderRadius: radius.lg,
  } as React.CSSProperties,
} as const;

/* ─────────────────────────────────────────────────────────────
   LIGHT THEME TOKENS
   Components can opt-in via useThemeTokens() but the bulk of
   light-mode visibility is handled by global CSS overrides in
   styles.css (body[data-theme="light"] selectors).
   ───────────────────────────────────────────────────────────── */
export const lightTheme = {
  background: '#f0f4ff',
  backgroundSecondary: '#e8eeff',
  surface: '#ffffff',
  surfaceHover: '#f5f7ff',

  textPrimary: '#0d1426',
  textSecondary: '#3a4560',
  textMuted: '#6b7a99',
  textDisabled: '#a0aabb',

  border: 'rgba(0,0,0,0.10)',
  borderFocus: '#0023e6',
  divider: 'rgba(0,0,0,0.06)',

  accent: '#0023e6',
  accentLight: '#e8eeff',
  accentText: '#ffffff',

  statusOnline: '#16a34a',
  statusBusy: '#dc2626',
  statusAway: '#d97706',
  statusOffline: '#9ca3af',

  cardBg: '#ffffff',
  cardBorder: 'rgba(0,35,230,0.12)',
  cardShadow: '0 2px 12px rgba(0,0,0,0.08)',

  inputBg: '#ffffff',
  inputBorder: 'rgba(0,0,0,0.15)',
  inputBorderFocus: '#0023e6',
  inputText: '#0d1426',
  inputPlaceholder: '#9ca3af',

  navBg: '#ffffff',
  navBorder: 'rgba(0,0,0,0.08)',
  navIconActive: '#0023e6',
  navIconInactive: '#6b7a99',
  navLabelActive: '#0023e6',
  navLabelInactive: '#6b7a99',
  navActiveBg: 'rgba(0,35,230,0.08)',

  btnPrimaryBg: '#0023e6',
  btnPrimaryText: '#ffffff',
  btnSecondaryBg: 'rgba(0,35,230,0.10)',
  btnSecondaryText: '#0023e6',
  btnSecondaryBorder: 'rgba(0,35,230,0.25)',
  btnDangerBg: '#fee2e2',
  btnDangerText: '#dc2626',

  headerBg: '#ffffff',
  headerBorder: 'rgba(0,0,0,0.08)',
  headerText: '#0d1426',
  headerShadow: '0 1px 8px rgba(0,0,0,0.08)',

  pillBg: 'rgba(0,35,230,0.10)',
  pillText: '#0023e6',
  pillBorder: 'rgba(0,35,230,0.20)',

  badgeSuccessBg: '#dcfce7', badgeSuccessText: '#16a34a',
  badgeErrorBg:   '#fee2e2', badgeErrorText:   '#dc2626',
  badgeWarningBg: '#fef9c3', badgeWarningText: '#854d0e',
  badgeInfoBg:    '#dbeafe', badgeInfoText:    '#1d4ed8',

  listItemBg: '#ffffff',
  listItemBorder: 'rgba(0,0,0,0.06)',
  listItemHover: '#f5f7ff',

  liveBadgeBg: '#dcfce7',
  liveBadgeText: '#16a34a',
  liveBadgeDot: '#16a34a',

  statTotal: '#0023e6',
  statAnswered: '#16a34a',
  statMissed: '#dc2626',
  statVoicemail: '#d97706',
  statRate: '#7c3aed',
  statDuration: '#0891b2',
  statActive: '#ea580c',
  statOnline: '#0d9488',
} as const;
export type LightTheme = typeof lightTheme;
