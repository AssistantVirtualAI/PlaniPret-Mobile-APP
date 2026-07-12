import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import path from 'path';

export default defineConfig({
  plugins: [react()],

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
    minify: 'esbuild',
    // IMPORTANT: pas de manualChunks — cela créait des dépendances circulaires
    // entre vendor-misc et vendor-react causant l'erreur iOS :
    // "ReferenceError: Cannot access 'M' before initialization"
    // Rollup gère le chunking automatiquement sans cycles.
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
