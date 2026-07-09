# تطبيق تسعير الطاقة الشمسية السحابي — بلاد اوتو

تطبيق ويب واحد يعمل على كل المنصات (ويندوز/أندرويد/آيفون) بقاعدة بيانات سحابية مشتركة (Supabase) وتسجيل دخول للموظفين. أونلاين فقط.

## خطوات ربط Supabase (لمرة واحدة)

1. أنشئ حساباً مجانياً على https://supabase.com ثم مشروعاً جديداً (اختر أقرب منطقة).
2. من المشروع: **SQL Editor → New query** → الصق كامل محتوى `supabase/schema.sql` → **Run**. (ينشئ كل الجداول والبيانات الأولية وسياسات الأمان.)
3. من **Project Settings → API** انسخ:
   - `Project URL`
   - `anon public key` (المفتاح العام)
   - `service_role key` (سري — يُستخدم مرة واحدة لإنشاء المستخدمين فقط)
4. أنشئ المستخدمين العشرة دفعة واحدة:
   ```bash
   SUPABASE_URL="<project url>" SUPABASE_SERVICE_KEY="<service_role key>" node supabase/create-users.mjs
   ```
5. ابنِ التطبيق بمفاتيح مشروعك:
   ```bash
   VITE_SUPABASE_URL="<project url>" VITE_SUPABASE_ANON_KEY="<anon key>" npm run build
   ```
   ثم انشر مجلد `dist/`.

## البنية
- `src/lib/supabase.js` — عميل Supabase (المفاتيح من متغيرات بيئة VITE_*)
- `src/lib/dataApi.js` — طبقة البيانات (تعطي شكل `window.api` فوق Supabase)
- `src/lib/quoteService.js` + `calc.js` — محرك الحساب (دوال نقية، بلا فحص مخزون)
- `src/lib/excelImport.js` — تحليل ملفات Excel للمخزون
- `src/pages/` — Login, QuoteBuilder, Quotes, Inventory, Settings
- `supabase/schema.sql` — مخطط قاعدة البيانات + الأمان
- `supabase/create-users.mjs` — إنشاء حسابات الموظفين

## التطوير
```bash
npm install
VITE_SUPABASE_URL=... VITE_SUPABASE_ANON_KEY=... npm run dev
npm test   # اختبارات محرك الحساب (بلا قاعدة بيانات)
```
