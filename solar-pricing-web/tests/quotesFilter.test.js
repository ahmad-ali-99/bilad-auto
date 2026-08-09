import { describe, it, expect } from 'vitest';
import { creatorsOf, filterByCreators, normName } from '../src/lib/quotesFilter.js';

const Q = [
  { id: 1, quote_number: 7401, created_by: 'أحمد' },
  { id: 2, quote_number: 7402, created_by: 'حيدر' },
  { id: 3, quote_number: 7403, created_by: 'احمد' },      // نفس أحمد بلا همزة
  { id: 4, quote_number: 7404, created_by: 'علي سبتي' },
  { id: 5, quote_number: 7405, created_by: 'علي  سبتي' }, // مسافة مزدوجة
  { id: 6, quote_number: 7406, created_by: null },        // عرض قديم بلا اسم
];

describe('قائمة الحسابات المنشئة', () => {
  it('تجمع الاسم الواحد رغم فروقات الهمزة والمسافات', () => {
    const list = creatorsOf(Q);
    const names = list.map((c) => c.key);
    expect(names).toContain('احمد');
    expect(names).toContain('علي سبتي');
    expect(list.find((c) => c.key === 'احمد').count).toBe(2);
    expect(list.find((c) => c.key === 'علي سبتي').count).toBe(2);
  });

  it('تتجاهل العروض بلا اسم منشئ', () => {
    expect(creatorsOf(Q).reduce((s, c) => s + c.count, 0)).toBe(5);
  });

  it('ترتب الأكثر عروضاً أولاً', () => {
    expect(creatorsOf(Q)[0].count).toBe(2);
  });

  it('تتحمل قائمة فاضية أو غير معرّفة', () => {
    expect(creatorsOf([])).toEqual([]);
    expect(creatorsOf(null)).toEqual([]);
  });
});

describe('فلترة العروض حسب الحساب', () => {
  it('حساب واحد يرجّع عروضه فقط', () => {
    expect(filterByCreators(Q, ['حيدر']).map((q) => q.id)).toEqual([2]);
  });

  it('يجمع صيغ الاسم المختلفة تحت اختيار واحد', () => {
    expect(filterByCreators(Q, ['أحمد']).map((q) => q.id)).toEqual([1, 3]);
    expect(filterByCreators(Q, ['علي سبتي']).map((q) => q.id)).toEqual([4, 5]);
  });

  it('اختيار متعدد يجمع عروض الحسابات المختارة', () => {
    expect(filterByCreators(Q, ['حيدر', 'علي سبتي']).map((q) => q.id)).toEqual([2, 4, 5]);
  });

  it('بلا اختيار = الكل (ما نخفي شي بالغلط)', () => {
    expect(filterByCreators(Q, [])).toHaveLength(6);
    expect(filterByCreators(Q, null)).toHaveLength(6);
  });

  it('اسم غير موجود يرجّع قائمة فاضية بلا انهيار', () => {
    expect(filterByCreators(Q, ['فلان'])).toEqual([]);
  });

  it('لا يخلط اسماً يبدأ بنفس الحروف', () => {
    expect(filterByCreators(Q, ['علي']).map((q) => q.id)).toEqual([]);
  });
});

describe('تطبيع الاسم', () => {
  it('يوحّد الهمزة والمسافات والألف المقصورة', () => {
    expect(normName('  أحمد ')).toBe('احمد');
    expect(normName('علي\tسبتي')).toBe('علي سبتي');
    expect(normName('ليلى')).toBe('ليلي');
    expect(normName(null)).toBe('');
  });
});
