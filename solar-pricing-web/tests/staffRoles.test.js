import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import { CAPABILITY_KEYS, CAPABILITIES, emptyRole, adminRole, parseRoles, serializeRoles, normName } from '../src/lib/staffRoles.js';
import {
  applyStaffRoles, canEditInventory, canEditSettings, canPriceAdjust, canPickBrand,
  canEditLabor, canViewQuotes, isInventoryContributor, hiddenMarkupPercentFor,
} from '../src/lib/permissions.js';

beforeEach(() => applyStaffRoles({}));

describe('السجل فارغ = الافتراضات القديمة بالضبط', () => {
  it('ولا حساب يتغيّر سلوكه', () => {
    expect(canEditInventory('أحمد')).toBe(true);
    expect(canEditInventory('بكر')).toBe(false);
    expect(isInventoryContributor('بكر')).toBe(true);
    expect(canPriceAdjust('بكر')).toBe(true);
    expect(canPriceAdjust('حوراء')).toBe(true);
    expect(canPickBrand('حوراء')).toBe(false);   // مو كل صلاحية كانت للمشرفين
    expect(canPickBrand('بكر')).toBe(true);
    expect(canViewQuotes('حيدر')).toBe(true);
    expect(hiddenMarkupPercentFor('براء مكتب النواعير')).toBe(10);
  });
});

describe('السجل المحفوظ يسبق الافتراض', () => {
  it('يفتح صلاحية كانت مقفلة', () => {
    applyStaffRoles(parseRoles({ 'بكر': { ...emptyRole(), editInventory: true } }));
    expect(canEditInventory('بكر')).toBe(true);
  });

  it('ويقفل صلاحية كانت مفتوحة', () => {
    applyStaffRoles(parseRoles({ 'بكر': { ...emptyRole() } }));
    expect(canPriceAdjust('بكر')).toBe(false);
    expect(isInventoryContributor('بكر')).toBe(false);
  });

  it('ويبدّل نسبة الزيادة المخفية', () => {
    applyStaffRoles(parseRoles({ 'براء مكتب النواعير': { ...emptyRole(), hiddenMarkupPercent: 7 } }));
    expect(hiddenMarkupPercentFor('براء مكتب النواعير')).toBe(7);
  });

  it('وصفر يعني بلا زيادة — حتى لو الافتراض 10', () => {
    applyStaffRoles(parseRoles({ 'براء مكتب النواعير': { ...emptyRole() } }));
    expect(hiddenMarkupPercentFor('براء مكتب النواعير')).toBe(0);
  });
});

describe('المشرف ما ينقفل برّا الإعدادات', () => {
  it('حتى لو السجل يقفلها عليه — وإلا ماكو مخرج إلا SQL', () => {
    applyStaffRoles(parseRoles({ 'أحمد': { ...emptyRole() } }));
    expect(canEditSettings('أحمد')).toBe(true);
  });

  it('بس بقية صلاحياته تتبع السجل — ماكو تجاوز عام', () => {
    applyStaffRoles(parseRoles({ 'أحمد': { ...emptyRole() } }));
    expect(canEditLabor('أحمد')).toBe(false);
  });
});

describe('السجل يجي من القاعدة — يتقرا بحذر', () => {
  it('أي قيمة مو true تصير false — مفتاح مكتوب غلط ما يفتح صلاحية', () => {
    const r = parseRoles({ 'س': { editInventory: 'yes', editLabor: 1, editSettings: null } });
    expect(r[normName('س')].editInventory).toBe(false);
    expect(r[normName('س')].editLabor).toBe(false);
  });

  it('والمفاتيح الغريبة تنشال', () => {
    const r = parseRoles({ 'س': { hackTheThing: true } });
    expect(Object.keys(r[normName('س')]).sort())
      .toEqual([...CAPABILITY_KEYS, 'hiddenMarkupPercent', 'privateInventory', 'label'].sort());
  });

  it('ومدخلات فاسدة ما تكسر شي', () => {
    for (const bad of [null, undefined, 'نص', 42, [], { 'س': null }, { '': {} }])
      expect(() => parseRoles(bad)).not.toThrow();
  });

  it('المطابقة توحّد الهمزة والتاء المربوطة والمسافات', () => {
    applyStaffRoles(parseRoles({ 'حسين انوار المدينة': { ...emptyRole(), editInventory: true } }));
    expect(canEditInventory('حسين أنوار المدينه')).toBe(true);
    expect(canEditInventory('حسين  انوار  المدينه')).toBe(true);
  });
});

describe('الحفظ والقراءة يرجعان نفس الشي', () => {
  it('دورة كاملة بلا ضياع', () => {
    const rows = [{ username: 'كرار', ...adminRole(), hiddenMarkupPercent: 5 }];
    const back = parseRoles(serializeRoles(rows));
    const r = back[normName('كرار')];
    expect(r.label).toBe('كرار');
    expect(r.hiddenMarkupPercent).toBe(5);
    for (const k of CAPABILITY_KEYS) expect(r[k], k).toBe(true);
  });

  it('كل صلاحية إلها اسم عربي معروض', () => {
    for (const k of CAPABILITY_KEYS) expect(typeof CAPABILITIES[k], k).toBe('string');
  });
});

describe('حراس طبقة البيانات', () => {
  const api = fs.readFileSync(new URL('../src/lib/dataApi.js', import.meta.url), 'utf8');

  it('السجل نفسه ما ينكتب إلا من الإدارة — هو بيانات الصلاحية', () => {
    expect(api).toContain("k === STAFF_ROLES_KEY && !canEditSettings(");
  });

  it('إنشاء الحساب محروس بالإدارة', () => {
    const fn = api.slice(api.indexOf('async create({ username, code })'));
    expect(fn.slice(0, 400)).toContain('canEditSettings(await currentUsername())');
  });

  it('الإنشاء بعميل ثانٍ — جلسة المشرف ما تنلمس', () => {
    expect(api).toContain("storageKey: 'biladauto-signup-tmp'");
    expect(api).toContain('persistSession: false');
  });

  it('تبديل رمز غيره يطلع SQL لا نداء — مفتاح الخدمة ما ينحط بالتطبيق', () => {
    expect(api).toContain('resetCodeSql(username, code)');
    expect(api).toContain('extensions.crypt');
    expect(api).not.toContain('SERVICE_ROLE');
    expect(api).not.toContain('auth.admin.');
  });
});
