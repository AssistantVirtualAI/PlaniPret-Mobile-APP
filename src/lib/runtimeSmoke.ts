/**
 * Runtime smoke check (iOS / Android WebView).
 *
 * Confirms after boot that:
 *  1. #root actually contains rendered content (React committed a real tree)
 *  2. Tailwind is compiled — a utility class resolves AND the `--tw-` custom
 *     properties emitted by Tailwind's preflight are present.
 *
 * The result is exposed on `window.__PP_SMOKE__`, persisted to localStorage
 * (`pp_smoke_last`) and rendered by the in-app build diagnostics page.
 */

export interface SmokeResult {
  at: string;
  platform: string;
  rootHasContent: boolean;
  rootChildren: number;
  rootTextLength: number;
  tailwindUtility: boolean;
  tailwindVars: boolean;
  utilityProbe: string;
  buildId: string;
  sipGuard: string;
  passed: boolean;
  failures: string[];
}

const STORAGE_KEY = 'pp_smoke_last';

type SmokeWindow = Window & { __PP_SMOKE__?: SmokeResult };

function probeTailwindUtility(): { ok: boolean; actual: string } {
  try {
    const el = document.createElement('div');
    el.className = 'flex px-4';
    el.style.position = 'absolute';
    el.style.visibility = 'hidden';
    document.body.appendChild(el);
    const s = window.getComputedStyle(el);
    const actual = `display:${s.display};padding-left:${s.paddingLeft}`;
    const ok = s.display === 'flex' && s.paddingLeft === '16px';
    el.remove();
    return { ok, actual };
  } catch {
    return { ok: false, actual: 'probe_failed' };
  }
}

function probeTailwindVars(): boolean {
  try {
    const s = window.getComputedStyle(document.documentElement);
    // Tailwind preflight/ring utilities define --tw-* custom properties.
    if (s.getPropertyValue('--tw-ring-offset-width').trim() !== '') return true;
    const el = document.createElement('div');
    el.className = 'shadow-md';
    document.body.appendChild(el);
    const has = window.getComputedStyle(el).getPropertyValue('--tw-shadow').trim() !== '';
    el.remove();
    return has;
  } catch {
    return false;
  }
}

export function runRuntimeSmokeCheck(): SmokeResult {
  const root = document.getElementById('root');
  const rootChildren = root?.children.length ?? 0;
  const rootTextLength = (root?.textContent ?? '').trim().length;
  const rootHasContent = rootChildren > 0 && rootTextLength > 0;

  const utility = probeTailwindUtility();
  const tailwindVars = probeTailwindVars();

  const failures: string[] = [];
  if (!rootHasContent) failures.push('root_empty');
  if (!utility.ok) failures.push('tailwind_utility_missing');
  if (!tailwindVars) failures.push('tailwind_vars_missing');

  const result: SmokeResult = {
    at: new Date().toISOString(),
    platform:
      typeof window !== 'undefined' && window.location.protocol === 'capacitor:' ? 'capacitor' : 'web',
    rootHasContent,
    rootChildren,
    rootTextLength,
    tailwindUtility: utility.ok,
    tailwindVars,
    utilityProbe: utility.actual,
    buildId: (import.meta as any).env?.VITE_BUILD_ID ?? '—',
    sipGuard: 'reconnect-guard-v3-floor-3000',
    passed: failures.length === 0,
    failures,
  };

  try {
    (window as SmokeWindow).__PP_SMOKE__ = result;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(result));
  } catch {}

  if (result.passed) console.log('[PP][smoke] ✓ root rendered + Tailwind compiled', result.buildId, result.sipGuard);
  else console.error('[PP][smoke] ✗ startup smoke check failed:', failures.join(', '), result);

  return result;
}

export function getLastSmokeResult(): SmokeResult | null {
  try {
    const live = (window as SmokeWindow).__PP_SMOKE__;
    if (live) return live;
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as SmokeResult) : null;
  } catch {
    return null;
  }
}

/** Schedule the smoke check shortly after boot (once). */
export function scheduleRuntimeSmokeCheck(delayMs = 2500) {
  if (typeof window === 'undefined') return;
  window.setTimeout(() => {
    try {
      runRuntimeSmokeCheck();
    } catch (e) {
      console.warn('[PP][smoke] check threw', e);
    }
  }, delayMs);
}
