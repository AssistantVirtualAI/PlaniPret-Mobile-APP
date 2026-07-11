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
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2015',
    chunkSizeWarningLimit: 600,
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
