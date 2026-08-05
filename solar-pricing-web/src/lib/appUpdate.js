// تحديث التطبيق لآخر نسخة — إجبار حقيقي.
//
// الطريقة القديمة (reg.update() ثم location.reload()) ما كانت تشتغل: تحديث الـservice
// worker ياخذ ثواني حتى ينزّل النسخة الجديدة، والـreload ينفّذ فوراً فيرجع نفس الملفات
// من الكاش القديم — والمستخدم يضل يضغط الزر بلا فايدة.
//
// الحل: نلغي تسجيل الـservice worker ونمسح كاش النسخة، ثم نعيد التحميل برابط جديد
// (معامل كاسر للكاش) — فالمتصفح مجبر يجيب index.html والحزمة من الشبكة. بعد التحميل
// يعيد registerSW.js تسجيل الـworker تلقائياً فترجع ميزة العمل أوفلاين.
//
// أصول العرض التفاعلي (~160MB بكاش showcase-assets) ما تنمسح — ما تتغير بين النسخ،
// ومسحها يعني إعادة تنزيلها كاملة على حساب المستخدم.
export async function forceUpdateApp() {
  try {
    const regs = (await navigator.serviceWorker?.getRegistrations?.()) || [];
    await Promise.all(regs.map((r) => r.unregister().catch(() => false)));
  } catch {
    /* المتصفح ما يدعم service worker أو ممنوع — نكمل للتحميل */
  }
  try {
    const keys = (await caches?.keys?.()) || [];
    await Promise.all(
      keys.filter((k) => !k.startsWith('showcase-assets')).map((k) => caches.delete(k).catch(() => false))
    );
  } catch {
    /* الكاش غير متاح — نكمل */
  }
  const url = new URL(window.location.href);
  url.searchParams.set('v', Date.now().toString(36));
  window.location.replace(url.toString());
}
