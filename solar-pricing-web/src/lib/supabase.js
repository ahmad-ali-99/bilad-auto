// عميل Supabase — المفاتيح تُقرأ من متغيرات البيئة وقت البناء (VITE_*)
// أثناء التطوير قبل توفر مفاتيح المستخدم تبقى placeholder، وتُستبدل بمفاتيح المشروع الحقيقية عند النشر.
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://PLACEHOLDER.supabase.co';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || 'PLACEHOLDER_ANON_KEY';

export const isConfigured = !SUPABASE_URL.includes('PLACEHOLDER') && !SUPABASE_ANON_KEY.includes('PLACEHOLDER');

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  // pkce + التقاط الجلسة من الرابط: ضروري لرجوع دخول Google (OAuth redirect) بثبات
  // حتى داخل متصفحات التطبيقات — والتخزين المحلي يبقي الجلسة بعد إغلاق المتصفح
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' },
});

// نحوّل اسم المستخدم البسيط (حيدر1) لإيميل صناعي داخلي حتى يقبله Supabase Auth
export function usernameToEmail(username) {
  let clean = String(username).trim().toLowerCase().replace(/\s+/g, '');
  // الأرقام المجردة اختصار لحسابات الموظفين: «2» = حساب مستخدم2 وهكذا
  if (/^[0-9\u0660-\u0669]+$/.test(clean)) {
    clean = 'مستخدم' + clean.replace(/[\u0660-\u0669]/g, (d) => '\u0660\u0661\u0662\u0663\u0664\u0665\u0666\u0667\u0668\u0669'.indexOf(d));
  }
  // نرمّز الحروف العربية لتكون صالحة بجزء الإيميل المحلي
  const encoded = encodeURIComponent(clean).replace(/%/g, '');
  return `${encoded}@biladauto.local`;
}
