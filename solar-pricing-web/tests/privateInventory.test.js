import { describe, it, expect, beforeEach } from 'vitest';
import { visibleMaterials } from '../src/lib/inventoryVisibility.js';
import {
  hasPrivateInventory, isForcedPrivateInventory, isAdminName,
  applyStaffRoles, effectiveRole,
} from '../src/lib/permissions.js';
import { parseRoles, serializeRoles } from '../src/lib/staffRoles.js';

const HUSSEIN = 'حسين الصائغ';

// مخزون بسيط: مادتان مشتركتان، ومادتان أضافهما حسين، وواحدة أضافها بكر
const ROWS = [
  { id: 1, full_description: 'لوح مشترك' },
  { id: 2, full_description: 'بطارية مشتركة' },
  { id: 3, full_description: 'انفيرتر حسين' },
  { id: 4, full_description: 'بطارية حسين' },
  { id: 5, full_description: 'لوح بكر' },
];
const OWNERS = { 3: HUSSEIN, 4: HUSSEIN, 5: 'بكر' };

const filter = (me) =>
  visibleMaterials(me, ROWS, OWNERS, { isAdmin: isAdminName, isPrivateOwner: hasPrivateInventory })
    .map((m) => m.id);

describe('عزل مخزون حسين الصائغ', () => {
  beforeEach(() => applyStaffRoles({}));

  it('حسين يشوف مخزونه المضاف مع المخزون المشترك', () => {
    expect(filter(HUSSEIN)).toEqual([1, 2, 3, 4, 5]);
  });

  it('حساب ثاني ما يشوف ولا مادة من مواد حسين', () => {
    expect(filter('بكر')).toEqual([1, 2, 5]);
    expect(filter('علي سبتي')).toEqual([1, 2, 5]);
  });

  it('الإدارة تشوف الكل — نفس دكتورين العروض', () => {
    for (const admin of ['أحمد', 'حوراء', 'حيدر']) {
      expect(filter(admin)).toEqual([1, 2, 3, 4, 5]);
    }
  });

  it('مواد الحسابات الثانية تبقى مشتركة — العزل ما يعمّ على الكل', () => {
    expect(filter('حسين انوار المدينة')).toContain(5);
  });

  it('حساب بلا اسم ما يشوف المخزون الخاص', () => {
    expect(filter('')).toEqual([1, 2, 5]);
    expect(filter(null)).toEqual([1, 2, 5]);
  });

  it('اختلاف كتابة الاسم ما يفك العزل', () => {
    for (const n of [
      'حسين الصائغ', 'حسين الصايغ', 'حسين  الصائغ', 'حسين الصائغ ',
      'حسين الصائغ كربلاء', 'الصائغ',
    ]) expect(hasPrivateInventory(n), n).toBe(true);
  });

  it('وحسابات ثانية ما تنعزل بالغلط', () => {
    for (const n of ['حسين', 'حسين انوار المدينة', 'أحمد', 'بكر', '', null])
      expect(hasPrivateInventory(n), String(n)).toBe(false);
  });
});

describe('العزل ما ينفك من شاشة الصلاحيات', () => {
  beforeEach(() => applyStaffRoles({}));

  it('صف صلاحيات محفوظ بلا الخانة ما يلغي العزل المثبّت', () => {
    applyStaffRoles(parseRoles({ [HUSSEIN]: { addMaterial: true } }));
    expect(hasPrivateInventory(HUSSEIN)).toBe(true);
    expect(isForcedPrivateInventory(HUSSEIN)).toBe(true);
  });

  it('الشاشة تقدر تعزل حساباً إضافياً', () => {
    expect(hasPrivateInventory('بكر')).toBe(false);
    applyStaffRoles(parseRoles({ 'بكر': { addMaterial: true, privateInventory: true } }));
    expect(hasPrivateInventory('بكر')).toBe(true);
    expect(isForcedPrivateInventory('بكر')).toBe(false);
    expect(filter('علي سبتي')).toEqual([1, 2]);
  });

  it('الخانة تروح وترجع بالحفظ بلا ما تضيع', () => {
    const saved = serializeRoles([{ username: 'بكر', addMaterial: true, privateInventory: true }]);
    expect(parseRoles(saved)[
      Object.keys(parseRoles(saved))[0]
    ].privateInventory).toBe(true);
  });

  it('زر «مشرف» ما يقلب مخزون المشرفين خاصاً', () => {
    // adminRole() يشعّل كل CAPABILITY_KEYS — والخانة مقصودة خارجها
    applyStaffRoles(parseRoles({ 'أحمد': { ...Object.fromEntries(
      Object.keys(effectiveRole('أحمد')).map((k) => [k, true]),
    ), privateInventory: false } }));
    expect(hasPrivateInventory('أحمد')).toBe(false);
  });
});
