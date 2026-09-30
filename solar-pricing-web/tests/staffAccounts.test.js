import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { canManageAccounts, canEditSettings, applyStaffRoles } from '../src/lib/permissions.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const settings = fs.readFileSync(path.join(HERE, '../src/pages/Settings.jsx'), 'utf8');
const manager = fs.readFileSync(path.join(HERE, '../src/components/StaffManager.jsx'), 'utf8');
const dataApi = fs.readFileSync(path.join(HERE, '../src/lib/dataApi.js'), 'utf8');

// نموذج «حساب جديد» كان يختفي بلا رسالة إذا الاسم انكتب بشكل ثانٍ، فيبدو
// البرنامج وكأنه ما يضيف حسابات أصلاً.
describe('منو يقدر ينشئ حساباً', () => {
  beforeEach(() => applyStaffRoles({}));

  it('أحمد وحيدر بكل أشكال كتابة الاسم', () => {
    for (const n of ['أحمد', 'احمد', 'أحمد ', ' احمد', 'حيدر', 'حيدر '])
      expect(canManageAccounts(n), n).toBe(true);
  });

  it('وغيرهم لا — حتى المشرفون الآخرون', () => {
    for (const n of ['حوراء', 'بكر', 'علي سبتي', '', null])
      expect(canManageAccounts(n), String(n)).toBe(false);
    // حوراء تبقى تعدّل الإعدادات والصلاحيات — المنع على إنشاء الحسابات وحده
    expect(canEditSettings('حوراء')).toBe(true);
  });

  it('والشاشة تقرا الصلاحية من مكان واحد بدل ما تكتب المقارنة بالإيد', () => {
    expect(settings).toContain('canManageAccounts(n)');
    expect(settings).not.toMatch(/norm === 'احمد'/);
    expect(settings).not.toMatch(/replace\(\/\[أإآ\]\/g, 'ا'\)/);
  });
});

// الحساب كان ينخلق بالقاعدة فعلاً ويختفي من الشاشة بأول تحديث، لأن القائمة
// تتبنى من أسماء مكتوبة بالكود ومن أصحاب صفوف الصلاحيات — والجديد ماكو بالاثنين.
describe('الحساب المُنشأ يبقى ظاهراً بعد التحديث', () => {
  it('ينسجّل بمفتاح مستقل بـapp_config عند الإنشاء', () => {
    expect(dataApi).toContain("const STAFF_ACCOUNTS_KEY = 'staff_accounts'");
    expect(dataApi).toContain('setConfigRaw(STAFF_ACCOUNTS_KEY, [...list, name])');
  });

  it('وماكو DDL — التوسعة بـapp_config مثل باقي المفاتيح', () => {
    expect(dataApi).not.toMatch(/alter table|create table/i);
  });

  it('والشاشة تدمج القائمة مع الأسماء المعروفة وصفوف السجل', () => {
    expect(manager).toContain('window.api.staff.accounts()');
    expect(manager).toContain('for (const n of created) push(');
  });

  it('وكتابة القائمة محروسة بنفس صلاحية الإنشاء', () => {
    expect(dataApi).toMatch(/k === STAFF_ACCOUNTS_KEY && !canManageAccounts/);
  });
});
