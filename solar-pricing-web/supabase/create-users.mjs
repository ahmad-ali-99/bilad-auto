// إنشاء المستخدمين العشرة دفعة واحدة داخل مشروع Supabase
// التشغيل (بعد إنشاء المشروع): يحتاج service_role key (سري — لا يُرفع على GitHub)
//   SUPABASE_URL=... SUPABASE_SERVICE_KEY=... node supabase/create-users.mjs
import { createClient } from '@supabase/supabase-js';

const URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
if (!URL || !SERVICE_KEY) {
  console.error('مطلوب: SUPABASE_URL و SUPABASE_SERVICE_KEY بمتغيرات البيئة');
  process.exit(1);
}

// نفس تحويل الاسم لإيميل صناعي المستخدم بالواجهة (src/lib/supabase.js)
function usernameToEmail(username) {
  const clean = String(username).trim().toLowerCase().replace(/\s+/g, '_');
  const encoded = encodeURIComponent(clean).replace(/%/g, '');
  return `${encoded}@biladauto.local`;
}

// القائمة: 3 بأسماء + 7 مرقّمة — كل واحد برمز افتراضي بسيط (يُغيَّر لاحقاً)
const users = [
  { username: 'أحمد', code: '1111' },
  { username: 'حيدر', code: '2222' },
  { username: 'حوراء', code: '3333' },
  { username: 'مستخدم1', code: '1001' },
  { username: 'مستخدم2', code: '1002' },
  { username: 'مستخدم3', code: '1003' },
  { username: 'مستخدم4', code: '1004' },
  { username: 'مستخدم5', code: '1005' },
  { username: 'مستخدم6', code: '1006' },
  { username: 'مستخدم7', code: '1007' },
];

const admin = createClient(URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

for (const u of users) {
  const email = usernameToEmail(u.username);
  const { error } = await admin.auth.admin.createUser({
    email,
    password: u.code,
    email_confirm: true,
    user_metadata: { username: u.username },
  });
  if (error && !/already/i.test(error.message)) {
    console.log(`✗ ${u.username}: ${error.message}`);
  } else {
    console.log(`✓ ${u.username}  (الرمز: ${u.code})`);
  }
}
console.log('\nتم إنشاء المستخدمين. القائمة أعلاه (اسم + رمز) — سلّمها للموظفين وغيّر الرموز متى شئت.');
