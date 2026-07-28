/**
 * Re-render guarantee — toggling the theme MUST update every component that
 * consumes `useThemeColors()`. A bug here would leave stale dark colors
 * painted on a light surface (the exact regression that motivated this).
 *
 * We mount many independent probes (simulating real screens like Home,
 * History, Chat, Settings, BottomTabs), flip the theme once, and assert
 * every probe re-rendered with the new palette atomically.
 */
import { describe, it, expect } from 'vitest';
import React from 'react';
import { act, render } from '@testing-library/react';
import { ThemeProvider, useTheme, useThemeColors } from '../lib/ThemeContext';
import { darkColors, lightColors } from '../lib/theme';

function Probe({ id, log }: { id: string; log: Record<string, string[]> }) {
  const c = useThemeColors();
  (log[id] ||= []).push(c.textIce);
  return <span data-testid={`probe-${id}`} style={{ color: c.textIce }} />;
}

function Toggle() {
  const { toggle } = useTheme();
  return <button data-testid="toggle" onClick={toggle} />;
}

describe('useThemeColors re-render guarantee', () => {
  it('updates every consumer atomically when data-theme flips to light', () => {
    const screens = ['home', 'history', 'chat', 'settings', 'bottomNav', 'contacts'];
    const log: Record<string, string[]> = {};

    const { getByTestId } = render(
      <ThemeProvider>
        {screens.map((id) => <Probe key={id} id={id} log={log} />)}
        <Toggle />
      </ThemeProvider>,
    );

    // Initial render: all dark.
    for (const id of screens) {
      expect(log[id][log[id].length - 1]).toBe(darkColors.textIce);
    }

    act(() => { getByTestId('toggle').click(); });

    // After toggle: every probe re-rendered with the LIGHT palette.
    for (const id of screens) {
      expect(log[id][log[id].length - 1]).toBe(lightColors.textIce);
    }

    // And the DOM attribute is in sync — no stale paint. jsdom normalises
    // inline `color` to rgb(), so we compare via getComputedStyle.
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    for (const id of screens) {
      const el = getByTestId(`probe-${id}`);
      expect(getComputedStyle(el).color).toBe('rgb(13, 20, 38)'); // #0d1426
    }
  });
});
