import { resolve } from 'node:path';
import { defineConfig } from 'vite';

// Content scripts are injected as classic scripts, so bundle everything into one IIFE.
export default defineConfig({
  publicDir: false,
  build: {
    outDir: resolve(__dirname, 'dist'),
    emptyOutDir: false,
    target: 'chrome110',
    sourcemap: false,
    lib: {
      entry: resolve(__dirname, 'src/content/index.ts'),
      formats: ['iife'],
      name: 'SecurinSignalsContent',
      fileName: () => 'content.js',
    },
  },
});
