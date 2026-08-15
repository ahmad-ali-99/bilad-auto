// ارتفاع صناديق الجداول: يُقاس بدل ما ينحزر بـCSS.
//
// المطلوب إن **شريط التمرير الأفقي بأسفل الصندوق يبقى بمتناول اليد** — بدونه لازم
// تنزل لآخر 163 عرضاً حتى توصله. قيمة ثابتة مثل `calc(100vh - 250px)` ما تنفع لأن
// ارتفاع ما فوق الجدول يختلف بين الصفحات (فلاتر الحسابات، شريط البحث، التبويبات).
//
// نقيس موضع الصندوق **داخل حاوية التمرير** (مو بالنسبة للشاشة) حتى القيمة تبقى
// ثابتة ولا تتغير كل ما البياع يمرّر الصفحة.
const MIN_H = 220;
const GAP = 12;

function fitAll() {
  const content = document.querySelector('.mobile-content');
  if (!content) return;
  const crect = content.getBoundingClientRect();
  for (const el of document.querySelectorAll('.table-scroll')) {
    const topWithin = el.getBoundingClientRect().top - crect.top + content.scrollTop;
    const avail = Math.round(content.clientHeight - topWithin - GAP);
    el.style.maxHeight = `${Math.max(MIN_H, avail)}px`;
  }
}

export function startFitTables() {
  if (typeof window === 'undefined') return () => {};
  let raf = 0;
  const schedule = () => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(fitAll);
  };
  schedule();
  window.addEventListener('resize', schedule);
  window.addEventListener('orientationchange', schedule);
  // تبديل الصفحات وتغيّر الفلاتر يغيّران ما فوق الجدول — نراقب شجرة المحتوى.
  // نتجاهل تغيّر خاصية style حتى ما ندخل بحلقة مع قياسنا نفسه.
  const mo = new MutationObserver((records) => {
    if (records.every((r) => r.type === 'attributes' && r.attributeName === 'style')) return;
    schedule();
  });
  const content = document.querySelector('.mobile-content');
  if (content) mo.observe(content, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style'] });
  return () => {
    cancelAnimationFrame(raf);
    window.removeEventListener('resize', schedule);
    window.removeEventListener('orientationchange', schedule);
    mo.disconnect();
  };
}
