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
 * Vite plugin: patch the minified vendor-react bundle to fully neutralise
 * empty-object errors on iOS WKWebView cold boot.
 *
 * TWO patches are applied:
 *
 * PATCH 1 — Pa() (createRootErrorUpdate):
 *   Pa() is called when an error escapes all ErrorBoundaries and reaches the
 *   React root. It sets payload={element:null} which UNMOUNTS the entire tree,
 *   then schedules a callback that sets Xr=true (triggering the commitRoot
 *   re-throw). On iOS, the error value is {} (empty object) — a WKWebView
 *   native startup artefact. We intercept Pa() early: if the error value is an
 *   empty object, we skip the unmount payload and skip setting Xr, so React
 *   keeps the tree mounted and never reaches the re-throw.
 *
 * PATCH 2 — commitRoot re-throw (safety net):
 *   Even if Patch 1 is bypassed (e.g. Xr was already true from another path),
 *   the final `if(Xr)throw` is replaced with a conditional that swallows {}
 *   errors and throws real errors normally.
 *
 * Both patches are applied as string replacements on the final minified output.
 */
function patchReactCommitRootPlugin(): Plugin {
  // ── Patch 1: Pa() — prevent unmount + Xr flag for empty-object errors ──
  const PA_PATTERN =
    'function Pa(e,t,n){n=Be(-1,n),n.tag=3,n.payload={element:null};var r=t.value;return n.callback=function(){Xr||(Xr=!0,Ou=r),Eu(e,t)},n}';
  const PA_REPLACEMENT =
    'function Pa(e,t,n){' +
    'var _ppV=t&&t.value;' +
    'if(_ppV&&typeof _ppV==="object"&&Object.keys(_ppV).length===0&&String(_ppV.message||"").trim()===""){' +
    // Empty-object error: create a no-op update that keeps the tree mounted
    'n=Be(-1,n);n.tag=3;' +
    // payload as function: return current memoized state (keep tree as-is)
    'n.payload=function(){return e.memoizedState};' +
    'n.callback=function(){console.warn("[PP] Pa: swallowed empty root error — tree kept mounted")};' +
    'return n}' +
    // Real error: original behaviour
    'n=Be(-1,n),n.tag=3,n.payload={element:null};var r=t.value;return n.callback=function(){Xr||(Xr=!0,Ou=r),Eu(e,t)},n}';

  // ── Patch 2: commitRoot re-throw — safety net ──
  const THROW_PATTERN = 'if(Xr)throw Xr=!1,e=Ou,Ou=null,e';
  const THROW_REPLACEMENT =
    'if(Xr){Xr=!1;var _ppE=Ou;Ou=null;' +
    'if(_ppE&&typeof _ppE==="object"&&' +
    'Object.keys(_ppE).length===0&&' +
    'String(_ppE.message||"").trim()==="")' +
    '{console.warn("[PP] commitRoot: swallowed empty root error (safety net)")}' +
    'else{throw _ppE}}';

  return {
    name: 'patch-react-commit-root',
    enforce: 'post',
    generateBundle(_options, bundle) {
      for (const [fileName, chunk] of Object.entries(bundle)) {
        if (chunk.type !== 'chunk') continue;
        if (!fileName.includes('vendor-react')) continue;

        let patched = false;

        if (chunk.code.includes(PA_PATTERN)) {
          chunk.code = chunk.code.replace(PA_PATTERN, PA_REPLACEMENT);
          console.log(`[patch-react-commit-root] ✅ Patch 1 (Pa unmount guard) applied to ${fileName}`);
          patched = true;
        } else {
          console.warn(`[patch-react-commit-root] ⚠️  Patch 1 pattern not found in ${fileName}`);
        }

        if (chunk.code.includes(THROW_PATTERN)) {
          chunk.code = chunk.code.replace(THROW_PATTERN, THROW_REPLACEMENT);
          console.log(`[patch-react-commit-root] ✅ Patch 2 (commitRoot re-throw guard) applied to ${fileName}`);
          patched = true;
        } else {
          console.warn(`[patch-react-commit-root] ⚠️  Patch 2 pattern not found in ${fileName}`);
        }

        if (!patched) {
          console.warn(`[patch-react-commit-root] ⚠️  No patches applied to ${fileName} — React version may have changed`);
        }
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
