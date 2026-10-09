import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Builds the extension pages (popup, options) and the MV3 service worker.
// The content script is built separately by vite.content.config.ts because
// content scripts cannot be ES modules and must be a single self-contained file.
export default defineConfig({
  root: resolve(__dirname, 'src'),
  publicDir: resolve(__dirname, 'public'),
  base: '',
  plugins: [react()],
  build: {
    outDir: resolve(__dirname, 'dist'),
    emptyOutDir: true,
    target: 'chrome110',
    sourcemap: false,
    modulePreload: false,
    rollupOptions: {
      input: {
        popup: resolve(__dirname, 'src/popup/index.html'),
        options: resolve(__dirname, 'src/options/index.html'),
        background: resolve(__dirname, 'src/background/index.ts'),
      },
      output: {
        entryFileNames: (chunk) =>
          chunk.name === 'background' ? 'background.js' : 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        manualChunks: (id) =>
          /node_modules\/(react|react-dom|scheduler)\//.test(id) ? 'vendor-react' : undefined,
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
});
