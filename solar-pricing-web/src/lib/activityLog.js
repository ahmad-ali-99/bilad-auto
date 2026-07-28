// سجل الحركات (الهستوري): كل تعديل/حذف/تحويل يسجل بجدول activity_log مع منو سواه.
// التسجيل «أطلق وانسَ» — فشله لا يعطل العملية الأصلية أبداً، والقراءة محصورة
// بحساب المشرف أحمد عبر RLS بقاعدة البيانات (الموظفون يكتبون بالسجل ولا يقرأونه).
import { supabase } from './supabase.js';

export function logActivity(action, entity, details = null) {
  (async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      await supabase.from('activity_log').insert({
        user_name: user?.user_metadata?.username || user?.user_metadata?.full_name || null,
        user_email: user?.email || null,
        action,
        entity,
        details,
      });
    } catch {
      /* الجدول غير منشأ بعد أو انقطاع — نتجاهل بصمت */
    }
  })();
}
