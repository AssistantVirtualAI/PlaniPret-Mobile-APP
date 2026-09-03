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
const mobilePackage = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'package.json'), 'utf8'));

// L'updater OTA n'est présent que dans les builds natifs. Quand le paquet
// n'est pas installé, on l'alias vers un stub pour ne pas casser le build web.
const hasCapgoUpdater = fs.existsSync(
  path.resolve(__dirname, 'node_modules/@capgo/capacitor-updater/package.json'),
);

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
      ...(hasCapgoUpdater
        ? {}
        : { '@capgo/capacitor-updater': path.resolve(__dirname, './src/lib/capgo-updater-shim.ts') }),
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
        manualChunks(id) {
          if (
            id.includes('node_modules/react/') ||
            id.includes('node_modules/react-dom/') ||
            id.includes('node_modules/scheduler/') ||
            id.includes('node_modules/react-is/') ||
            id.includes('node_modules/use-sync-external-store/')
          )
            return 'vendor-react';
          if (id.includes('node_modules/react-router')) return 'vendor-router';
          if (id.includes('@supabase')) return 'vendor-supabase';
          if (id.includes('recharts') || id.includes('d3-')) return 'vendor-charts';
          if (id.includes('@radix-ui')) return 'vendor-radix';
          if (id.includes('lucide-react')) return 'vendor-lucide';
          if (id.includes('@tanstack')) return 'vendor-tanstack';
          if (id.includes('jssip') || id.includes('sip.js')) return 'vendor-sip';
          if (id.includes('framer-motion')) return 'vendor-motion';
          if (id.includes('node_modules')) return 'vendor-misc';
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
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(String(mobilePackage.version ?? 'unknown')),
    'import.meta.env.VITE_NATIVE_BUILD': JSON.stringify(String(mobilePackage.androidVersionCode ?? 'unknown')),
    'import.meta.env.VITE_CAPACITOR_VERSION': JSON.stringify(capacitorVersion),
  },
});
