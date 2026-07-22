import { describe, it, expect } from 'vitest';
import { buildOptions, buildQuoteDraft } from '../src/lib/quoteService.js';
import * as calcModule from '../src/lib/calc.js';

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
    // معامل أمان الاقتصادي 0.9: 48.9×0.9=44 ← ceil(44/16)=3 بدل 4
    expect(draft.items.find((i) => i.description.includes('بطاريات')).quantity).toBe(3);
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

describe('دستور المستويات الجديد: IP قبل السعر + هويمايلز بالممتاز + معاملات البطاريات', () => {
  // مخزون موسع: انفيرترات بنفس الحجم وIP مختلف + أجهزة هويمايلز + بطاريات حدية
  const MATERIALS2 = [
    { id: 1, category: 'panel', model: 'JINKO 650', full_description: 'ألواح شمسية 650 واط', unit: 'عدد', watt_or_capacity: 650, price: 185000, qty_per_panel: null },
    { id: 10, category: 'inverter', brand: 'Felicity', model: 'Felicity 6kW', full_description: 'انفيرتر 6 كيلو IP21', unit: 'عدد', watt_or_capacity: 6000, price: 600000, qty_per_panel: null },
    { id: 11, category: 'inverter', brand: 'Gospower', model: 'Gospower 6kW', full_description: 'انفيرتر 6 كيلو IP65', unit: 'عدد', watt_or_capacity: 6000, price: 700000, qty_per_panel: null },
    { id: 12, category: 'inverter', brand: 'Growatt', model: 'Growatt 6kW', full_description: 'انفيرتر 6 كيلو IP65', unit: 'عدد', watt_or_capacity: 6000, price: 650000, qty_per_panel: null },
    { id: 13, category: 'inverter', brand: 'hoymiles', model: 'HIS6L-G3S', full_description: 'انفيرتر هويمايلز 6 كيلو IP66', unit: 'عدد', watt_or_capacity: 6000, price: 1265000, qty_per_panel: null },
    { id: 15, category: 'inverter', brand: 'hoymiles', model: 'HYS-12.0LV-EUG2', full_description: 'انفيرتر هويمايلز 12 كيلو IP65', unit: 'عدد', watt_or_capacity: 12000, price: 2553000, qty_per_panel: null },
    { id: 14, category: 'inverter', brand: 'Deye', model: 'Deye 50kW', full_description: 'انفيرتر 50 كيلو IP65', unit: 'عدد', watt_or_capacity: 50000, price: 6300000, qty_per_panel: null },
    { id: 20, category: 'battery', brand: 'Felicity', model: 'Felicity 15kWh', full_description: 'بطارية 15kWh', unit: 'عدد', watt_or_capacity: 15, price: 2150000, qty_per_panel: null },
    { id: 21, category: 'battery', brand: 'Deye', model: 'Deye 16kWh', full_description: 'بطارية 16kWh', unit: 'عدد', watt_or_capacity: 16, price: 2950000, qty_per_panel: null },
    { id: 22, category: 'battery', brand: 'hoymiles', model: 'LB16D-G3', full_description: 'بطارية هويمايلز 16kWh', unit: 'عدد', watt_or_capacity: 16, price: 2898000, qty_per_panel: null },
    { id: 30, category: 'secondary', model: 'هيكل', full_description: 'هيكل', unit: 'عدد', watt_or_capacity: null, price: 65000, qty_per_panel: 1 },
  ];
  const LABOR2 = [
    { id: 1, system_amps: 30, price: 400000 },
    { id: 2, system_amps: 200, price: 3000000 },
  ];
  const opts2 = (input) => buildOptions({ materials: MATERIALS2, laborTiers: LABOR2, settingsRow: SETTINGS_ROW, ...input });

  // 18 أمبير ليلي × 4 ساعات × 220 فولت = 15.84kWh ← ÷0.9 dod = 17.6kWh مطلوبة
  const borderline = { roofAreaM2: 60, ampDay: 18, ampNight: 18, nightSupplyHours: 4 };

  it('معامل الاقتصادي 0.9 يقلب 2×15kWh إلى 1×16kWh بالحالة الحدية', () => {
    const options = opts2(borderline);
    // 17.6×0.9=15.84 ← 16kWh توليفة وحدة، و15kWh توليفتين ← أقل عدد يفوز
    expect(options.batteryTiers.economy.units).toBe(1);
    expect(options.batteryTiers.economy.material.watt_or_capacity).toBe(16);
    // بمعامل 1.0 (بدون تسامح) نفس الحالة تطلع 2
    const strict = buildOptions({ materials: MATERIALS2, laborTiers: LABOR2, settingsRow: SETTINGS_ROW, ...borderline, batteryFactors: { economy: 1, standard: 1, premium: 1 } });
    expect(strict.batteryTiers.economy.units).toBe(2);
  });

  it('المتوسط يختار أعلى IP ثم الأرخص: Growatt IP65 (650) قبل Felicity IP21 (600) وقبل Gospower IP65 (700)', () => {
    const options = opts2(borderline);
    const draft = buildQuoteDraft(options, { tier: 'standard', cableMeters: {} });
    expect(draft.inverterTiers.standard.material.model).toBe('Growatt 6kW');
    // والاقتصادي يبقى الأرخص (Felicity IP21)
    expect(draft.inverterTiers.economy.material.model).toBe('Felicity 6kW');
  });

  it('الممتاز ≤120 أمبير: هويمايلز بتكبير الحجم لا التعديد — هامش ≥30% وبلا بطارية احتياط', () => {
    const options = opts2(borderline);
    const draft = buildQuoteDraft(options, { tier: 'premium', cableMeters: {} });
    // المطلوب ~6000W ← ×1.3 = 7800 ← هويمايلز 12kW وحدة وحدة (مو 6kW ×2)
    expect(draft.inverterTiers.premium.material.model).toBe('HYS-12.0LV-EUG2');
    expect(draft.inverterTiers.premium.units).toBe(1);
    expect(draft.inverterTiers.premium.units * draft.inverterTiers.premium.material.watt_or_capacity)
      .toBeGreaterThanOrEqual(6000 * 1.3);
    // البطارية: الأكبر سعة (هويمايلز 16kWh) بوحدة وحدة — بلا احتياط إضافي
    expect(options.batteryTiers.premium.material.model).toBe('LB16D-G3');
    expect(options.batteryTiers.premium.units).toBe(1);
    expect(options.batteryTiers.premium.extraUnit).toBeUndefined();
  });

  it('الممتاز فوق 120 أمبير يرجع للقاعدة العامة (مو مجبور هويمايلز)', () => {
    const options = opts2({ roofAreaM2: 500, ampDay: 150, ampNight: 0, nightSupplyHours: null });
    const draft = buildQuoteDraft(options, { tier: 'premium', cableMeters: {} });
    // الحمل 150×220×1.25=41.25kW ← هويمايلز 6kW يحتاج 9 أجهزة بينما Deye 50kW وحدتين أرخص
    expect(draft.inverterTiers.premium.material.model).toBe('Deye 50kW');
  });

  it('بدون أي هويمايلز بالمخزون الممتاز يشتغل عادي بالقاعدة الحالية', () => {
    const noHoy = MATERIALS2.filter((m) => m.brand !== 'hoymiles');
    const options = buildOptions({ materials: noHoy, laborTiers: LABOR2, settingsRow: SETTINGS_ROW, ...borderline });
    const draft = buildQuoteDraft(options, { tier: 'premium', cableMeters: {} });
    expect(draft.errors).toEqual({});
    expect(draft.inverterTiers.premium).toBeTruthy();
    expect(options.batteryTiers.premium.extraUnit).toBeUndefined();
    expect(options.batteryTiers.premium.units).toBe(1);
  });
});

