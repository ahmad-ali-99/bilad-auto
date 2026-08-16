import { describe, it, expect } from 'vitest';
import { annotateMatches } from '../src/lib/excelImport.js';

// مخزون قريب من مخزون المستخدم بعد ما بدّل أسماء الموديلات بيده
const EXISTING = [
  { id: 146, category: 'inverter', model: 'HZ-ES-C10 6K', watt_or_capacity: 6000, unit: 'عدد' },
  { id: 155, category: 'inverter', model: 'HY8KIP65', watt_or_capacity: 8000, unit: 'عدد' },
  { id: 156, category: 'battery', model: 'HORIZON 16 بطارية', watt_or_capacity: 16.08, unit: 'عدد' },
  { id: 145, category: 'battery', model: 'Dyness PowerBrick SC 16kWh', watt_or_capacity: 16.08, unit: 'عدد' },
  { id: 3, category: 'secondary', model: 'هيكل مغلون', watt_or_capacity: null, unit: 'عدد' },
];

const row = (over) => ({
  category: 'inverter', brand: 'HORIZON', model: 'X', full_description: 'وصف',
  unit: 'عدد', watt_or_capacity: 6000, price: 1000, warranty_months: 60,
  qty_per_panel: null, issues: [], ...over,
});

describe('الاستيراد ينبّه على المادة المعاد تسميتها بدل ما يكرّرها', () => {
  it('اسم مختلف ونفس الفئة والسعة → «جديد» مع تنبيه يذكر الاسم الموجود', () => {
    const [r] = annotateMatches(EXISTING, [row({ model: 'HZ6000-ES-C10' })]);
    expect(r.matchStatus).toBe('new');
    expect(r.nearMatches).toEqual([{ id: 146, model: 'HZ-ES-C10 6K' }]);
    expect(r.issues.join(' ')).toContain('HZ-ES-C10 6K');
    expect(r.issues.join(' ')).toContain('نسخة ثانية');
  });

  it('تطابق تام → «تحديث» وبلا أي تنبيه زيادة', () => {
    const [r] = annotateMatches(EXISTING, [row({ model: 'HY8KIP65', watt_or_capacity: 8000 })]);
    expect(r.matchStatus).toBe('update');
    expect(r.existingId).toBe(155);
    expect(r.issues).toEqual([]);
    expect(r.nearMatches).toEqual([]);
  });

  it('سعة مختلفة → ماكو تنبيه (بطارية 5 مو نسخة من بطارية 16)', () => {
    const [r] = annotateMatches(EXISTING, [row({ category: 'battery', model: 'أي اسم', watt_or_capacity: 5.12 })]);
    expect(r.matchStatus).toBe('new');
    expect(r.nearMatches).toEqual([]);
    expect(r.issues).toEqual([]);
  });

  it('أكثر من مرشح → تنبيه بعددهم بلا اسم واحد بعينه', () => {
    const [r] = annotateMatches(EXISTING, [row({ category: 'battery', model: 'بطارية جديدة', watt_or_capacity: 16.08 })]);
    expect(r.nearMatches).toHaveLength(2);
    expect(r.issues.join(' ')).toContain('2 مواد');
  });

  it('المواد الثانوية ما تدخل الفحص — ماكو سعة تُقارن', () => {
    const [r] = annotateMatches(EXISTING, [
      row({ category: 'secondary', model: 'هيكل ثاني', watt_or_capacity: null, unit: 'عدد' }),
    ]);
    expect(r.matchStatus).toBe('new');
    expect(r.nearMatches).toEqual([]);
    expect(r.issues).toEqual([]);
  });

  it('التنبيهات الأصلية للصف ما تنمسح — تنضاف عليها', () => {
    const [r] = annotateMatches(EXISTING, [row({ model: 'HZ6000-ES-C10', issues: ['ما انلكه سعر — أدخله يدوياً'] })]);
    expect(r.issues[0]).toBe('ما انلكه سعر — أدخله يدوياً');
    expect(r.issues).toHaveLength(2);
  });

  it('مخزون فاضي → «جديد» بلا تنبيه', () => {
    const [r] = annotateMatches([], [row({ model: 'HZ6000-ES-C10' })]);
    expect(r.matchStatus).toBe('new');
    expect(r.issues).toEqual([]);
  });
});
