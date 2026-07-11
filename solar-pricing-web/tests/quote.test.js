import { describe, it, expect } from 'vitest';
import { buildOptions, buildQuoteDraft } from '../src/lib/quoteService.js';

// بيانات تجريبية مطابقة للمثال المرجعي (بدون عمود كمية مخزون)
const SETTINGS_ROW = {
  system_voltage: 220,
  system_efficiency: 0.8,
  inverter_safety_factor: 1.25,
  dod: 0.9,
  night_coverage_hours: 8,
  panel_area_m2: 2.7,
  currency: 'دينار عراقي',
  quote_number_start: 7400,
  charge_panels_per_battery: 1.5,
};

const MATERIALS = [
  { id: 1, category: 'panel', model: 'JINKO 650', full_description: 'ألواح شمسية 650 واط', unit: 'عدد', watt_or_capacity: 650, price: 185000, qty_per_panel: null },
  { id: 2, category: 'inverter', model: 'COSPOWER 6kW', full_description: 'انفيرتر 6 كيلو واط', unit: 'عدد', watt_or_capacity: 6000, price: 650000, qty_per_panel: null },
  { id: 3, category: 'battery', model: 'COSPOWER 16kWh', full_description: 'بطاريات ليثيوم 16kWh', unit: 'عدد', watt_or_capacity: 16, price: 2750000, qty_per_panel: null },
  { id: 4, category: 'secondary', model: 'هيكل', full_description: 'هيكل الألواح مغلون', unit: 'عدد', watt_or_capacity: null, price: 65000, qty_per_panel: 1 },
  { id: 5, category: 'secondary', model: 'صبات', full_description: 'صبات لتثبيت الهياكل', unit: 'عدد', watt_or_capacity: null, price: 5000, qty_per_panel: 1 },
  { id: 6, category: 'secondary', model: 'كيبل 6مم', full_description: 'كيبلات ناقلة من الألواح إلى الانفيرتر', unit: 'متر', watt_or_capacity: null, price: 2000, qty_per_panel: null },
  { id: 7, category: 'secondary', model: 'بورد حماية', full_description: 'بوردات الحماية DC', unit: 'عدد', watt_or_capacity: null, price: 150000, qty_per_panel: 0 },
];

const LABOR = [
  { id: 1, system_amps: 10, price: 400000 },
  { id: 2, system_amps: 15, price: 550000 },
  { id: 3, system_amps: 20, price: 700000 },
];

function optionsFor(input) {
  return buildOptions({ materials: MATERIALS, laborTiers: LABOR, settingsRow: SETTINGS_ROW, ...input });
}

describe('المثال المرجعي بعد إلغاء المخزون (15 أمبير، 8 ساعات، سطح 28م²)', () => {
  it('يطابق الفاتورة: 10 ألواح، 2 بطارية، انفيرتر، مجموع 9,686,000', () => {
    const options = optionsFor({ roofAreaM2: 28, ampDay: 15, ampNight: 15, nightSupplyHours: 8 });
    const draft = buildQuoteDraft(options, { tier: 'economy', cableMeters: { 6: 143 } });
    expect(draft.errors).toEqual({});
    expect(draft.panelBreakdown).toEqual({ feedPanels: 7, chargePanels: 3 });
    expect(draft.items.find((i) => i.description.includes('ألواح شمسية')).quantity).toBe(10);
    expect(draft.items.find((i) => i.description.includes('بطاريات ليثيوم')).quantity).toBe(2);
    expect(draft.items.find((i) => i.description.includes('انفيرتر')).quantity).toBe(1);
    expect(draft.total).toBe(9686000);
  });
});

describe('إلغاء المخزون: المواد تُختار دائماً بلا فحص كمية', () => {
  it('منظومة كبيرة (50 أمبير) تُنشأ بدون أي خطأ مخزون', () => {
    const options = optionsFor({ roofAreaM2: 200, ampDay: 50, ampNight: 50, nightSupplyHours: 4 });
    const draft = buildQuoteDraft(options, { tier: 'economy', cableMeters: {} });
    // ما فيه أي خطأ من نوع مخزون (بس ممكن خطأ أجور عمل للحجم 50 لأنه غير معرّف)
    const stockErrors = Object.keys(draft.errors).filter((k) => k.startsWith('secondary_'));
    expect(stockErrors).toEqual([]);
    expect(draft.items.find((i) => i.description.includes('بطاريات')).quantity).toBe(4);
  });
});

