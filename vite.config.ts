import { defineConfig, Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import fs from 'fs';

const buildId = `${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}Z`;
const buildTime = new Date().toISOString();

function readCapacitorVersion(): string {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'node_modules/@capacitor/core/package.json'), 'utf8'));
    return pkg.version ?? 'unknown';
  } catch {
    return 'unknown';
  }
}

const capacitorVersion = readCapacitorVersion();

/**
 * Vite plugin: patch the minified vendor-react bundle to swallow empty-object
 * errors in React's commitRoot re-throw mechanism.
 *
 * Background:
 *   On iOS WKWebView cold boot, some component or third-party hook throws `{}`
 *   (an empty object) during the render or commit phase. React's commitRoot
 *   captures this via Pa() (createRootErrorUpdate) and re-throws it at line
 *   `if(Xr)throw Xr=!1,e=Ou,Ou=null,e` — which crashes the entire app with a
 *   blank screen because the throw escapes all ErrorBoundaries.
 *
 *   This plugin replaces that throw with a conditional: real errors are still
 *   thrown (app-level crash is preserved for genuine bugs), but empty-object
 *   artefacts from Capacitor/WKWebView native startup are silently swallowed.
 *
 *   The patch is applied as a string replacement on the final minified output,
 *   so it survives tree-shaking and works regardless of which component caused
 *   the original throw.
 */
function patchReactCommitRootPlugin(): Plugin {
  const PATTERN = 'if(Xr)throw Xr=!1,e=Ou,Ou=null,e';
  const REPLACEMENT =
    'if(Xr){Xr=!1;var _ppE=Ou;Ou=null;' +
    'if(_ppE&&typeof _ppE==="object"&&' +
    'Object.keys(_ppE).length===0&&' +
    'String(_ppE.message||"").trim()==="")' +
    '{console.warn("[PP] Swallowed empty React root error (iOS WKWebView artefact)")}' +
    'else{throw _ppE}}';

  return {
    name: 'patch-react-commit-root',
    enforce: 'post',
    generateBundle(_options, bundle) {
      for (const [fileName, chunk] of Object.entries(bundle)) {
        if (chunk.type !== 'chunk') continue;
        if (!fileName.includes('vendor-react')) continue;
        if (!chunk.code.includes(PATTERN)) {
          console.warn(`[patch-react-commit-root] Pattern not found in ${fileName} — skipping patch`);
          continue;
        }
        chunk.code = chunk.code.replace(PATTERN, REPLACEMENT);
        console.log(`[patch-react-commit-root] ✅ Patched ${fileName}`);
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), patchReactCommitRootPlugin()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      // Replace framer-motion with a lightweight shim on mobile.
      // iOS WKWebView GPU/memory crashes with the full library.
      'framer-motion': path.resolve(__dirname, './src/lib/motion-shim.tsx'),
      // Stub livekit-client — drops ~1.17 MB from the bundle.
      'livekit-client': path.resolve(__dirname, './src/lib/livekit-shim.ts'),
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2015',
    chunkSizeWarningLimit: 600,
    sourcemap: true,
    // Skip gzip-size reporting per chunk — saves ~20-40s on large bundles.
    reportCompressedSize: false,
    rollupOptions: {
      output: {
        // NOTE: vendor-misc is intentionally removed — it caused a circular
        // dependency (vendor-misc -> vendor-react -> vendor-misc) that crashed
        // the app on iOS. Rollup will handle remaining node_modules automatically.
        manualChunks(id) {
          if (id.includes('node_modules/react/') || id.includes('node_modules/react-dom/') || id.includes('node_modules/scheduler/')) return 'vendor-react';
          if (id.includes('node_modules/react-router')) return 'vendor-router';
          if (id.includes('@supabase')) return 'vendor-supabase';
          if (id.includes('recharts') || id.includes('d3-')) return 'vendor-charts';
          if (id.includes('@radix-ui')) return 'vendor-radix';
          if (id.includes('lucide-react')) return 'vendor-lucide';
          if (id.includes('@tanstack')) return 'vendor-tanstack';
          if (id.includes('jssip') || id.includes('sip.js')) return 'vendor-sip';
          if (id.includes('framer-motion')) return 'vendor-motion';
          // vendor-misc intentionally omitted — causes circular deps with vendor-react
        },
      },
    },
  },
  base: './',
  server: {
    port: 5175,
    strictPort: true,
  },
  define: {
    __APP_ID__: JSON.stringify('planipret'),
    'import.meta.env.VITE_BUILD_ID': JSON.stringify(buildId),
    'import.meta.env.VITE_BUILD_TIME': JSON.stringify(buildTime),
    'import.meta.env.VITE_CAPACITOR_VERSION': JSON.stringify(capacitorVersion),
  },
});
