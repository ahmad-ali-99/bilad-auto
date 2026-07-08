import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: './',
  plugins: [
    react(),
    // PWA للآيفون: تعمل أوفلاين بالكامل بعد أول فتح، وتُضاف للشاشة الرئيسية مثل أي تطبيق
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/*.png'],
      workbox: {
        globPatterns: ['**/*.{js,css,html,wasm,woff,woff2,png,svg}'],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024, // sql-wasm + الحزمة الرئيسية
      },
      manifest: {
        name: 'تسعير الطاقة الشمسية - بلاد اوتو',
        short_name: 'تسعير الطاقة',
        description: 'برنامج تسعير منظومات الطاقة الشمسية - يعمل بدون إنترنت',
        dir: 'rtl',
        lang: 'ar',
        display: 'standalone',
        orientation: 'portrait',
        theme_color: '#1a3a5c',
        background_color: '#1a3a5c',
        start_url: './',
        scope: './',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  optimizeDeps: {
    exclude: ['sql.js'],
  },
  server: { port: 5174 },
});