describe('حاسبة الزبون: الثانوية الافتراضية فقط (لا كل المخزون)', () => {
  it('تمرير secondarySelections بالافتراضيات يحصر البنود الثانوية بها', async () => {
    const { computeSecondaryDefaults } = await import('../src/lib/secondaryDefaults.js');
    const secondary = [
      { id: 30, category: 'secondary', model: 'هيكل', unit: 'عدد', price: 65000, qty_per_panel: 1 },
      { id: 31, category: 'secondary', model: 'صبات', unit: 'عدد', price: 5000, qty_per_panel: 1 },
      { id: 32, category: 'secondary', model: 'بوردة حماية DC', unit: 'عدد', price: 150000, qty_per_panel: 0 },
      { id: 33, category: 'secondary', model: 'منظومة تأريض', unit: 'عدد', price: 750000, qty_per_panel: 0 },
      { id: 34, category: 'secondary', model: 'طفاية حريق', unit: 'عدد', price: 75000, qty_per_panel: 0 },
      { id: 35, category: 'secondary', model: 'كيبل 6مم', unit: 'متر', price: 2000, qty_per_panel: null },
    ];
    const defaults = computeSecondaryDefaults(secondary, null);
    // الافتراضيات: هيكل + صبات (لكل لوح) + بوردة DC فقط
    expect(Object.keys(defaults).map(Number).sort()).toEqual([30, 31, 32]);

    const materials = [
      { id: 1, category: 'panel', model: 'JINKO 650', full_description: 'ألواح 650', unit: 'عدد', watt_or_capacity: 650, price: 185000, qty_per_panel: null },
      { id: 2, category: 'inverter', model: 'INV 6kW', full_description: 'انفيرتر IP65', unit: 'عدد', watt_or_capacity: 6000, price: 650000, qty_per_panel: null },
      { id: 3, category: 'battery', model: 'BAT 16', full_description: 'بطارية 16kWh', unit: 'عدد', watt_or_capacity: 16, price: 2750000, qty_per_panel: null },
      ...secondary,
    ];
    const options = buildOptions({ materials, laborTiers: [{ id: 1, system_amps: 30, price: 400000 }], settingsRow: SETTINGS_ROW, roofAreaM2: 40, ampDay: 10, ampNight: 10, nightSupplyHours: 4 });
    const draft = buildQuoteDraft(options, { tier: 'economy', secondarySelections: defaults });
    const secondaryItems = draft.items.filter((i) => [30, 31, 32, 33, 34, 35].includes(i.material_id));
    expect(secondaryItems.map((i) => i.material_id).sort()).toEqual([30, 31, 32]);
    // ومن دون التمرير: كل مواد العدد تنضاف (السلوك القديم للموظفين قبل الاختيار)
    const draftAll = buildQuoteDraft(options, { tier: 'economy' });
    expect(draftAll.items.filter((i) => [33, 34].includes(i.material_id)).length).toBe(2);
  });
});

