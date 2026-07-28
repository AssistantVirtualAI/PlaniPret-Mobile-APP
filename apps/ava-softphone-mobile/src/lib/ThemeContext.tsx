import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { darkColors, lightColors, type ColorTokens } from './theme';

type Mode = 'dark' | 'light';
type Ctx = { mode: Mode; toggle: () => void; setMode: (m: Mode) => void };

const ThemeCtx = createContext<Ctx>({ mode: 'dark', toggle: () => {}, setMode: () => {} });

const STORAGE_KEY = 'ava.theme.mode';

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = useState<Mode>(() => {
    try {
      const v = localStorage.getItem(STORAGE_KEY);
      if (v === 'light' || v === 'dark') return v;
    } catch {}
    return 'dark';
  });

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, mode); } catch {}
    document.documentElement.setAttribute('data-theme', mode);
    document.body.setAttribute('data-theme', mode);
  }, [mode]);

  const value = useMemo<Ctx>(() => ({
    mode,
    setMode,
    toggle: () => setMode((m) => (m === 'dark' ? 'light' : 'dark')),
  }), [mode]);

  return <ThemeCtx.Provider value={value}>{children}</ThemeCtx.Provider>;
}

export function useTheme() {
  return useContext(ThemeCtx);
}

/**
 * Returns the active color palette and re-renders the component when the
 * user toggles dark ↔ light. Prefer this over importing `colors` directly
 * when you need reactive style updates on theme change.
 */
export function useThemeColors(): ColorTokens {
  const { mode } = useTheme();
  return mode === 'light' ? lightColors : darkColors;
}
