import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import path from 'path';
import fs from 'fs';
import tailwindcss from 'tailwindcss';
import autoprefixer from 'autoprefixer';

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

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      // Replace framer-motion with a lightweight shim on mobile.
      // See src/lib/motion-shim.tsx for the rationale (iOS WKWebView
      // GPU/memory crashes with the full library).
      'framer-motion': path.resolve(__dirname, './src/lib/motion-shim.tsx'),
      // Stub livekit-client — @elevenlabs/client statically imports it for its
      // WebRTC transport, but the mobile app uses WebSocket transport only.
      // Drops ~1.17 MB from the bundle. See src/lib/livekit-shim.ts.
      'livekit-client': path.resolve(__dirname, './src/lib/livekit-shim.ts'),
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2015',
    chunkSizeWarningLimit: 600,
    // Skip gzip-size reporting per chunk — saves ~20-40s on large bundles.
    reportCompressedSize: false,
    rollupOptions: {
      output: {
        // Keep all node_modules in a single vendor chunk to avoid circular
        // chunk evaluation issues on iOS/Capacitor (e.g. react-dom calling
        // scheduler before its chunk is loaded → unstable_scheduleCallback undefined).
        // Approach validated by Lovable.
        manualChunks(id) {
          if (!id.includes('node_modules')) return;
          return 'vendor';
        },
      },
    },
  },
  base: './',
  // The mobile app has its own package.json, so postcss-load-config never
  // reaches the repo root. Wire Tailwind/Autoprefixer explicitly, otherwise
  // the built CSS ships without any utility class (blank/broken screens).
  css: {
    postcss: {
      plugins: [tailwindcss({ config: path.resolve(__dirname, 'tailwind.config.ts') }), autoprefixer],
    },
  },

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
