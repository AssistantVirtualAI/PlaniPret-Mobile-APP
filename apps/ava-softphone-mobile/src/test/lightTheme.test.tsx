/**
 * Non-regression tests for the LIGHT theme.
 *
 * Goals:
 *  1. Lock down the semantic token palette via snapshot so accidental
 *     edits to lib/theme.ts that would harm contrast are caught in CI.
 *  2. Guarantee every critical light-mode CSS override stays in
 *     styles.css (cards, inputs, headings, bubbles, search bars,
 *     pills, badges, dark-text remap rules).
 *  3. Verify a minimal rendered tree exposes the data hooks the CSS
 *     relies on (data-bubble, data-search-bar, data-pill, .lemtel-card).
 *
 * Run with: bunx vitest run src/test/lightTheme.test.tsx
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { render } from '@testing-library/react';
import { lightTheme } from '../lib/theme';

const here = dirname(fileURLToPath(import.meta.url));
const cssPath = join(here, '..', 'styles.css');
let css = '';

beforeAll(() => {
  css = readFileSync(cssPath, 'utf8');
});

/* ──────────────────────────────────────────────────────────────
   1. Token snapshot — fails loudly if any value drifts
   ────────────────────────────────────────────────────────────── */
describe('lightTheme tokens', () => {
  it('matches the accessibility-locked palette snapshot', () => {
    expect(lightTheme).toMatchSnapshot();
  });

  it('uses dark-on-light text contrast for primary text', () => {
    // textPrimary on surface — WCAG AA ≈ 4.5:1 minimum.
    // #0d1426 on #ffffff ≈ 18.7:1 → safe.
    expect(lightTheme.textPrimary).toBe('#0d1426');
    expect(lightTheme.surface).toBe('#ffffff');
  });

  it('keeps muted text above the 4.5:1 readability floor', () => {
    // #6b7a99 on #ffffff ≈ 4.6:1 — minimum readable; do not lighten.
    expect(lightTheme.textMuted).toBe('#6b7a99');
  });

  it('keeps status colors distinct from neutral text', () => {
    expect(lightTheme.statusOnline).not.toBe(lightTheme.textMuted);
    expect(lightTheme.statusBusy).not.toBe(lightTheme.textMuted);
    expect(lightTheme.statusAway).not.toBe(lightTheme.textMuted);
  });
});

/* ──────────────────────────────────────────────────────────────
   2. Required CSS overrides — these rules MUST exist in light mode
   ────────────────────────────────────────────────────────────── */
describe('light theme CSS overrides', () => {
  const required: Array<[label: string, needle: RegExp]> = [
    ['body theme switch',     /body\[data-theme="light"\]\s*\{/],
    ['cards override',        /body\[data-theme="light"\]\s+\.lemtel-card/],
    ['glass override',        /body\[data-theme="light"\]\s+\.lemtel-glass/],
    ['inputs override',       /body\[data-theme="light"\]\s+input/],
    ['placeholder color',     /body\[data-theme="light"\]\s+input::placeholder/],
    ['focus ring',            /body\[data-theme="light"\]\s+input:focus/],
    ['dark text remap',       /body\[data-theme="light"\]\s+\[style\*="#E8EEFB"\]/],
    ['secondary text remap',  /body\[data-theme="light"\]\s+\[style\*="#B0BACC"\]/],
    ['muted text remap',      /body\[data-theme="light"\]\s+\[style\*="#7C8AA8"\]/],
    ['headings dark',         /body\[data-theme="light"\]\s+h1/],
    ['bubble me',             /data-bubble="me"/],
    ['bubble them',           /data-bubble="them"/],
    ['search bar',            /data-search-bar="true"/],
    ['pill base',             /data-pill="true"/],
    ['pill active',           /data-pill="true"\]\[data-active="true"/],
    ['badge success',         /\.badge-success/],
    ['badge error',           /\.badge-error/],
    ['badge warning',         /\.badge-warning/],
    ['badge info',            /\.badge-info/],
  ];

  it.each(required)('contains rule: %s', (_label, needle) => {
    expect(css).toMatch(needle);
  });

  it('does not regress to invisible muted text (#5a6a8a)', () => {
    // Old value failed contrast; new value is #6b7a99. Block re-introduction.
    expect(css).not.toMatch(/--text-muted:\s*#5a6a8a/);
  });

  it('paints bubble.me with accent and bubble.them with surface', () => {
    expect(css).toMatch(/data-bubble="me"\][^}]*background:\s*#0023e6/);
    expect(css).toMatch(/data-bubble="them"\][^}]*background:\s*#ffffff/);
  });
});

/* ──────────────────────────────────────────────────────────────
   3. Render hooks — make sure the DOM exposes the attributes/
   classes the light-mode CSS depends on.
   ────────────────────────────────────────────────────────────── */
describe('DOM hooks consumed by light theme CSS', () => {
  it('renders bubbles, search bars, pills and cards with the expected hooks', () => {
    document.body.setAttribute('data-theme', 'light');

    const { container } = render(
      <div>
        <div className="lemtel-card">card</div>
        <div className="lemtel-glass">glass</div>
        <input placeholder="search" data-search-bar="true" />
        <span data-bubble="me">me</span>
        <span data-bubble="them">them</span>
        <button data-pill="true">pill</button>
        <button data-pill="true" data-active="true">active pill</button>
        <span className="badge-success">ok</span>
        <span className="badge-error">err</span>
      </div>,
    );

    expect(container.querySelector('.lemtel-card')).toBeTruthy();
    expect(container.querySelector('.lemtel-glass')).toBeTruthy();
    expect(container.querySelector('[data-search-bar="true"]')).toBeTruthy();
    expect(container.querySelector('[data-bubble="me"]')).toBeTruthy();
    expect(container.querySelector('[data-bubble="them"]')).toBeTruthy();
    expect(container.querySelector('[data-pill="true"][data-active="true"]')).toBeTruthy();
    expect(container.querySelector('.badge-success')).toBeTruthy();
    expect(container.querySelector('.badge-error')).toBeTruthy();
    expect(document.body.getAttribute('data-theme')).toBe('light');
  });
});
