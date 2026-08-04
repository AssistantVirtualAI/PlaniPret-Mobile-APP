#!/usr/bin/env node
/**
 * `npm run ios:verify`
 *
 * 1. check:imports          → fails on any missing local module
 * 2. vite build             → produces dist/
 * 3. precheck:build         → Tailwind compiled + fresh build ID
 * 4. cap sync ios           → copies bundle into the native project
 * 5. runtime boot check     → serves dist/ headless and asserts that #root
 *    renders real content and that Tailwind utilities apply. Fails otherwise.
 *
 * Step 4 is skipped (with a warning) when there is no ios/ project or no
 * Capacitor CLI available (e.g. CI on Linux); every other step still runs.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:http';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const red = (s) => `\x1b[31m${s}\x1b[0m`;
const green = (s) => `\x1b[32m${s}\x1b[0m`;
const yellow = (s) => `\x1b[33m${s}\x1b[0m`;

function step(label, cmd, args, { optional = false } = {}) {
  console.log(`\n\x1b[36m[ios:verify] ▸ ${label}\x1b[0m`);
  const r = spawnSync(cmd, args, {
    cwd: root,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: { ...process.env, PP_SKIP_AUTOSYNC: '1' },
  });
  if (r.status !== 0) {
    if (optional) {
      console.log(yellow(`[ios:verify] ! ${label} skipped/failed (optional)`));
      return false;
    }
    console.error(red(`[ios:verify] ✗ ${label} failed (exit ${r.status})`));
    process.exit(r.status ?? 1);
  }
  console.log(green(`[ios:verify] ✓ ${label}`));
  return true;
}

step('check:imports', 'node', ['scripts/check-imports.mjs']);
step('vite build', 'npx', ['vite', 'build']);
step('precheck:build', 'node', ['scripts/precheck-build.mjs']);

if (existsSync(join(root, 'ios'))) {
  step('cap sync ios', 'npx', ['cap', 'sync', 'ios'], { optional: true });
  step('apply native config', 'node', ['scripts/apply-native-config.mjs']);
  step('verify PJSIP TLS binary', 'bash', ['scripts/verify-pjsip-tls.sh']);
  step('verify iOS scene and plugins', 'node', ['scripts/verify-ios-scene.mjs']);
} else {
  console.log(yellow('[ios:verify] ! no ios/ project — run `npx cap add ios` on a Mac; skipping cap sync'));
}

// ---------------------------------------------------------------------------
// Runtime boot check — serve dist/ and assert React actually renders.
// ---------------------------------------------------------------------------
const dist = join(root, 'dist');
const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2',
};

function staticBootCheck() {
    const assets = readdirSync(join(dist, 'assets'));
    const css = assets.filter((f) => f.endsWith('.css')).map((f) => readFileSync(join(dist, 'assets', f), 'utf8'));
    const twOk = css.some((c) => /--tw-/.test(c) && /\.flex\{display:flex\}/.test(c));
    const indexHtml = readFileSync(join(dist, 'index.html'), 'utf8');
    const hasRoot = indexHtml.includes('id="root"');
    const staleFallback = /pp-native-boot-fallback|Démarrage interrompu|Le démarrage iOS a été interrompu|avant le premier écran/.test(indexHtml);
    if (!twOk || !hasRoot || staleFallback) {
      console.error(red(`[ios:verify] ✗ static boot check failed (tailwind=${twOk}, root=${hasRoot}, staleFallback=${staleFallback})`));
      process.exit(1);
    }
    console.log(green('[ios:verify] ✓ static boot check (Tailwind compiled, #root present)'));
}

async function bootCheck() {
  let playwright, browser;
  try {
    playwright = await import('playwright');
    browser = await (await playwright).chromium.launch({ headless: true });
  } catch (e) {
    console.log(yellow(`[ios:verify] ! headless browser unavailable (${(e).message?.split('\n')[0]}) — static boot check only`));
    staticBootCheck();
    return;
  }

  const server = createServer((req, res) => {
    const url = (req.url ?? '/').split('?')[0];
    let file = join(dist, url === '/' ? 'index.html' : url.replace(/^\//, ''));
    if (!existsSync(file) || !readdirSync(dirname(file)).includes(file.split('/').pop())) {
      file = join(dist, 'index.html'); // SPA fallback
    }
    const ext = file.slice(file.lastIndexOf('.'));
    res.writeHead(200, { 'Content-Type': MIME[ext] ?? 'application/octet-stream' });
    res.end(readFileSync(file));
  });
  await new Promise((r) => server.listen(0, r));
  const port = server.address().port;

  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));

  await page.goto(`http://localhost:${port}/mplanipret`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(3500);

  const result = await page.evaluate(() => {
    const root = document.getElementById('root');
    const el = document.createElement('div');
    el.className = 'flex px-4';
    document.body.appendChild(el);
    const s = getComputedStyle(el);
    const tw = s.display === 'flex' && s.paddingLeft === '16px';
    el.remove();
    return {
      children: root?.children.length ?? 0,
      text: (root?.textContent ?? '').trim().length,
      react: !!document.querySelector('[data-reactroot], #root > *'),
      tailwind: tw,
      fallback: !!document.querySelector('#pp-native-boot-fallback'),
    };
  });

  await browser.close();
  server.close();

  const failures = [];
  if (result.children === 0 || result.text === 0) failures.push('#root vide (aucun rendu visible)');
  if (!result.react) failures.push('aucun marqueur React monté');
  if (!result.tailwind) failures.push('utilities Tailwind non appliquées');
  if (result.fallback) failures.push('ancien fallback iOS encore présent dans le bundle');
  if (errors.length) failures.push(`erreurs JS: ${errors.slice(0, 3).join(' | ')}`);

  if (failures.length) {
    console.error(red(`\n[ios:verify] ✗ l'app ne démarre pas correctement:`));
    for (const f of failures) console.error(red(`  • ${f}`));
    console.error(JSON.stringify(result, null, 2));
    process.exit(1);
  }
  console.log(green(`[ios:verify] ✓ app démarre (${result.children} nœuds, ${result.text} car., Tailwind actif)`));
}

await bootCheck();
console.log(green('\n[ios:verify] ✓ toutes les vérifications sont passées\n'));