describe('منظومات بلا بطاريات (نهارية) وبلا ألواح (انفيرتر + بطارية فقط)', () => {
  it('أمبير ليلي صفر: بلا بطاريات وبلا خطأ — ألواح تغذية فقط', () => {
    const options = optionsFor({ roofAreaM2: 28, ampDay: 15, ampNight: 0, nightSupplyHours: null });
    const draft = buildQuoteDraft(options, { tier: 'economy', cableMeters: {} });
    expect(draft.errors).toEqual({});
    expect(draft.items.some((i) => i.description.includes('بطاريات'))).toBe(false);
    expect(draft.counts.battery).toBe(0);
    expect(draft.panelBreakdown.chargePanels).toBe(0);
    expect(draft.panelBreakdown.feedPanels).toBeGreaterThan(0);
    expect(draft.items.some((i) => i.description.includes('انفيرتر'))).toBe(true);
    expect(draft.capability.nightHours).toBe(null);
  });

  it('أمبير نهاري صفر: انفيرتر وبطارية فقط — بلا ألواح وبلا شرط مساحة وبلا بورد DC تلقائي', () => {
    const secondary = [
      { id: 40, category: 'secondary', model: 'هيكل', unit: 'عدد', price: 65000, qty_per_panel: 1 },
      { id: 41, category: 'secondary', model: 'بورد حماية DC', unit: 'عدد', price: 150000, qty_per_panel: 0 },
    ];
    const options = buildOptions({
      materials: [...MATERIALS.filter((m) => m.category !== 'secondary'), ...secondary],
      laborTiers: LABOR,
      settingsRow: SETTINGS_ROW,
      roofAreaM2: 0,
      ampDay: 0,
      ampNight: 20,
      nightSupplyHours: 4,
    });
    const draft = buildQuoteDraft(options, { tier: 'economy', cableMeters: {} });
    expect(draft.errors).toEqual({});
    expect(draft.items.some((i) => i.description.includes('ألواح'))).toBe(false);
    expect(draft.panelBreakdown).toBe(null);
    expect(draft.counts.panel).toBe(0);
    // البطارية والانفيرتر موجودان وأجور عمل حجم 20 أمبير
    expect(draft.items.some((i) => i.description.includes('بطاريات'))).toBe(true);
    expect(draft.items.some((i) => i.description.includes('انفيرتر'))).toBe(true);
    expect(draft.items.find((i) => i.description.includes('أجور')).unit_price).toBe(700000);
    // الهيكل (لكل لوح) صفر تلقائياً، وبورد DC مستثنى لأن ما اكو ألواح
    expect(draft.items.some((i) => i.material_id === 40)).toBe(false);
    expect(draft.items.some((i) => i.material_id === 41)).toBe(false);
    expect(draft.capability.nightHours).toBeGreaterThan(0);
  });

  it('بورد DC بكمية يدوية يبقى محترماً حتى بلا ألواح', () => {
    const secondary = [{ id: 41, category: 'secondary', model: 'بورد حماية DC', unit: 'عدد', price: 150000, qty_per_panel: 0 }];
    const options = buildOptions({
      materials: [...MATERIALS.filter((m) => m.category !== 'secondary'), ...secondary],
      laborTiers: LABOR,
      settingsRow: SETTINGS_ROW,
      roofAreaM2: 0,
      ampDay: 0,
      ampNight: 15,
      nightSupplyHours: 4,
    });
    const draft = buildQuoteDraft(options, { tier: 'economy', secondarySelections: { 41: { qty: 2 } } });
    const board = draft.items.find((i) => i.material_id === 41);
    expect(board).toBeTruthy();
    expect(board.quantity).toBe(2);
  });
});

