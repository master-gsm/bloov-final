import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import legacy from '@vitejs/plugin-legacy';

export default defineConfig({
  plugins: [
    react(),
    legacy({
      targets: ['safari >= 13', 'chrome >= 64', 'firefox >= 67', 'edge >= 79', 'ios >= 13'],
      modernPolyfills: ['es.promise.all-settled', 'es.global-this', 'es.object.from-entries'],
      renderLegacyChunks: true,
    }),
  ],
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
  publicDir: 'public-clean',
  build: {
    target: ['es2020', 'safari13', 'chrome64', 'firefox67'],
    sourcemap: false,
  },
});
