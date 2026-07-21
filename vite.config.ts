import { defineConfig, Plugin } from 'vite';
import react from '@vitejs/plugin-react-swc';
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
 * Applied only in production mode (minify !== false) because the patches
 * target minified variable names (Pa, Xr, Ou, Be, Eu) that only exist after
 * esbuild minification. In fast/dev mode the bundle is not minified, so the
 * patches are skipped automatically.
 *
 * PATCH 1 — Pa() (createRootErrorUpdate):
 *   Intercepts before React unmounts the tree. If the error is an empty object
 *   (iOS WKWebView artefact), the update keeps the tree mounted instead of
 *   setting payload={element:null}.
 *
 * PATCH 2 — commitRoot re-throw (safety net):
 *   If Xr is set by another path, the final re-throw is replaced with a
 *   conditional that swallows {} but still throws real errors.
 */
function patchReactCommitRootPlugin(): Plugin {
  const PA_PATTERN =
    'function Pa(e,t,n){n=Be(-1,n),n.tag=3,n.payload={element:null};var r=t.value;return n.callback=function(){Xr||(Xr=!0,Ou=r),Eu(e,t)},n}';
  const PA_REPLACEMENT =
    'function Pa(e,t,n){' +
    'var _ppV=t&&t.value;' +
    'if(_ppV&&typeof _ppV==="object"&&Object.keys(_ppV).length===0&&String(_ppV.message||"").trim()===""){' +
    'n=Be(-1,n);n.tag=3;' +
    'n.payload=function(){return e.memoizedState};' +
    'n.callback=function(){console.warn("[PP] Pa: swallowed empty root error")};' +
    'return n}' +
    'n=Be(-1,n),n.tag=3,n.payload={element:null};var r=t.value;return n.callback=function(){Xr||(Xr=!0,Ou=r),Eu(e,t)},n}';

  const THROW_PATTERN = 'if(Xr)throw Xr=!1,e=Ou,Ou=null,e';
  const THROW_REPLACEMENT =
    'if(Xr){Xr=!1;var _ppE=Ou;Ou=null;' +
    'if(_ppE&&typeof _ppE==="object"&&Object.keys(_ppE).length===0&&String(_ppE.message||"").trim()==="")' +
    '{console.warn("[PP] commitRoot: swallowed empty root error")}' +
    'else{throw _ppE}}';

  return {
    name: 'patch-react-commit-root',
    enforce: 'post',
    generateBundle(_options, bundle) {
      for (const [fileName, chunk] of Object.entries(bundle)) {
        if (chunk.type !== 'chunk') continue;
        if (!fileName.includes('vendor-react')) continue;

        // Only patch minified bundles — patterns don't exist in unminified code
        if (!chunk.code.includes('function Pa(')) continue;

        let patched = false;
        if (chunk.code.includes(PA_PATTERN)) {
          chunk.code = chunk.code.replace(PA_PATTERN, PA_REPLACEMENT);
          console.log(`[patch-react-commit-root] ✅ Patch 1 (Pa guard) applied to ${fileName}`);
          patched = true;
        } else {
          console.warn(`[patch-react-commit-root] ⚠️  Patch 1 pattern not found in ${fileName}`);
        }
        if (chunk.code.includes(THROW_PATTERN)) {
          chunk.code = chunk.code.replace(THROW_PATTERN, THROW_REPLACEMENT);
          console.log(`[patch-react-commit-root] ✅ Patch 2 (re-throw guard) applied to ${fileName}`);
          patched = true;
        } else {
          console.warn(`[patch-react-commit-root] ⚠️  Patch 2 pattern not found in ${fileName}`);
        }
        if (!patched) {
          console.warn(`[patch-react-commit-root] ⚠️  No patches applied — React version may have changed`);
        }
      }
    },
  };
}

export default defineConfig(({ mode }) => ({
  plugins: [react(), patchReactCommitRootPlugin()],
  // Persistent cache between builds — first build slow, subsequent ones ~30 sec
  cacheDir: '.vite-cache',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      // Replace framer-motion with a lightweight shim on mobile.
      'framer-motion': path.resolve(__dirname, './src/lib/motion-shim.tsx'),
      // Stub livekit-client — drops ~1.17 MB from the bundle.
      'livekit-client': path.resolve(__dirname, './src/lib/livekit-shim.ts'),
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2015',
    chunkSizeWarningLimit: 1500,
    // No sourcemaps for iOS device builds — saves 15-20 min of build time.
    sourcemap: false,
    // esbuild minifier — fast and correct for Capacitor iOS.
    // fast mode: no minification (for quick iteration), no treeshaking.
    minify: mode === 'fast' ? false : 'esbuild',
    reportCompressedSize: false,
    rollupOptions: {
      treeshake: mode !== 'fast',
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/react/') || id.includes('node_modules/react-dom/') || id.includes('node_modules/scheduler/')) return 'vendor-react';
          if (id.includes('node_modules/react-router')) return 'vendor-router';
          if (id.includes('@supabase')) return 'vendor-supabase';
          if (id.includes('recharts') || id.includes('d3-') || id.includes('victory-')) return 'vendor-charts';
          if (id.includes('@radix-ui')) return 'vendor-radix';
          if (id.includes('lucide-react')) return 'vendor-lucide';
          if (id.includes('@tanstack')) return 'vendor-tanstack';
          if (id.includes('jssip') || id.includes('sip.js')) return 'vendor-sip';
          if (id.includes('framer-motion')) return 'vendor-motion';
          // NOTE: vendor-misc omitted — caused circular deps with vendor-react
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
}));
