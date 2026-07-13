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

    // Skip gzip-size reporting per chunk — saves ~20-40s on large bundles.
    reportCompressedSize: false,

    // Mode "fast" (npm run build:fast) : pas de minification → 2-3x plus rapide
    // Mode "production" (npm run build) : minification complète
    minify: mode === 'fast' ? false : 'esbuild',

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
          if (id.includes('node_modules')) return 'vendor-misc';
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
