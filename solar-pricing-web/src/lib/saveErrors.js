// أخطاء قاعدة البيانات تجي بنص إنكليزي خام ما يفهمه البياع — نترجم المعروف منها
// لكلام واضح يكول شنو المطلوب بالضبط، والباقي يمر كما هو حتى ما نخفي شي.
//
// كانت هذي الدالة داخل MaterialFormModal وحده، بينما **الاستيراد من إكسل كان يبلع
// الخطأ كلياً** (try/finally بلا catch): البياع يدوس «استيراد»، القاعدة ترفض،
// وما تظهر ولا كلمة — فيعيد الرفع ويلگى كل شي «جديد» مرة ثانية لأن ماكو شي انحفظ.
// صارت مشتركة حتى كل مسارات الحفظ تحچي نفس الحچي.
export function humanizeSaveError(err, category) {
  const raw = String(err?.message || err || 'خطأ غير معروف');
  const low = raw.toLowerCase();
  if (low.includes('check constraint') || low.includes('violates check')) {
    if (category === 'integrated') {
      return 'قاعدة البيانات ما تقبل فئة «سستم متكامل» بعد — لازم يتشغّل كويري التفعيل مرة وحدة (ملف integrated-v2.sql) وبعدها تنحفظ عادي.';
    }
    return `القاعدة رفضت قيمة بأحد الحقول: ${raw}`;
  }
  if (low.includes('row-level security') || low.includes('permission') || low.includes('محصور') || low.includes('صلاحية')) {
    return `ما عندك صلاحية للحفظ بقاعدة البيانات: ${raw}`;
  }
  if (low.includes('failed to fetch') || low.includes('networkerror')) {
    return 'ما وصلنا للقاعدة — تأكد من الإنترنت وحاول مرة ثانية.';
  }
  return raw;
}
