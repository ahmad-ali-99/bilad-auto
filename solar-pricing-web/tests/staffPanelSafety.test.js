import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import { applyStaffRoles, effectiveRole } from '../src/lib/permissions.js';
import { CAPABILITY_KEYS, parseRoles, serializeRoles } from '../src/lib/staffRoles.js';

beforeEach(() => applyStaffRoles({}));

describe('فتح الشاشة والحفظ بلا تعديل = ما يتغيّر ولا حساب', () => {
  const NAMES = ['أحمد', 'حيدر', 'حوراء', 'بكر', 'علي سبتي', 'ليث كرادة',
    'براء مكتب النواعير', 'محمد يعقوب كربلاء 42'];

  it('الصلاحيات الفعّالة تنحفظ وترجع كما هي', () => {
    const before = Object.fromEntries(NAMES.map((n) => [n, effectiveRole(n)]));
    const rows = NAMES.map((n) => ({ username: n, ...before[n] }));
    applyStaffRoles(parseRoles(serializeRoles(rows)));
    for (const n of NAMES) {
      const after = effectiveRole(n);
      for (const k of CAPABILITY_KEYS) expect(after[k], `${n}.${k}`).toBe(before[n][k]);
      expect(after.hiddenMarkupPercent, `${n}.markup`).toBe(before[n].hiddenMarkupPercent);
    }
  });

  it('حوراء تبقى مشرفة — كانت تنقفل كلياً بالحفظ', () => {
    const r = effectiveRole('حوراء');
    expect(r.editInventory).toBe(true);
    expect(r.editSettings).toBe(true);
    expect(r.editLabor).toBe(true);
  });

  it('«الاستيراد يحدّث» يبقى مقفلاً على الحسابات المقيّدة', () => {
    for (const n of ['بكر', 'علي سبتي', 'براء مكتب النواعير'])
      expect(effectiveRole(n).importUpdates, n).toBe(false);
  });

  it('الزيادة المخفية تبقى بحسابات المكاتب وحدها', () => {
    expect(effectiveRole('براء مكتب النواعير').hiddenMarkupPercent).toBe(10);
    for (const n of ['بكر', 'علي سبتي', 'ليث كرادة', 'حوراء'])
      expect(effectiveRole(n).hiddenMarkupPercent, n).toBe(0);
  });
});

describe('الشاشة تبني صفوفها من الصلاحيات الفعّالة', () => {
  const src = fs.readFileSync(new URL('../src/components/StaffManager.jsx', import.meta.url), 'utf8');

  it('rowFrom يبدأ من effectiveRole لا من الصفر', () => {
    expect(src).toContain('...effectiveRole(username)');
  });

  it('وأمر تبديل الرمز ينحل من الوعد قبل العرض', () => {
    // wrapBusy يلف كل دوال الـapi بـasync، فعرض النتيجة مباشرة بالـJSX
    // يرمي «Objects are not valid as a React child»
    expect(src).toContain('Promise.resolve(window.api.staff.resetCodeSql');
    expect(src).not.toMatch(/const sql = resetFor && resetCode\.length >= 6\s*\n?\s*\? window\.api/);
  });
});

describe('الإقلاع ما ينحبس على الشبكة', () => {
  const app = fs.readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');

  it('مهلة قصوى تكمل بالافتراضات — التطبيق PWA يشتغل أوفلاين', () => {
    expect(app).toMatch(/const timer = setTimeout\(done, 2500\)/);
    expect(app).toMatch(/clearTimeout\(timer\); done\(\)/);
  });

  it('والنداء ملفوف بـPromise.resolve — نسخة قديمة بلا api.staff ما تطيّح التطبيق', () => {
    expect(app).toContain('Promise.resolve(window.api?.staff?.load?.())');
  });
});
