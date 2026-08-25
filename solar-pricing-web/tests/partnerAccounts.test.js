import { describe, it, expect } from 'vitest';
import {
  isRestrictedUser, isInventoryContributor, canEditInventory,
  canAddMaterial, canEditMaterial, canEditSettings, canEditLabor,
} from '../src/lib/permissions.js';

const PARTNERS = [
  ['براء', ['براء مكتب النواعير', 'براء النواعير']],
  ['ابو يزن', ['أبو يزن', 'ابو يزن الطاقة الخضراء', 'أبو يزن الطاقة الخضراء', 'ابو يزن الخضراء']],
  ['مصطفى', ['مصطفي', 'مصطفى شركة سيل', 'مصطفى سيل']],
  ['حسين', ['حسين انوار المدينة', 'حسين انوار المدينه', 'حسين المدينة', 'حسين المدينه']],
  ['محمد يعقوب', ['محمد يعقوب كربلاء', 'محمد يعقوب كربلاء 42', 'محمد  يعقوب  كربلاء  42']],
];

describe('حسابات الموظفين — مقيّدة وتضيف وتملك اللي تضيفه', () => {
  for (const [name, aliases] of PARTNERS) {
    for (const form of [name, ...aliases]) {
      it(`«${form}» مقيّد: ما يعدّل مخزوناً ولا أجوراً ولا إعدادات`, () => {
        expect(isRestrictedUser(form)).toBe(true);
        expect(canEditInventory(form)).toBe(false);
        expect(canEditLabor(form)).toBe(false);
        expect(canEditSettings(form)).toBe(false);
      });

      it(`«${form}» يضيف مواد ويملك اللي يضيفه هو بس`, () => {
        expect(isInventoryContributor(form)).toBe(true);
        expect(canAddMaterial(form)).toBe(true);
        expect(canEditMaterial(form, form)).toBe(true);          // مادته
        expect(canEditMaterial(form, 'بكر')).toBe(false);        // مادة غيره
        expect(canEditMaterial(form, null)).toBe(false);         // مادة قديمة بلا مالك
      });
    }
  }

  it('المشرف يبقى يعدّل مواد المكاتب', () => {
    expect(canEditMaterial('أحمد', 'براء مكتب النواعير')).toBe(true);
  });

  it('اسم مو باللائحة يبقى غير مقيّد — المطابقة تفشل مفتوحة، فهذا سبب تسجيل كل الأشكال', () => {
    expect(isRestrictedUser('براء مكتب النواعير للطاقة')).toBe(false);
  });

  it('التاء المربوطة والهاء اسم واحد — الشكلان ينلگون باللائحة', () => {
    expect(isRestrictedUser('حسين انوار المدينه')).toBe(true);
    expect(isRestrictedUser('حسين انوار المدينة')).toBe(true);
    expect(isRestrictedUser('ليث كراده')).toBe(true);   // كان ينفتح كامل الصلاحيات
    expect(isRestrictedUser('ليث كرادة')).toBe(true);
  });
});
