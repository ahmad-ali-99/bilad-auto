import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
const src = fs.readFileSync(new URL('../src/pages/Login.jsx', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');

describe('شاشة الدخول صارت للموظفين حصراً', () => {
  it('انشال التسجيل العام والدخول بالإيميل واسترجاع كلمة المرور', () => {
    for (const gone of ['signUp', 'resetPasswordForEmail', 'handleSignup', 'handleForgot', 'handleSignin'])
      expect(src, gone).not.toContain(gone);
  });

  it('وانشال دخول Google كلياً — الزر والأيقونة والدالة', () => {
    for (const gone of ['signInWithOAuth', 'GoogleIcon', 'google-btn', 'loginWithGoogle'])
      expect(src, gone).not.toContain(gone);
  });

  it('وانشال مربع «موظفو الشركة» — المدخل ما عاد مخبّى خلف تأشيرة', () => {
    expect(src).not.toContain('staff-toggle');
    expect(src).not.toContain('staffOpen');
  });

  it('وانشالت التبويبات — ماكو أوضاع دخول متعددة', () => {
    expect(src).not.toContain('login-tabs');
    expect(src).not.toMatch(/setMode\(/);
  });

  it('الدخول الوحيد الباقي هو دخول الموظفين باسم المستخدم والرمز', () => {
    expect(src).toContain('signInWithPassword');
    expect(src).toContain('usernameToEmail(username)');
    expect((src.match(/supabase\.auth\./g) || []).length).toBe(1);
  });
});

describe('تصميم الجوال', () => {
  it('خانات بحجم الإصبع وخط 16px يمنع تكبير سفاري التلقائي', () => {
    expect(css).toMatch(/@media \(max-width: 560px\)[\s\S]{0,900}font-size: 16px/);
  });

  it('زر إظهار الرمز موجود ومكانه مفتوح بـ!important', () => {
    expect(src).toContain('code-eye');
    // قاعدة قديمة `.login-card input { padding: ... !important }` تغلب أي تخصيص،
    // فبلا !important الرمز ينكتب تحت الأيقونة
    expect(css).toContain('.login-staff .code-wrap input { padding-inline-start: 46px !important; }');
  });
});

describe('واجهة الزبون مخفية مؤقتاً — والكود باقٍ', () => {
  const app = fs.readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');

  it('محكومة بمفتاح واحد مطفي', () => {
    expect(app).toContain('const CUSTOMER_VIEW_ENABLED = false;');
    expect(app).toContain('if (!isStaff && !CUSTOMER_VIEW_ENABLED)');
  });

  it('الكود ما انحذف — راح ينرجعله بالتحسين', () => {
    expect(app).toContain('<CustomerView user={session.user} />');
    expect(app).toContain("import CustomerView from './pages/CustomerView.jsx'");
  });

  it('الجلسات القديمة تنطلع بإفكت لا أثناء الرسم', () => {
    expect(app).toMatch(/useEffect\(\(\) => \{[\s\S]{0,320}signOut\(\{ scope: 'local' \}\)[\s\S]{0,80}setSession\(null\);[\s\S]{0,40}\}, \[session\]\);/);
  });
});
