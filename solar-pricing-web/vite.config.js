import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: './',
  // رقم النسخة يظهر بالشريط العلوي — حتى نعرف فوراً أي نسخة شغالة عند المستخدم
  define: {
    __APP_VERSION__: JSON.stringify('v' + new Date().toISOString().slice(2, 16).replace('T', ' ')),
  },
  plugins: [
    react(),
    // PWA للآيفون: تعمل أوفلاين بالكامل بعد أول فتح، وتُضاف للشاشة الرئيسية مثل أي تطبيق
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/*.png'],
      workbox: {
        globPatterns: ['**/*.{js,css,html,wasm,woff,woff2,png,svg}'],
        globIgnores: ['showcase/**'], // أصول العرض التفاعلي الثقيلة لا تدخل بالتخزين المسبق
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024, // sql-wasm + الحزمة الرئيسية
        // أصول العرض التفاعلي (HDRI/خامات/موديلات ~160MB): تنزل مرة وحدة عند أول فتح
        // للعرض وتُخزَّن بجهاز المستخدم دائمياً (CacheFirst) — ما تتغير بين النسخ
        runtimeCaching: [
          {
            urlPattern: /showcase\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'showcase-assets-v1',
              expiration: { maxEntries: 400 }, // ~160 ملف أصول (HDRI + خامات + موديلات) — لا يُطرد منها شي
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
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
