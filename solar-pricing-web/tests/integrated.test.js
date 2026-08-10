import { describe, it, expect } from 'vitest';
import { buildOptions, buildQuoteDraft } from '../src/lib/quoteService.js';

// السستم المتكامل: كابينة تجمع البطاريات والانفيرتر بجهاز واحد.
// التحجيم تلقائي مثل باقي الفئات: القدرة (kW) والسعة (kWh) سوية، والأكبر منهما يفرض العدد.
const SETTINGS_ROW = {
  system_voltage: 220, system_efficiency: 0.8, inverter_safety_factor: 1.25, dod: 0.9,
  night_coverage_hours: 8, panel_area_m2: 2.7, currency: 'دينار', quote_number_start: 7400,
  charge_panels_per_battery: 1.5,
};
const BIG = { id: 9, category: 'integrated', brand: 'Hoymiles', model: 'HESS-261-2h', full_description: 'كابينة 261kWh + 125kW', unit: 'عدد', watt_or_capacity: 261, integrated_kw: 125, price: 65000000, qty_per_panel: null };
const SMALL = { id: 8, category: 'integrated', brand: 'Test', model: 'SMALL-100', full_description: 'كابينة 100kWh + 50kW', unit: 'عدد', watt_or_capacity: 100, integrated_kw: 50, price: 30000000, qty_per_panel: null };
const BASE_MATERIALS = [
  { id: 1, category: 'panel', model: 'JINKO 650', full_description: 'ألواح 650 واط', unit: 'عدد', watt_or_capacity: 650, price: 185000, qty_per_panel: null },
  { id: 2, category: 'inverter', model: 'COSPOWER 6kW', full_description: 'انفيرتر 6 كيلو', unit: 'عدد', watt_or_capacity: 6000, price: 650000, qty_per_panel: null },
  { id: 3, category: 'battery', model: 'COSPOWER 16kWh', full_description: 'بطارية 16kWh', unit: 'عدد', watt_or_capacity: 16, price: 2750000, qty_per_panel: null },
];
const LABOR = [{ id: 1, system_amps: 15, price: 550000 }, { id: 2, system_amps: 30, price: 900000 }, { id: 3, system_amps: 1000, price: 5000000 }];

const opts = (input, cabinets = [BIG]) =>
  buildOptions({ materials: [...BASE_MATERIALS, ...cabinets], laborTiers: LABOR, settingsRow: SETTINGS_ROW, ...input });
const small = { roofAreaM2: 500, ampDay: 20, ampNight: 15, nightSupplyHours: 8 };
const draftOf = (o, extra = {}) => buildQuoteDraft(o, { tier: 'economy', systemType: 'integrated', secondarySelections: {}, ...extra });
const cabinetLine = (d) => d.items.find((i) => [BIG.id, SMALL.id].includes(i.material_id));

describe('السستم المتكامل: التحجيم التلقائي', () => {
  it('يضيف بند الكابينة ولا يضيف بطارية ولا انفيرتر منفصلين', () => {
    const ids = draftOf(opts(small)).items.map((i) => i.material_id);
    expect(ids).toContain(BIG.id);
    expect(ids).not.toContain(3);
    expect(ids).not.toContain(2);
  });

  it('العدد ينحسب من القدرة المطلوبة (kW)', () => {
    // حمل 600 أمبير نهاراً = 600×220×1.25 ÷ 1000 = 165 kW ← كابينة 125 kW ما تكفي، فلازم 2
    const d = draftOf(opts({ ...small, ampDay: 600, ampNight: 0, nightSupplyHours: 0 }));
    expect(cabinetLine(d).quantity).toBe(2);
    expect(d.integrated.required.kw).toBeCloseTo(165, 5);
  });

  it('العدد ينحسب من السعة المطلوبة (kWh) إذا هي الأكبر', () => {
    // 600 أمبير ليلاً لـ8 ساعات = 1056 kWh ÷ 0.9 = 1173.3 ← كابينة 261 kWh ← 5 كابينات
    const d = draftOf(opts({ ...small, ampDay: 0, ampNight: 600, nightSupplyHours: 8 }));
    expect(cabinetLine(d).quantity).toBe(5);
    expect(d.integrated.options.find((o) => o.id === BIG.id).driver).toBe('kwh');
  });

  it('يختار الأرخص إجمالاً لما تكفي أكثر من كابينة', () => {
    // حمل صغير: الصغيرة (30 مليون) تكفي بوحدة وحدة، فتنختار قبل الكبيرة (65 مليون)
    const d = draftOf(opts(small, [BIG, SMALL]));
    expect(cabinetLine(d).material_id).toBe(SMALL.id);
    expect(d.integrated.chosenId).toBe(SMALL.id);
  });

  it('التبديل اليدوي يتقدم على الاختيار التلقائي', () => {
    const d = draftOf(opts(small, [BIG, SMALL]), { overrides: { integrated: BIG.id } });
    expect(cabinetLine(d).material_id).toBe(BIG.id);
  });

  it('أزرار الزيادة والنقصان تعدّل العدد فوق المحسوب', () => {
    const auto = draftOf(opts(small));
    const plus = draftOf(opts(small), { extraUnits: { integrated: 2 } });
    expect(plus.counts.integrated).toBe(auto.counts.integrated + 2);
    expect(plus.baseCounts.integrated).toBe(auto.counts.integrated);
    expect(cabinetLine(plus).subtotal).toBe(BIG.price * (auto.counts.integrated + 2));
  });

  it('ما ينزل تحت كابينة وحدة مهما نقّص', () => {
    const d = draftOf(opts(small), { extraUnits: { integrated: -99 } });
    expect(cabinetLine(d).quantity).toBe(1);
  });

  it('كل خيار بالمبدّل يجي بقدرته وسعته وعدده وسعره', () => {
    const d = draftOf(opts(small, [BIG, SMALL]));
    const opt = d.integrated.options.find((o) => o.id === BIG.id);
    expect(opt).toMatchObject({ kw: 125, kwh: 261, units: 1, totalPrice: BIG.price });
    expect(d.integrated.options).toHaveLength(2);
  });

  it('القدرة تُحسب من الكابينة المختارة مع تنبيه الطور الثلاثي', () => {
    const d = draftOf(opts(small), { extraUnits: { integrated: 1 } }); // كابينتين
    const expectedHours = Math.round(((2 * 261 * 0.9 * 1000) / (15 * 220)) * 10) / 10;
    expect(d.capability.nightHours).toBe(expectedHours);
    expect(d.capability.dayAmps).toBe(Math.floor((2 * 125000) / (220 * 1.25)));
    expect(d.capability.threePhaseNote).toBe(true);
  });

  it('الألواح تبقى محسوبة مثل المنظومة الكاملة', () => {
    const panel = draftOf(opts(small)).items.find((i) => i.material_id === 1);
    expect(panel.quantity).toBeGreaterThan(0);
  });

  it('يعطي خطأ واضح إذا ماكو كابينة بالمخزون', () => {
    expect(draftOf(opts(small, [])).errors.integrated).toMatch(/سستم متكامل/);
  });

  it('الأنواع الثانية ما تتأثر — البطارية والانفيرتر يبقون والكابينة ما تدخل', () => {
    const ids = buildQuoteDraft(opts(small), { tier: 'economy', secondarySelections: {} }).items.map((i) => i.material_id);
    expect(ids).toContain(2);
    expect(ids).toContain(3);
    expect(ids).not.toContain(BIG.id);
  });
});
