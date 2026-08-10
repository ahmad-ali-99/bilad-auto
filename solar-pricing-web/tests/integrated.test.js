import { describe, it, expect } from 'vitest';
import { buildOptions, buildQuoteDraft } from '../src/lib/quoteService.js';

// السستم المتكامل: كابينة تجمع البطاريات والانفيرتر بجهاز واحد، فتحل محلهما سوية.
// عددها يدوي لأن هالأجهزة ثلاثية الطور والمعادلة مبنية على 220 فولت أحادي الطور.
const SETTINGS_ROW = {
  system_voltage: 220, system_efficiency: 0.8, inverter_safety_factor: 1.25, dod: 0.9,
  night_coverage_hours: 8, panel_area_m2: 2.7, currency: 'دينار', quote_number_start: 7400,
  charge_panels_per_battery: 1.5,
};
const CABINET_PRICE = 65000000;
const MATERIALS = [
  { id: 1, category: 'panel', model: 'JINKO 650', full_description: 'ألواح 650 واط', unit: 'عدد', watt_or_capacity: 650, price: 185000, qty_per_panel: null },
  { id: 2, category: 'inverter', model: 'COSPOWER 6kW', full_description: 'انفيرتر 6 كيلو', unit: 'عدد', watt_or_capacity: 6000, price: 650000, qty_per_panel: null },
  { id: 3, category: 'battery', model: 'COSPOWER 16kWh', full_description: 'بطارية 16kWh', unit: 'عدد', watt_or_capacity: 16, price: 2750000, qty_per_panel: null },
  { id: 9, category: 'integrated', brand: 'Hoymiles', model: 'HESS-261-2h', full_description: 'كابينة تخزين 261kWh + انفيرتر 125kW', unit: 'عدد', watt_or_capacity: 261, price: CABINET_PRICE, qty_per_panel: null },
];
const LABOR = [{ id: 1, system_amps: 15, price: 550000 }, { id: 2, system_amps: 30, price: 900000 }];

const opts = (input) => buildOptions({ materials: MATERIALS, laborTiers: LABOR, settingsRow: SETTINGS_ROW, ...input });
const base = { roofAreaM2: 500, ampDay: 20, ampNight: 15, nightSupplyHours: 8 };

describe('نوع المنظومة: سستم متكامل', () => {
  it('يضيف بند الكابينة ولا يضيف بطارية ولا انفيرتر منفصلين', () => {
    const draft = buildQuoteDraft(opts(base), {
      tier: 'economy', systemType: 'integrated',
      integrated: { materialId: 9, units: 1, kw: 125 },
      secondarySelections: {},
    });
    const ids = draft.items.map((i) => i.material_id);
    expect(ids).toContain(9);          // الكابينة موجودة
    expect(ids).not.toContain(3);      // بلا بطارية منفصلة
    expect(ids).not.toContain(2);      // بلا انفيرتر منفصل
  });

  it('العدد يدوي ويضرب بالسعر', () => {
    const one = buildQuoteDraft(opts(base), {
      tier: 'economy', systemType: 'integrated', integrated: { materialId: 9, units: 1, kw: 125 }, secondarySelections: {},
    });
    const three = buildQuoteDraft(opts(base), {
      tier: 'economy', systemType: 'integrated', integrated: { materialId: 9, units: 3, kw: 125 }, secondarySelections: {},
    });
    const lineOf = (d) => d.items.find((i) => i.material_id === 9);
    expect(lineOf(one).quantity).toBe(1);
    expect(lineOf(one).subtotal).toBe(CABINET_PRICE);
    expect(lineOf(three).quantity).toBe(3);
    expect(lineOf(three).subtotal).toBe(CABINET_PRICE * 3);
    expect(three.total - one.total).toBe(CABINET_PRICE * 2);
  });

  it('الألواح تبقى محسوبة مثل المنظومة الكاملة', () => {
    const draft = buildQuoteDraft(opts(base), {
      tier: 'economy', systemType: 'integrated', integrated: { materialId: 9, units: 1, kw: 125 }, secondarySelections: {},
    });
    const panel = draft.items.find((i) => i.material_id === 1);
    expect(panel).toBeDefined();
    expect(panel.quantity).toBeGreaterThan(0);
  });

  it('القدرة تُحسب من الكابينة نفسها مع تنبيه الطور الثلاثي', () => {
    const draft = buildQuoteDraft(opts(base), {
      tier: 'economy', systemType: 'integrated', integrated: { materialId: 9, units: 2, kw: 125 }, secondarySelections: {},
    });
    // 2 كابينة × 261 kWh × عمق تفريغ 0.9 ÷ (15 أمبير × 220 فولت)
    const expectedHours = Math.round(((2 * 261 * 0.9 * 1000) / (15 * 220)) * 10) / 10;
    expect(draft.capability.nightHours).toBe(expectedHours);
    expect(draft.capability.dayAmps).toBe(Math.floor((2 * 125000) / (220 * 1.25)));
    expect(draft.capability.threePhaseNote).toBe(true);
  });

  it('يعطي خطأ واضح إذا ماكو كابينة بالمخزون', () => {
    const noCabinet = buildOptions({
      materials: MATERIALS.filter((m) => m.category !== 'integrated'),
      laborTiers: LABOR, settingsRow: SETTINGS_ROW, ...base,
    });
    const draft = buildQuoteDraft(noCabinet, {
      tier: 'economy', systemType: 'integrated', integrated: { materialId: 9, units: 1, kw: 125 }, secondarySelections: {},
    });
    expect(draft.errors.integrated).toMatch(/سستم متكامل/);
  });

  it('الأنواع الأخرى ما تتأثر — البطارية والانفيرتر يبقون', () => {
    const draft = buildQuoteDraft(opts(base), { tier: 'economy', secondarySelections: {} });
    const ids = draft.items.map((i) => i.material_id);
    expect(ids).toContain(2);
    expect(ids).toContain(3);
    expect(ids).not.toContain(9);
  });
});
