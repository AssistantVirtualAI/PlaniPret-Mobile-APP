import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import path from 'path';

export default defineConfig(({ mode }) => ({
  plugins: [react()],

  // Cache persistant entre les builds — 1er build lent, les suivants ~30 sec
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
    target: 'es2020',
    chunkSizeWarningLimit: 1000,

    // Mode "fast" (npm run build:fast) : pas de minification → 2-3x plus rapide
    // Mode "production" (npm run build) : minification complète
    minify: mode === 'fast' ? false : 'esbuild',

    // Désactiver le treeshaking en mode fast pour accélérer encore plus
    rollupOptions: {
      treeshake: mode !== 'fast',
      output: {
        // Séparer les grosses vendor libs en chunks stables (pas de cycles)
        manualChunks(id) {
          // React core — chunk stable qui ne change jamais
          if (id.includes('node_modules/react/') ||
              id.includes('node_modules/react-dom/') ||
              id.includes('node_modules/scheduler/')) {
            return 'vendor-react';
          }
          // Router
          if (id.includes('node_modules/react-router')) {
            return 'vendor-router';
          }
          // Supabase
          if (id.includes('node_modules/@supabase/')) {
            return 'vendor-supabase';
          }
          // Recharts (très gros — 400kB)
          if (id.includes('node_modules/recharts') ||
              id.includes('node_modules/d3-') ||
              id.includes('node_modules/victory-')) {
            return 'vendor-charts';
          }
          // Radix UI
          if (id.includes('node_modules/@radix-ui/')) {
            return 'vendor-radix';
          }
          // Tanstack Query
          if (id.includes('node_modules/@tanstack/')) {
            return 'vendor-query';
          }
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
  },
}));
