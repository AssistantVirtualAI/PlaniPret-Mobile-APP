import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

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
  // Pre-bundle all heavy deps so the first `npm run build` on a fresh
  // machine (no .vite cache) does NOT need to transform them one by one.
  // This cuts the cold-start build time from ~15 min → ~1-2 min on Mac M-series.
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      'react-dom/client',
      'react-router-dom',
      '@supabase/supabase-js',
      '@tanstack/react-query',
      'lucide-react',
      'recharts',
      'jssip',
      '@radix-ui/react-dialog',
      '@radix-ui/react-alert-dialog',
      '@radix-ui/react-scroll-area',
      '@radix-ui/react-slot',
      '@radix-ui/react-toast',
      '@radix-ui/react-tooltip',
      'sonner',
      'clsx',
      'tailwind-merge',
      'class-variance-authority',
      'react-markdown',
    ],
    // Exclude shims — they are local files, no pre-bundling needed.
    exclude: ['livekit-client', 'framer-motion'],
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2020',
    chunkSizeWarningLimit: 600,
    // Use esbuild for minification (faster than terser, default in Vite 5).
    minify: 'esbuild',
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/react/') || id.includes('node_modules/react-dom/')) return 'vendor-react';
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
  server: {
    port: 5175,
    strictPort: true,
  },
  define: {
    __APP_ID__: JSON.stringify('planipret'),
  },
});