describe('فحص المساحة الحاجب باقٍ', () => {
  it('سطح 20م² مع 10 ألواح مطلوبة → خطأ مساحة', () => {
    const options = optionsFor({ roofAreaM2: 20, ampDay: 15, ampNight: 15, nightSupplyHours: 8 });
    const draft = buildQuoteDraft(options, { tier: 'economy', cableMeters: {} });
    expect(draft.errors.roofArea).toContain('27');
  });
});

describe('نسبة الزيادة والخصم على العرض', () => {
  const base = () => optionsFor({ roofAreaM2: 28, ampDay: 15, ampNight: 15, nightSupplyHours: 8 });

  it('بدون adjustments: لا سطر زيادة/خصم والمجموع كما هو', () => {
    const draft = buildQuoteDraft(base(), { tier: 'economy', cableMeters: { 6: 143 } });
    expect(draft.total).toBe(9686000);
    expect(draft.items.some((i) => /زيادة|خصم/.test(i.description))).toBe(false);
    expect(draft.adjustments.markupAmount).toBe(0);
    expect(draft.adjustments.discountAmount).toBe(0);
  });

  it('زيادة علنية 10%: سطر واضح بالعرض والمجموع يرتفع بالضبط', () => {
    const draft = buildQuoteDraft(base(), {
      tier: 'economy',
      cableMeters: { 6: 143 },
      adjustments: { markupPercent: 10, markupMode: 'visible' },
    });
    const row = draft.items.find((i) => i.description === 'نسبة زيادة 10%');
    expect(row).toBeTruthy();
    expect(row.subtotal).toBe(968600);
    expect(draft.total).toBe(9686000 + 968600);
    expect(draft.adjustments.subtotal).toBe(9686000);
  });

  it('زيادة موزعة 10%: بلا سطر إضافي، الأسعار نفسها ترتفع والمجموع يقارب +10%', () => {
    const plain = buildQuoteDraft(base(), { tier: 'economy', cableMeters: { 6: 143 } });
    const draft = buildQuoteDraft(base(), {
      tier: 'economy',
      cableMeters: { 6: 143 },
      adjustments: { markupPercent: 10, markupMode: 'distributed' },
    });
    expect(draft.items.length).toBe(plain.items.length); // ماكو سطر زيادة
    expect(draft.items.some((i) => /زيادة/.test(i.description))).toBe(false);
    // كل بند سعره أعلى أو يساوي البند الأصلي، والمجموع ضمن ±1% من الهدف (بسبب تقريب الأسعار)
    for (let i = 0; i < plain.items.length; i++) {
      expect(draft.items[i].unit_price).toBeGreaterThanOrEqual(plain.items[i].unit_price);
    }
    const target = plain.total * 1.1;
    expect(Math.abs(draft.total - target) / target).toBeLessThan(0.01);
    // البند المجموع = الكمية × سعر الوحدة (متسق للطباعة)
    for (const item of draft.items) expect(item.subtotal).toBe(Math.round(item.quantity * item.unit_price));
  });

  it('خصم 5%: سطر خصم بقيمة سالبة ينطرح من المجموع', () => {
    const draft = buildQuoteDraft(base(), {
      tier: 'economy',
      cableMeters: { 6: 143 },
      adjustments: { discountPercent: 5 },
    });
    const row = draft.items.find((i) => i.description === 'خصم 5%');
    expect(row).toBeTruthy();
    expect(row.subtotal).toBe(-484300);
    expect(draft.total).toBe(9686000 - 484300);
  });

  it('زيادة علنية + خصم معاً: الخصم ينحسب على المجموع بعد الزيادة', () => {
    const draft = buildQuoteDraft(base(), {
      tier: 'economy',
      cableMeters: { 6: 143 },
      adjustments: { markupPercent: 10, markupMode: 'visible', discountPercent: 5 },
    });
    const afterMarkup = 9686000 + 968600;
    const discount = Math.round(afterMarkup * 0.05);
    expect(draft.total).toBe(afterMarkup - discount);
    expect(draft.adjustments.markupAmount).toBe(968600);
    expect(draft.adjustments.discountAmount).toBe(discount);
  });
});
