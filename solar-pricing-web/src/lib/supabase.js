// عميل Supabase — المفاتيح تُقرأ من متغيرات البيئة وقت البناء (VITE_*)
// أثناء التطوير قبل توفر مفاتيح المستخدم تبقى placeholder، وتُستبدل بمفاتيح المشروع الحقيقية عند النشر.
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://PLACEHOLDER.supabase.co';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || 'PLACEHOLDER_ANON_KEY';

export const isConfigured = !SUPABASE_URL.includes('PLACEHOLDER') && !SUPABASE_ANON_KEY.includes('PLACEHOLDER');

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true },
});

// نحوّل اسم المستخدم البسيط (حيدر1) لإيميل صناعي داخلي حتى يقبله Supabase Auth
export function usernameToEmail(username) {
  const clean = String(username).trim().toLowerCase().replace(/\s+/g, '_');
  // نرمّز الحروف العربية لتكون صالحة بجزء الإيميل المحلي
  const encoded = encodeURIComponent(clean).replace(/%/g, '');
  return `${encoded}@biladauto.local`;
}
