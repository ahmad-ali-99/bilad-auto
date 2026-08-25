import { describe, it, expect } from 'vitest';
import { buildOptions, buildQuoteDraft } from '../src/lib/quoteService.js';
import { hiddenMarkupPercentFor, HIDDEN_MARKUP_PERCENT } from '../src/lib/permissions.js';

const SETTINGS_ROW = {
  system_voltage: 230, system_efficiency: 0.8, inverter_safety_factor: 1.25, dod: 0.9,
  night_coverage_hours: 8, panel_area_m2: 2.7, currency: 'د', quote_number_start: 400,
  charge_panels_per_battery: 1,
};
const MATERIALS = [
  { id: 1, category: 'panel', model: 'LONGi 650', full_description: 'ألواح 650 واط', unit: 'عدد', watt_or_capacity: 650, price: 200000 },
  { id: 2, category: 'inverter', model: 'Deye 16kW', full_description: 'انفيرتر 16 كيلو', unit: 'عدد', watt_or_capacity: 16000, price: 3900000 },
  { id: 3, category: 'battery', model: 'Hoymiles 16', full_description: 'بطارية 16', unit: 'عدد', watt_or_capacity: 16, price: 4000000 },
  { id: 4, category: 'secondary', model: 'هيكل', full_description: 'هيكل الألواح', unit: 'عدد', price: 130000, qty_per_panel: 1 },
  { id: 5, category: 'secondary', model: 'صبات', full_description: 'صبّات', unit: 'عدد', price: 10900, qty_per_panel: 1 },
  { id: 6, category: 'secondary', model: 'كيبل 6مم', full_description: 'كيبلات 6 ملم', unit: 'متر', price: 4000 },
];
const LABOR = [{ id: 1, system_amps: 200, price: 2592000 }];

const draft = (hiddenMarkupPercent) => {
  const options = buildOptions({
    materials: MATERIALS, laborTiers: LABOR, settingsRow: SETTINGS_ROW,
    roofAreaM2: 400, ampDay: 50, ampNight: 10, nightSupplyHours: 8,
  });
  return buildQuoteDraft(options, { tier: 'economy', cableMeters: { 6: 200 }, hiddenMarkupPercent });
};
const panelLine = (d) => d.items.find((i) => i.material_id === 1);

describe('الزيادة المخفية على الحسابات المحددة', () => {
  it('الحسابات الخمسة عليها 10% والباقي بلا زيادة', () => {
    expect(HIDDEN_MARKUP_PERCENT).toBe(10);
    for (const u of ['براء مكتب النواعير', 'ابو يزن الطاقة الخضراء', 'مصطفى شركة سيل',
                     'حسين انوار المدينه', 'محمد يعقوب كربلاء 42', 'براء', 'حسين'])
      expect(hiddenMarkupPercentFor(u), u).toBe(10);
    for (const u of ['أحمد', 'حيدر', 'حوراء', 'بكر', 'علي سبتي', 'ليث كرادة', ''])
      expect(hiddenMarkupPercentFor(u), u).toBe(0);
  });

  it('المجموع يطلع أعلى بـ10% تقريباً', () => {
    const base = draft(0).total;
    const up = draft(10).total;
    const pct = ((up - base) / base) * 100;
    expect(pct).toBeGreaterThan(9.5);
    expect(pct).toBeLessThan(10.5);
  });

  it('سعر اللوح ما ينلمس إطلاقاً — يبقى سعر المخزون بالضبط', () => {
    const a = panelLine(draft(0)), b = panelLine(draft(10));
    expect(a.unit_price).toBe(200000);
    expect(b.unit_price).toBe(200000);
    expect(b.subtotal).toBe(a.subtotal);
  });

  it('الزيادة كلها نزلت على البنود غير الألواح', () => {
    const base = draft(0), up = draft(10);
    const other = (d) => d.items.filter((i) => i.material_id !== 1).reduce((s, i) => s + i.subtotal, 0);
    expect(other(up) - other(base)).toBe(up.total - base.total);
  });

  it('ماكو أي أثر ظاهر: ولا سطر زيادة، ولا نسبة بالملخص', () => {
    const d = draft(10);
    expect(d.items.some((i) => /زياد|نسبة|markup/i.test(i.description))).toBe(false);
    expect(d.adjustments?.markupPercent || 0).toBe(0);
    expect(d.adjustments?.markupAmount || 0).toBe(0);
    expect(JSON.stringify(d)).not.toContain('hiddenMarkup');
  });

  it('كل بند حامل يظل (الكمية × سعر الوحدة = المجموع) — بلا رقم يفضح التعديل', () => {
    for (const i of draft(10).items) expect(i.subtotal).toBe(Math.round(i.quantity * i.unit_price));
  });

  it('خصم البياع ينحسب بعد الزيادة، فالهامش يبقى محفوظاً', () => {
    const options = buildOptions({
      materials: MATERIALS, laborTiers: LABOR, settingsRow: SETTINGS_ROW,
      roofAreaM2: 400, ampDay: 50, ampNight: 10, nightSupplyHours: 8,
    });
    const withBoth = buildQuoteDraft(options, {
      tier: 'economy', cableMeters: { 6: 200 }, hiddenMarkupPercent: 10,
      adjustments: { discountPercent: 5 },
    });
    const plain = draft(10).total;
    expect(withBoth.total).toBe(plain - Math.round(plain * 5 / 100));
  });

  it('بلا نسبة ما يتغير ولا رقم', () => {
    expect(JSON.stringify(draft(0).items)).toBe(JSON.stringify(draft(0).items));
    const a = draft(0), b = draft(0);
    expect(a.total).toBe(b.total);
  });
});