describe('كابينة HoyUltra 215kWh: سقف التكبير بالممتاز (3× الحاجة)', () => {
  const CABINET = {
    id: 60, category: 'battery', brand: 'hoymiles', model: 'hoymiles HoyUltra 215kWh Cabinet',
    full_description: 'كابينة خزن طاقة متكاملة 100kW/215kWh — IP65', unit: 'عدد', watt_or_capacity: 215, price: 70000000, qty_per_panel: null,
  };
  const LB16D = {
    id: 61, category: 'battery', brand: 'hoymiles', model: 'LB16D-G3 16kWh',
    full_description: 'بطارية هويمايلز ليثيوم 16kWh IP65', unit: 'عدد', watt_or_capacity: 16, price: 2898000, qty_per_panel: null,
  };
  const bigLabor = [...LABOR, { id: 9, system_amps: 150, price: 3000000 }];
  const materialsWith = (extra) => [...MATERIALS.filter((m) => m.category !== 'battery'), LB16D, ...extra];

  it('منظومة صغيرة (18A×4h): الممتاز يبقى 1×16kWh — الكابينة ما تنخطف', () => {
    const options = buildOptions({
      materials: materialsWith([CABINET]), laborTiers: bigLabor, settingsRow: SETTINGS_ROW,
      roofAreaM2: 100, ampDay: 18, ampNight: 18, nightSupplyHours: 4,
    });
    const premium = options.batteryTiers.premium;
    expect(premium.material.id).toBe(61);
    expect(premium.units).toBe(1);
  });

  it('حمل ليلي كبير (150A×8h): الممتاز يختار الكابينة بأقل عدد وحدات', () => {
    const options = buildOptions({
      materials: materialsWith([CABINET]), laborTiers: bigLabor, settingsRow: SETTINGS_ROW,
      roofAreaM2: 500, ampDay: 150, ampNight: 150, nightSupplyHours: 8,
    });
    // الحاجة: 150×220×8/1000 = 264kWh ×0.8 ÷0.9 ≈ 234.7 → كابينتان (430) ضمن 3× الحاجة، مقابل 15 بطارية 16kWh
    const premium = options.batteryTiers.premium;
    expect(premium.material.id).toBe(60);
    expect(premium.units).toBe(2);
  });

  it('إذا كل الخيارات فوق السقف: الأقرب للحاجة بدل الأكبر', () => {
    const options = buildOptions({
      materials: materialsWith([CABINET]).filter((m) => m.category !== 'battery' || m.id === 60),
      laborTiers: bigLabor, settingsRow: SETTINGS_ROW,
      roofAreaM2: 100, ampDay: 10, ampNight: 10, nightSupplyHours: 2,
    });
    // البطارية الوحيدة هي الكابينة — تُختار رغم تجاوز السقف (ما اكو بديل)
    expect(options.batteryTiers.premium.material.id).toBe(60);
  });
});

