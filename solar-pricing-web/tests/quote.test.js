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

  it('الممتاز ≤120 أمبير: انفيرتر وبطارية هويمايلز حتى لو أغلى + وحدة بطارية احتياط', () => {
    const options = opts2(borderline);
    const draft = buildQuoteDraft(options, { tier: 'premium', cableMeters: {} });
    expect(draft.inverterTiers.premium.material.model).toBe('HIS6L-G3S');
    expect(draft.inverterTiers.premium.units).toBeGreaterThanOrEqual(2); // توزيع الحمل
    expect(options.batteryTiers.premium.material.model).toBe('LB16D-G3');
    // معامل الممتاز 0.8: 17.6×0.8=14.08 ← وحدة + احتياط = 2
    expect(options.batteryTiers.premium.units).toBe(2);
    expect(options.batteryTiers.premium.extraUnit).toBe(true);
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
    expect(options.batteryTiers.premium.extraUnit).toBe(true);
  });
});
