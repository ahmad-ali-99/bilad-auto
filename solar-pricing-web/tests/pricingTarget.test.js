import { describe, it, expect } from 'vitest';
import {
  BANK_STEP, isWholeMillions, bankRoundOptions, percentToReach, adjustmentsForTarget,
} from '../src/lib/pricingTarget.js';

describe('تقريب مبلغ المصرف لملايين كاملة', () => {
  it('الخطوة مليون', () => expect(BANK_STEP).toBe(1000000));

  it('المليون الكامل ما يحتاج تقريباً', () => {
    expect(isWholeMillions(10000000)).toBe(true);
    expect(isWholeMillions(80000000)).toBe(true);
    expect(bankRoundOptions(10000000)).toBe(null);
  });

  it('المبلغ الكسري يعطي خيار زيادة وخيار نقصان — مثال المستخدم', () => {
    const o = bankRoundOptions(9800000);
    expect(o.up).toBe(10000000);
    expect(o.upDiff).toBe(200000);
    expect(o.down).toBe(9000000);
    expect(o.downDiff).toBe(800000);
  });

  it('مبلغ تحت المليون: الزيادة بس — التقريب للأوطأ ينزله لصفر', () => {
    const o = bankRoundOptions(640000);
    expect(o.up).toBe(1000000);
    expect(o.down).toBe(null);
    expect(o.downDiff).toBe(null);
  });

  it('الصفر والسالب ما يحتاجون تقريباً', () => {
    expect(isWholeMillions(0)).toBe(true);
    expect(bankRoundOptions(0)).toBe(null);
  });
});

describe('النسبة للوصول لمبلغ', () => {
  it('مبلغ أعلى = زيادة', () => {
    expect(percentToReach(100, 110)).toEqual({ kind: 'markup', percent: 10 });
  });

  it('مبلغ أوطأ = خصم', () => {
    expect(percentToReach(100, 90)).toEqual({ kind: 'discount', percent: 10 });
  });

  it('نفس المبلغ = ولا شي', () => {
    expect(percentToReach(100, 100).kind).toBe('none');
  });

  it('النسبة تعيد بناء المبلغ بدقة الدينار على مبالغ حقيقية', () => {
    const base = 26200800, target = 30000000;
    const { kind, percent } = percentToReach(base, target);
    expect(kind).toBe('markup');
    expect(Math.round(base * (1 + percent / 100))).toBe(target);
  });

  it('وبالنزول كذلك', () => {
    const base = 80000000, target = 74350000;
    const { kind, percent } = percentToReach(base, target);
    expect(kind).toBe('discount');
    expect(Math.round(base * (1 - percent / 100))).toBe(target);
  });

  it('مدخلات فارغة ما تكسر شي', () => {
    for (const [b, t] of [[0, 100], [100, 0], [null, null], ['', '']])
      expect(percentToReach(b, t).kind).toBe('none');
  });
});

describe('كائن النِسَب من مبلغ الوصول', () => {
  it('الافتراض موزّع — غير علني', () => {
    const a = adjustmentsForTarget(100, 120);
    expect(a.markupPercent).toBe(20);
    expect(a.markupMode).toBe('distributed');
  });

  it('والسويج يخلّيها علنية', () => {
    expect(adjustmentsForTarget(100, 120, { visible: true }).markupMode).toBe('visible');
  });

  it('الخصم كذلك: موزّع افتراضاً وعلني بالسويج', () => {
    expect(adjustmentsForTarget(100, 80).discountMode).toBe('distributed');
    expect(adjustmentsForTarget(100, 80, { visible: true }).discountMode).toBe('visible');
    expect(adjustmentsForTarget(100, 80).discountPercent).toBe(20);
  });
});

// ── التكامل مع محرك العرض: المبلغ المكتوب لازم يطلع هو المجموع بالضبط ───────
import { buildOptions, buildQuoteDraft } from '../src/lib/quoteService.js';

const SET = { system_voltage: 230, system_efficiency: 0.8, inverter_safety_factor: 1.25, dod: 0.9,
  night_coverage_hours: 8, panel_area_m2: 2.7, currency: 'د', quote_number_start: 400,
  charge_panels_per_battery: 1 };
const MATS = [
  { id: 1, category: 'panel', full_description: 'ألواح 650 واط', unit: 'عدد', watt_or_capacity: 650, price: 200000 },
  { id: 2, category: 'inverter', full_description: 'انفيرتر 16 كيلو', unit: 'عدد', watt_or_capacity: 16000, price: 3900000 },
  { id: 3, category: 'battery', full_description: 'بطارية 16', unit: 'عدد', watt_or_capacity: 16, price: 4000000 },
  { id: 4, category: 'secondary', full_description: 'هيكل الألواح', unit: 'عدد', price: 130000, qty_per_panel: 1 },
  { id: 6, category: 'secondary', full_description: 'كيبلات 6 ملم', unit: 'متر', price: 4000 },
];
const LAB = [{ id: 1, system_amps: 200, price: 2592000 }];
const make = (adjustments) => buildQuoteDraft(
  buildOptions({ materials: MATS, laborTiers: LAB, settingsRow: SET, roofAreaM2: 400,
    ampDay: 50, ampNight: 10, nightSupplyHours: 8 }),
  { tier: 'economy', cableMeters: { 6: 200 }, adjustments },
);

describe('مبلغ الوصول على عرض حقيقي', () => {
  const base = make(null).total;

  it('مبلغ أعلى: المجموع يطلع الرقم المكتوب بالضبط وبلا سطر ظاهر', () => {
    const target = 30000000;
    const d = make(adjustmentsForTarget(base, target));
    expect(d.total).toBe(target);
    expect(d.items.some((i) => /زياد|خصم/.test(i.description))).toBe(false);
  });

  it('مبلغ أوطأ: نفس الشي — ينزل بهدوء بلا سطر خصم', () => {
    const target = 22000000;
    const d = make(adjustmentsForTarget(base, target));
    expect(d.total).toBe(target);
    expect(d.items.some((i) => /زياد|خصم/.test(i.description))).toBe(false);
  });

  it('وبالسويج العلني يطلع سطر بالعرض', () => {
    const d = make(adjustmentsForTarget(base, 22000000, { visible: true }));
    expect(d.items.some((i) => /^خصم/.test(i.description))).toBe(true);
  });

  it('كل بند يظل (الكمية × سعر الوحدة = المجموع)', () => {
    for (const i of make(adjustmentsForTarget(base, 30000000)).items)
      expect(i.subtotal).toBe(Math.round(i.quantity * i.unit_price));
  });

  it('مبلغ الوصول يطابق مليوناً كاملاً فما يحتاج تنبيه المصرف', () => {
    const d = make(adjustmentsForTarget(base, 30000000));
    expect(isWholeMillions(d.total)).toBe(true);
    expect(bankRoundOptions(d.total)).toBe(null);
  });
});
