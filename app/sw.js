// وضع الصيانة — **تحديث إجباري بلا أي ضغطة من الموظف**.
//
// كيف يصير إجبارياً: المتصفح يجيب sw.js من الشبكة (مو من المخزون) كل ما
// ينفتح التطبيق أو ينتقل بين الصفحات. أول ما يلگاه تغيّر:
//   1) skipWaiting — الخدمة الجديدة ما تنتظر سكّة كل النوافذ.
//   2) clients.claim — تمسك النوافذ المفتوحة حالاً بلا انتظار.
//   3) تفرّغ كل المخزون فما بقيت نسخة قديمة تنخدم.
//   4) تشيل نفسها، وتعيد تحميل كل نافذة مفتوحة — فتظهر الصيانة لحالها.
self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    await self.clients.claim();
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => caches.delete(k)));
    await self.registration.unregister();
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const w of wins) {
      try { await w.navigate(w.url); } catch { /* بعض المتصفحات تمنع navigate — التحميل الجاي يكفي */ }
    }
  })());
});

// أي طلب يمر على الخدمة يروح للشبكة مباشرة — ما ننخدم من مخزون قديم أبداً
self.addEventListener('fetch', (e) => {
  if (e.request.mode === 'navigate') {
    e.respondWith(fetch('./index.html', { cache: 'reload' }).catch(() => fetch(e.request)));
  }
});