describe('الاقتصادي انفيرترات: أدنى فئة IP (تبدأ من IP21) ثم الأرخص', () => {
  const { selectInverterTiers } = calcModule;
  const S = { systemVoltage: 220, inverterSafetyFactor: 1.25 };

  it('IP66 أرخص قليلاً من محلي بلا IP → الاقتصادي ياخذ البلا IP', () => {
    const inverters = [
      { id: 1, category: 'inverter', model: 'hoymiles HYS-12kW', full_description: 'انفيرتر هويمايلز IP66', watt_or_capacity: 12000, price: 2553000 },
      { id: 2, category: 'inverter', model: 'Hybrid 12kW LV', full_description: 'انفيرتر هجين 12 كيلو واط', watt_or_capacity: 12000, price: 2600000 },
    ];
    const tiers = selectInverterTiers(inverters, 40, 40, S, 0, 40);
    expect(tiers.economy.material.id).toBe(2);
  });

  it('IP21 صريح موجود وIP65 أرخص → الاقتصادي ياخذ IP21', () => {
    const inverters = [
      { id: 1, category: 'inverter', model: 'A 6kW', full_description: 'انفيرتر IP65', watt_or_capacity: 6000, price: 600000 },
      { id: 2, category: 'inverter', model: 'B 6kW', full_description: 'انفيرتر IP21', watt_or_capacity: 6000, price: 650000 },
    ];
    const tiers = selectInverterTiers(inverters, 15, 15, S, 0, 15);
    expect(tiers.economy.material.id).toBe(2);
  });

  it('الحجم ما بيه إلا IP65 وIP66 → الأرخص بينهما (الفئتان وحدة بالسقف 65)', () => {
    const inverters = [
      { id: 1, category: 'inverter', model: 'A 6kW', full_description: 'انفيرتر IP65', watt_or_capacity: 6000, price: 1600000 },
      { id: 2, category: 'inverter', model: 'B 6kW', full_description: 'انفيرتر IP66', watt_or_capacity: 6000, price: 1265000 },
    ];
    const tiers = selectInverterTiers(inverters, 15, 15, S, 0, 15);
    expect(tiers.economy.material.id).toBe(2);
  });
});

describe('سقف الكابينة 215kWh على كل المستويات (لا الاقتصادي ولا المتوسط ينخطفان)', () => {
  const CAB = { id: 70, category: 'battery', brand: 'hoymiles', model: 'hoymiles HoyUltra 215kWh Cabinet', full_description: 'كابينة 215kWh', unit: 'عدد', watt_or_capacity: 215, price: 70000000, qty_per_panel: null };
  const B16 = { id: 71, category: 'battery', brand: 'COSPOWER', model: 'COSPOWER 16kWh', full_description: 'بطارية 16kWh', unit: 'عدد', watt_or_capacity: 16, price: 2750000, qty_per_panel: null };
  const bigLabor = [...LABOR, { id: 9, system_amps: 150, price: 3000000 }];
  const opts = (ampNight, hours) => buildOptions({
    materials: [...MATERIALS.filter((m) => m.category !== 'battery'), B16, CAB],
    laborTiers: bigLabor, settingsRow: SETTINGS_ROW,
    roofAreaM2: 200, ampDay: ampNight, ampNight, nightSupplyHours: hours,
  });

  it('30A×4h: الكابينة وحدة واحدة (أقل عدد) لكن الاقتصادي والمتوسط ياخذان 16kWh', () => {
    const t = opts(30, 4).batteryTiers;
    expect(t.economy.material.id).toBe(71);
    expect(t.standard.material.id).toBe(71);
    expect(t.premium.material.id).toBe(71);
    // وتبقى الكابينة متاحة بقائمة التبديل اليدوي
    expect(t.allByTier.economy.some((c) => c.material.id === 70)).toBe(true);
  });

  it('150A×8h (مشروع كبير): الكابينة تُختار طبيعياً', () => {
    const t = opts(150, 8).batteryTiers;
    expect(t.premium.material.id).toBe(70);
  });
});

