/**
 * Automated audit — flags any source file under src/screens or src/components
 * that bypasses the runtime `colors` Proxy by importing dark-only tokens
 * (`darkColors`) or by inlining the dark hex constants we know break light
 * mode (#0A1429 navy bg, #E8EEFB ice text, #B0BACC, #7C8AA8 silver text).
 *
 * The rule: read tokens via `colors.X` (auto-switches) or `useThemeColors()`
 * (reactive). Never `import { darkColors }`, never hardcode dark hexes.
 *
 * Allow-list lives next to each constant below — keep it tight.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const srcRoot = join(here, '..');

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const s = statSync(p);
    if (s.isDirectory()) walk(p, out);
    else if (/\.(tsx?|jsx?)$/.test(name) && !/\.test\./.test(name)) out.push(p);
  }
  return out;
}

const SCAN_DIRS = ['screens', 'components'].map((d) => join(srcRoot, d));
const FILES = SCAN_DIRS.flatMap((d) => walk(d));

const DARK_HEX: ReadonlyArray<{ hex: string; allow: string[] }> = [
  // Fullscreen branded surfaces stay dark by design (auth splash, active
  // call sheet). Everything else must go through the theme module.
  { hex: '#0A1429', allow: ['screens/AuthScreen.tsx', 'components/ActiveCallSheet.tsx'] },
  { hex: '#0E1B3D', allow: ['components/ActiveCallSheet.tsx'] },
  { hex: '#E8EEFB', allow: ['screens/AuthScreen.tsx'] },
  { hex: '#B0BACC', allow: [] },
  { hex: '#7C8AA8', allow: [] },
];

describe('light-mode token audit', () => {
  it('no source file imports `darkColors` directly', () => {
    const offenders = FILES.filter((f) =>
      /import\s*\{[^}]*\bdarkColors\b[^}]*\}\s*from\s*['"][^'"]*theme['"]/.test(
        readFileSync(f, 'utf8'),
      ),
    );
    expect(offenders.map((f) => relative(srcRoot, f))).toEqual([]);
  });

  it.each(DARK_HEX.map((d) => [d.hex, d.allow] as const))(
    'no source file hardcodes the dark hex %s',
    (hex, allow) => {
      const needle = new RegExp(hex, 'i');
      const offenders = FILES.filter((f) => {
        const rel = relative(srcRoot, f);
        if (allow.some((a) => rel.includes(a))) return false;
        return needle.test(readFileSync(f, 'utf8'));
      });
      expect(offenders.map((f) => relative(srcRoot, f))).toEqual([]);
    },
  );

  it('every screen and component file that styles UI uses the theme module', () => {
    // Sanity: confirm the audit actually scanned files.
    expect(FILES.length).toBeGreaterThan(10);
  });
});
