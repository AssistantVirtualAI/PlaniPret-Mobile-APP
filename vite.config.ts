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
 * Patch the minified vendor-react bundle to neutralise empty-object errors
 * on iOS WKWebView cold boot (React error #150 / commitRoot re-throw).
 *
 * Only active in production mode (minify !== false) because the patterns
 * only exist in minified code.
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
        if (!chunk.code.includes('function Pa(')) continue; // skip unminified

        if (chunk.code.includes(PA_PATTERN)) {
          chunk.code = chunk.code.replace(PA_PATTERN, PA_REPLACEMENT);
          console.log(`[patch-react-commit-root] ✅ Patch 1 applied to ${fileName}`);
        } else {
          console.warn(`[patch-react-commit-root] ⚠️  Patch 1 not found in ${fileName}`);
        }
        if (chunk.code.includes(THROW_PATTERN)) {
          chunk.code = chunk.code.replace(THROW_PATTERN, THROW_REPLACEMENT);
          console.log(`[patch-react-commit-root] ✅ Patch 2 applied to ${fileName}`);
        } else {
          console.warn(`[patch-react-commit-root] ⚠️  Patch 2 not found in ${fileName}`);
        }
      }
    },
  };
}

export default defineConfig(({ mode }) => ({
  plugins: [react(), patchReactCommitRootPlugin()],
  // Persistent cache — first build slow, subsequent ones ~30 sec
  cacheDir: '.vite-cache',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      'framer-motion': path.resolve(__dirname, './src/lib/motion-shim.tsx'),
      'livekit-client': path.resolve(__dirname, './src/lib/livekit-shim.ts'),
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2015',
    chunkSizeWarningLimit: 1500,
    sourcemap: false,
    minify: mode === 'fast' ? false : 'esbuild',
    reportCompressedSize: false,
    rollupOptions: {
      treeshake: mode !== 'fast',
      output: {
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
}));
