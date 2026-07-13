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
    expect(draft.panelBreakdown).toEqual({ feedPanels: 7, chargePanels: 3, extraPanels: 0 });
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

describe('التقسيط المصرفي: المجموع × النسبة ÷ الأشهر (بدون جمع 1)', () => {
  const base = () => optionsFor({ roofAreaM2: 28, ampDay: 15, ampNight: 15, nightSupplyHours: 8 });

  it('نسبة 1.3 و60 شهر تطابق عروض الشركة القديمة', () => {
    const draft = buildQuoteDraft(base(), {
      tier: 'economy',
      cableMeters: { 6: 143 },
      adjustments: { installment: { enabled: true, rate: 1.3, months: 60 } },
    });
    expect(draft.total).toBe(9686000); // المجموع النقدي ما يتغير
    expect(draft.installment.totalWithInterest).toBe(Math.round(9686000 * 1.3));
    expect(draft.installment.monthly).toBe(Math.round((9686000 * 1.3) / 60));
    // ما ينضاف أي سطر للجدول
    expect(draft.items.some((i) => /تقسيط|فائدة/.test(i.description))).toBe(false);
  });

  it('التقسيط ينحسب على المجموع بعد الزيادة والخصم', () => {
    const draft = buildQuoteDraft(base(), {
      tier: 'economy',
      cableMeters: { 6: 143 },
      adjustments: { markupPercent: 10, markupMode: 'visible', installment: { enabled: true, rate: 1.35, months: 60 } },
    });
    const finalTotal = 9686000 + 968600;
    expect(draft.total).toBe(finalTotal);
    expect(draft.installment.totalWithInterest).toBe(Math.round(finalTotal * 1.35));
    expect(draft.installment.monthly).toBe(Math.round((finalTotal * 1.35) / 60));
  });

  it('بدون تأشير: لا يوجد تقسيط بالمسودة', () => {
    const draft = buildQuoteDraft(base(), { tier: 'economy', cableMeters: { 6: 143 } });
    expect(draft.installment).toBe(null);
  });
});

describe('الزيادة/النقصان اليدوي بالوحدات (لوح ±2، بطارية/انفيرتر ±1)', () => {
  const base = () => optionsFor({ roofAreaM2: 40, ampDay: 15, ampNight: 15, nightSupplyHours: 8 });

  it('لوح +2: العدد والسعر يزيدان لوحين والعدد يبقى زوجي', () => {
    const plain = buildQuoteDraft(base(), { tier: 'economy', cableMeters: {} });
    const draft = buildQuoteDraft(base(), { tier: 'economy', cableMeters: {}, extraUnits: { panel: 2 } });
    expect(draft.counts.panel).toBe(plain.counts.panel + 2);
    expect(draft.counts.panel % 2).toBe(0);
    expect(draft.panelBreakdown.extraPanels).toBe(2);
    const panelItem = draft.items.find((i) => i.description.includes('ألواح'));
    expect(panelItem.quantity).toBe(plain.counts.panel + 2);
    expect(draft.total).toBe(plain.total + 2 * 185000 + 2 * 65000 + 2 * 5000); // لوحان + هيكلان + صبتان
  });

  it('بطارية +1 وانفيرتر +1: الأعداد والقدرة الفعلية تتحدث', () => {
    const plain = buildQuoteDraft(base(), { tier: 'economy', cableMeters: {} });
    const draft = buildQuoteDraft(base(), { tier: 'economy', cableMeters: {}, extraUnits: { battery: 1, inverter: 1 } });
    expect(draft.counts.battery).toBe(plain.counts.battery + 1);
    expect(draft.counts.inverter).toBe(plain.counts.inverter + 1);
    // ساعات الليل ترتفع بنفس نسبة زيادة البنك، وأمبير النهار بنسبة الانفيرترات
    expect(draft.capability.nightHours).toBeGreaterThan(plain.capability.nightHours);
    expect(draft.capability.dayAmps).toBeGreaterThan(plain.capability.dayAmps);
    // ساعات الليل = بنك×DOD×1000 ÷ (أمبير×فولت)
    const expectedHours = Math.round(((draft.counts.battery * 16 * 0.9 * 1000) / (15 * 220)) * 10) / 10;
    expect(draft.capability.nightHours).toBe(expectedHours);
  });

  it('النقصان لا ينزل تحت الحد الأدنى (بطارية 1، لوح 2)', () => {
    const draft = buildQuoteDraft(base(), { tier: 'economy', cableMeters: {}, extraUnits: { battery: -99, panel: -99 } });
    expect(draft.counts.battery).toBe(1);
    expect(draft.counts.panel).toBe(2);
  });

  it('لوح فردي يتقرب لمضاعف 2 (لا أعداد فردية أبداً)', () => {
    const plain = buildQuoteDraft(base(), { tier: 'economy', cableMeters: {} });
    const draft = buildQuoteDraft(base(), { tier: 'economy', cableMeters: {}, extraUnits: { panel: 3 } });
    expect(draft.counts.panel % 2).toBe(0);
    expect(Math.abs(draft.counts.panel - plain.counts.panel)).toBeLessThanOrEqual(4);
  });

  it('زيادة الألواح تفعّل فحص المساحة الحاجب إذا ما تكفي', () => {
    const tight = optionsFor({ roofAreaM2: 28, ampDay: 15, ampNight: 15, nightSupplyHours: 8 }); // تكفي بالضبط لـ10
    const draft = buildQuoteDraft(tight, { tier: 'economy', cableMeters: {}, extraUnits: { panel: 4 } });
    expect(draft.errors.roofArea).toBeTruthy();
  });
});
