import { describe, it, expect } from 'vitest';
import { isRestrictedUser, canEditInventory } from '../src/lib/permissions.js';

// الحسابات المقيّدة: تشوف كل شي وتسوي عروضاً، بس ما تعدّل المخزون ولا الأجور.
// الاختبار يحرس نقطتين: القائمة نفسها، وتسامح المطابقة مع فروقات الكتابة
// (مسافة زايدة، همزة، ألف مقصورة) — لأن أي فرق بسيط يفتح الصلاحيات بالغلط.
describe('صلاحيات الحسابات المقيّدة', () => {
  it('يمنع التعديل على الحسابات الثلاثة المقيّدة', () => {
    for (const name of ['بكر', 'علي سبتي', 'ليث كرادة']) {
      expect(isRestrictedUser(name)).toBe(true);
      expect(canEditInventory(name)).toBe(false);
    }
  });

  it('يتسامح مع فروقات كتابة الاسم (مسافات وهمزة وألف مقصورة)', () => {
    expect(isRestrictedUser('  علي سبتي  ')).toBe(true);
    expect(isRestrictedUser('علي  سبتي')).toBe(true);      // مسافة مزدوجة
    expect(isRestrictedUser('علي\tسبتي')).toBe(true);      // تاب بدل مسافة
    expect(isRestrictedUser('علي سبتى')).toBe(true);       // ألف مقصورة
    expect(isRestrictedUser('ليث  كرادة ')).toBe(true);
  });

  it('لا يمنع باقي الحسابات', () => {
    for (const name of ['أحمد', 'احمد', 'حيدر', 'حوراء', 'مستخدم2', 'حيدر قاسم', '']) {
      expect(isRestrictedUser(name)).toBe(false);
      expect(canEditInventory(name)).toBe(true);
    }
  });

  it('لا يمنع اسماً يبدأ بنفس حروف اسم مقيّد (مطابقة تامة مو جزئية)', () => {
    expect(isRestrictedUser('علي')).toBe(false);
    expect(isRestrictedUser('علي سبتي الجبوري')).toBe(false);
    expect(isRestrictedUser('بكر حسن')).toBe(false);
  });
});
