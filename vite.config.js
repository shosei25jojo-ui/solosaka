import { defineConfig } from 'vite';

// GitHub Pages (https://<user>.github.io/solosaka/) でも動くよう相対パスでビルド
export default defineConfig({
  base: './',
  build: {
    target: 'es2020',
    outDir: 'dist',
    chunkSizeWarningLimit: 1500,
  },
});
