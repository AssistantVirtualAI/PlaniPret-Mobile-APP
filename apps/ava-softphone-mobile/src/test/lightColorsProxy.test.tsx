/**
 * Regression tests for the runtime-resolving `colors` Proxy and the
 * `useThemeColors()` hook. Together they guarantee that screens which
 * import `colors` directly never paint dark-mode tokens onto the
 * light-mode surface (the root cause of the "invisible text" bug).
 *
 *  ✓ dark default
 *  ✓ switches to light palette when `data-theme="light"` is set on <html>
 *  ✓ every dark token has a light counterpart (no missing keys)
 *  ✓ light tokens are readable on white (textIce, mutedSilver, textSub)
 *  ✓ useThemeColors() returns the right palette + re-renders on toggle
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, act } from '@testing-library/react';
import React from 'react';
import { colors, darkColors, lightColors } from '../lib/theme';
import { ThemeProvider, useTheme, useThemeColors } from '../lib/ThemeContext';

afterEach(() => {
  document.documentElement.removeAttribute('data-theme');
  document.body.removeAttribute('data-theme');
});

describe('colors Proxy', () => {
  it('returns dark tokens by default', () => {
    expect(colors.textIce).toBe(darkColors.textIce);
    expect(colors.midnight).toBe(darkColors.midnight);
  });

  it('returns light tokens when html[data-theme="light"]', () => {
    document.documentElement.setAttribute('data-theme', 'light');
    expect(colors.textIce).toBe(lightColors.textIce);
    expect(colors.mutedSilver).toBe(lightColors.mutedSilver);
    expect(colors.midnight).toBe('#ffffff');
  });

  it('has the same keys in dark and light palettes', () => {
    expect(Object.keys(lightColors).sort()).toEqual(Object.keys(darkColors).sort());
  });

  it('keeps readable text tokens for light surfaces', () => {
    // Anything starting with #E or #B is light-on-light and invisible.
    for (const key of ['textIce', 'textSub', 'mutedSilver'] as const) {
      const v = lightColors[key].toLowerCase();
      expect(v).not.toMatch(/^#e[0-9a-f]/);
      expect(v).not.toMatch(/^#b[0-9a-f]/);
    }
  });
});

describe('useThemeColors()', () => {
  function Probe({ onRender }: { onRender: (c: ReturnType<typeof useThemeColors>) => void }) {
    const c = useThemeColors();
    onRender(c);
    return <span style={{ color: c.textIce }}>x</span>;
  }

  function Toggle() {
    const { mode, toggle } = useTheme();
    return <button data-testid="toggle" data-mode={mode} onClick={toggle}>t</button>;
  }

  it('returns the dark palette by default and switches on toggle', () => {
    const seen: string[] = [];
    const { getByTestId } = render(
      <ThemeProvider>
        <Probe onRender={(c) => seen.push(c.textIce)} />
        <Toggle />
      </ThemeProvider>,
    );
    expect(seen[seen.length - 1]).toBe(darkColors.textIce);

    act(() => { getByTestId('toggle').click(); });
    expect(seen[seen.length - 1]).toBe(lightColors.textIce);
  });
});