describe('مساعد المناقصات: تحويل وسيطات fill_quote للمواد المحددة والثانوية', () => {
  it('panelId/inverterId ← overrides وsecondary ← secondarySelections مع الكميات', async () => {
    const { mapFillQuoteArgs } = await import('../src/lib/agent.js');
    const out = mapFillQuoteArgs({
      ampDay: 84, ampNight: 0, roofAreaM2: 120, tier: 'economy',
      panelId: 5, inverterId: 12,
      secondary: [{ id: 30, qty: 0 }, { id: 31 }, { id: 44, qty: 200 }, { id: 0, qty: 5 }],
    });
    expect(out.overrides).toEqual({ panel: 5, inverter: 12 });
    expect(out.secondarySelections).toEqual({ 30: { qty: '' }, 31: { qty: '' }, 44: { qty: 200 } });
    expect(out.ampDay).toBe(84);
    expect('panelId' in out).toBe(false);
    expect('secondary' in out).toBe(false);
  });

  it('بدون مواد محددة: لا overrides ولا secondarySelections', async () => {
    const { mapFillQuoteArgs } = await import('../src/lib/agent.js');
    const out = mapFillQuoteArgs({ ampDay: 20, ampNight: 10, nightSupplyHours: 4 });
    expect('overrides' in out).toBe(false);
    expect('secondarySelections' in out).toBe(false);
  });
});

describe('هيكل الألواح: قاعدة التقسيم (2×8 حد أقصى + رفع أقدام)', () => {
  it('splitStructures: الأمثلة المعتمدة', async () => {
    const { splitStructures } = await import('../src/lib/structureDiagram.js');
    const cols = (n) => splitStructures(n).map((s) => s.cols);
    expect(cols(10)).toEqual([5]); // ستركجر واحد 2×5
    expect(cols(12)).toEqual([6]);
    expect(cols(16)).toEqual([8]); // حد الستركجر الواحد
    expect(cols(18)).toEqual([5, 4]); // زاد ← ستركجر ثاني
    expect(cols(24)).toEqual([6, 6]);
    expect(cols(32)).toEqual([8, 8]);
    expect(cols(50)).toEqual([7, 6, 6, 6]);
  });

  it('splitStructures: مجموع الخلايا = العدد وكل ستركجر ≤ 8 أعمدة', async () => {
    const { splitStructures } = await import('../src/lib/structureDiagram.js');
    for (const n of [8, 10, 14, 20, 26, 32, 40, 50, 64]) {
      const st = splitStructures(n);
      expect(st.reduce((s, x) => s + x.rows * x.cols, 0)).toBe(n);
      expect(st.every((x) => x.cols <= 8)).toBe(true);
      expect(st.length).toBe(Math.max(1, Math.ceil(n / 16)));
    }
  });

  it('splitStructures: صفر ← بلا ستركجرات', async () => {
    const { splitStructures } = await import('../src/lib/structureDiagram.js');
    expect(splitStructures(0)).toEqual([]);
  });

  it('panelCountFromItems: يجمع بند الألواح ويستثني الهيكل والصبات', async () => {
    const { panelCountFromItems } = await import('../src/lib/structureDiagram.js');
    const items = [
      { description: 'تجهيز وتركيب ألواح طاقة شمسية 650 واط', quantity: 24 },
      { description: 'هيكل الألواح مغلون', quantity: 24 },
      { description: 'صبات لتثبيت الهياكل', quantity: 24 },
      { description: 'كيبلات ناقلة من الألواح إلى الانفيرتر', quantity: 200 },
    ];
    expect(panelCountFromItems(items)).toBe(24);
  });

  it('panelCountFromItems: لا يعدّ ذكر «ألواح» بالانفيرتر ولا «للوحدة» بالبطارية', async () => {
    const { panelCountFromItems } = await import('../src/lib/structureDiagram.js');
    const items = [
      { description: 'تجهيز وتركيب ألواح شمسية 650 واط (LONGI Hi-MO X10) Bifacial Module', quantity: 10 },
      { description: 'انفيرتر هايبرد Hoymiles Inverter يستقبل ألواح حتى 6000 واط 2MPPT', quantity: 1 },
      { description: 'بطاريات ليثيوم Hoymiles LB16D قدرة 16kWh للوحدة الواحدة', quantity: 2 },
      { description: 'هيكل الألواح مغلون لكل لوح', quantity: 10 },
      { description: 'بوردات الحماية للألواح والانفيرتر DC', quantity: 1 },
    ];
    expect(panelCountFromItems(items)).toBe(10);
  });

  it('buildStructurePageHtml: بلا صورة أو بلا ألواح ← صفحة فارغة', async () => {
    const { buildStructurePageHtml } = await import('../src/lib/structureDiagram.js');
    expect(buildStructurePageHtml(0, {}, 'data:image/png;base64,x')).toBe('');
    expect(buildStructurePageHtml(24, {}, '')).toBe('');
    expect(buildStructurePageHtml(24, {}, 'data:image/png;base64,x').includes('<img')).toBe(true);
  });
});
