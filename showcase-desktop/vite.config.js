import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: './',
  plugins: [react()],
  // SKIP_PUBLIC=1: بناء سريع بلا إعادة نسخ الأصول الثقيلة (dist يحتفظ بنسختها)
  build: {
    outDir: 'dist',
    emptyOutDir: process.env.SKIP_PUBLIC !== '1',
    copyPublicDir: process.env.SKIP_PUBLIC !== '1',
  },
  server: { port: 5180 },
});
