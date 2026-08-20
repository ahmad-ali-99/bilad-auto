// سجل الحركات (الهستوري): كل تعديل/حذف/تحويل يسجل بجدول activity_log مع منو سواه.
// التسجيل «أطلق وانسَ» — فشله لا يعطل العملية الأصلية أبداً، والقراءة محصورة
// بحساب المشرف أحمد عبر RLS بقاعدة البيانات (الموظفون يكتبون بالسجل ولا يقرأونه).
//
// التفاصيل تحمل معها **لقطة الاسترجاع** بمفاتيح محجوزة (انظر activityUndo.js) —
// فبعض الحمولات تكبر (شعار base64 مثلاً). الحارس أدناه يمنعها من تضخيم الجدول:
// إذا اللقطة كبيرة تنشال ويبقى السطر الوصفي مع سبب صريح بدل ما تفشل الكتابة كلها.
import { supabase } from './supabase.js';
import { UNDO } from './activityUndo.js';

const MAX_DETAILS_BYTES = 200 * 1024;

function trimOversized(details) {
  if (!details || typeof details !== 'object') return details;
  try {
    if (JSON.stringify(details).length <= MAX_DETAILS_BYTES) return details;
  } catch {
    return { 'ملاحظة': 'تعذر تحويل التفاصيل' };
  }
  const { [UNDO]: _drop, ...rest } = details;
  const trimmed = { ...rest, [UNDO]: { kind: 'none', why: 'اللقطة أكبر من الحد — ما انخزنت' } };
  try {
    if (JSON.stringify(trimmed).length <= MAX_DETAILS_BYTES) return trimmed;
  } catch {
    /* نكمل للحل الأخير */
  }
  return { 'ملاحظة': 'التفاصيل أكبر من الحد المسموح', [UNDO]: { kind: 'none', why: 'التفاصيل كبيرة' } };
}

export function logActivity(action, entity, details = null) {
  (async () => {
    try {
      // الجلسة المحلية بلا شبكة — `getUser()` نداء شبكة وممكن يعلّق بتلفون
      // على شبكة ضعيفة، والسجل ما يستاهل يوقف عملية المستخدم
      const { data: sess } = await supabase.auth.getSession();
      const user = sess?.session?.user || null;
      await supabase.from('activity_log').insert({
        user_name: user?.user_metadata?.username || user?.user_metadata?.full_name || null,
        user_email: user?.email || null,
        action,
        entity,
        details: trimOversized(details),
      });
    } catch {
      /* الجدول غير منشأ بعد أو انقطاع — نتجاهل بصمت */
    }
  })();
}
