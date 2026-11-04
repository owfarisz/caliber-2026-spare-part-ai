import { defineConfig } from 'vite';
import path from 'node:path';

export default defineConfig({
  base: process.env.VITE_SITE_BASE || '/',
  root: 'web',
  build: { outDir: '../dist', emptyOutDir: true },
  server: { port: 5173, strictPort: true, proxy: { '/api': 'http://127.0.0.1:8000' } },
  resolve: { alias: { '@': path.resolve('web/src') } }
});
