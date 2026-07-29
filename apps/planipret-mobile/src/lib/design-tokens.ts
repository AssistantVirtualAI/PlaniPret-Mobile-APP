/**
 * Planiprêt — Design tokens (inlined for standalone build).
 * Source of truth previously at /shared/planipret-design-tokens/tokens.ts;
 * inlined here so apps/planipret-mobile builds without workspace deps.
 */

// ---------- Dark theme (web / .planipret-scope) ----------
export const planipretDarkColors = {
  bgBase: "#060D1A",
  bgSurface: "#0A1628",
  bgElevated: "#0D1F35",
  bgDeep: "#040B16",
  bgBorder: "#0A1E35",
  bgBorder2: "#0E2A45",
  brandAccent: "#2E9BDC",
  brandAccent2: "#1A4A8A",
  success: "#00D4AA",
  agent: "#9B7FE8",
  warning: "#F5A623",
  danger: "#E84C4C",
  textPrimary: "#E8EDF5",
  textSecondary: "#8FA8C0",
  textMuted: "#4A7FA5",
  textFaint: "#2A4A6A",
} as const;

// ---------- Light theme (mobile / .planipret-mobile-scope) ----------
export const planipretLightColors = {
  bgBase: "#F7F9FC",
  bgSurface: "#FFFFFF",
  bgElevated: "#F0F4F9",
  bgDeep: "#FFFFFF",
  bgBorder: "#E2E8F0",
  bgBorder2: "#DCE3EC",
  brandAccent: "#3B6FA0",
  brandAccent2: "#1E3A5F",
  success: "#0D7A5F",
  agent: "#6C5CE7",
  warning: "#C9A84C",
  danger: "#B23A48",
  textPrimary: "#0F1B3D",
  textSecondary: "#324867",
  textMuted: "#5A6B85",
  textFaint: "#94A3B8",
} as const;

// ---------- Typography ----------
export const planipretTypography = {
  fontDisplay: "'Urbanist', 'Inter', system-ui, sans-serif",
  fontBody: "'Epilogue', 'Inter', system-ui, sans-serif",
  fontUi: "'DM Sans', system-ui, sans-serif",
  fontMono: "'Fira Code', ui-monospace, monospace",
  letterSpacingTight: "-0.018em",
  letterSpacingEyebrow: "0.14em",
} as const;

// ---------- Spacing (4px base) ----------
export const planipretSpacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  "2xl": 24,
  "3xl": 32,
  "4xl": 40,
  "5xl": 56,
} as const;

// ---------- Radii ----------
export const planipretRadii = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 18,
  pill: 999,
} as const;

// ---------- Shadows (light theme) ----------
export const planipretShadows = {
  sm: "0 1px 2px rgba(15,27,61,0.04), 0 1px 1px rgba(15,27,61,0.03)",
  md: "0 8px 24px -12px rgba(15,27,61,0.12), 0 2px 6px -2px rgba(15,27,61,0.06)",
  lg: "0 24px 48px -16px rgba(15,27,61,0.18)",
} as const;

export type PlaniPretColorTokens = typeof planipretDarkColors;
export type PlaniPretTypographyTokens = typeof planipretTypography;
