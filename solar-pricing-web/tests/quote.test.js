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

// مجموع المثال المرجعي بعد معامل أمان الألواح 1.25: الفاتورة القديمة كانت
// 9,686,000 بعشرة ألواح، وصار 12 لوحاً — الفرق لوحان بكلفتهما الكاملة
// (لوح + هيكل + صبات).
const REF_TOTAL = 9686000 + 2 * (185000 + 65000 + 5000);

function optionsFor(input) {
  return buildOptions({ materials: MATERIALS, laborTiers: LABOR, settingsRow: SETTINGS_ROW, ...input });
}

// ⚠ المثال المرجعي انتغيّر بمعامل أمان الألواح 1.25 (قرار المستخدم):
// ألواح التغذية كانت ceil(15 ÷ 2.18) = 7، وصارت ceil(15×1.25 ÷ 2.18) = 9،
// فالمجموع 12 لوحاً بدل 10 — والفاتورة الأصلية كانت 10. المساحة المطلوبة
// ارتفعت من 27 م² إلى 32.4 م²، فالمساحة بالاختبار انزادت حتى ما يحجب الخطأ.
describe('المثال المرجعي (15 أمبير، 8 ساعات) بعد معامل أمان الألواح 1.25', () => {
  it('12 لوحاً (9 تغذية + 3 شحن)، 2 بطارية، انفيرتر واحد', () => {
    const options = optionsFor({ roofAreaM2: 35, ampDay: 15, ampNight: 15, nightSupplyHours: 8 });
    const draft = buildQuoteDraft(options, { tier: 'economy', cableMeters: { 6: 143 } });
    expect(draft.errors).toEqual({});
    expect(draft.panelBreakdown).toEqual({ feedPanels: 9, chargePanels: 3, extraPanels: 0 });
    expect(draft.items.find((i) => i.description.includes('ألواح شمسية')).quantity).toBe(12);
    expect(draft.items.find((i) => i.description.includes('بطاريات ليثيوم')).quantity).toBe(2);
    expect(draft.items.find((i) => i.description.includes('انفيرتر')).quantity).toBe(1);
    // الفرق عن الفاتورة القديمة (9,686,000) = لوحان × (لوح 185,000 + هيكل 65,000 + صبات 5,000)
    expect(draft.total).toBe(9686000 + 2 * (185000 + 65000 + 5000));
  });

  it('بلا معامل الأمان كان يطلع 7 ألواح تغذية — المعامل هو اللي رفعها', () => {
    const noFactor = buildOptions({
      materials: MATERIALS, laborTiers: LABOR,
      settingsRow: { ...SETTINGS_ROW, panel_safety_factor: 1 },
      roofAreaM2: 35, ampDay: 15, ampNight: 15, nightSupplyHours: 8,
    });
    const draft = buildQuoteDraft(noFactor, { tier: 'economy', cableMeters: { 6: 143 } });
    expect(draft.panelBreakdown.feedPanels).toBe(7);
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
  it('سطح 20م² مع 12 لوحاً مطلوباً → خطأ مساحة', () => {
    const options = optionsFor({ roofAreaM2: 20, ampDay: 15, ampNight: 15, nightSupplyHours: 8 });
    const draft = buildQuoteDraft(options, { tier: 'economy', cableMeters: {} });
    expect(draft.errors.roofArea).toContain('32');
  });
});

describe('نسبة الزيادة والخصم على العرض', () => {
  const base = () => optionsFor({ roofAreaM2: 28, ampDay: 15, ampNight: 15, nightSupplyHours: 8 });

  it('بدون adjustments: لا سطر زيادة/خصم والمجموع كما هو', () => {
    const draft = buildQuoteDraft(base(), { tier: 'economy', cableMeters: { 6: 143 } });
    expect(draft.total).toBe(REF_TOTAL);
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
    const markup = Math.round(REF_TOTAL * 0.1);
    expect(row.subtotal).toBe(markup);
    expect(draft.total).toBe(REF_TOTAL + markup);
    expect(draft.adjustments.subtotal).toBe(REF_TOTAL);
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
    const disc = Math.round(REF_TOTAL * 0.05);
    expect(row.subtotal).toBe(-disc);
    expect(draft.total).toBe(REF_TOTAL - disc);
  });

  it('زيادة علنية + خصم معاً: الخصم ينحسب على المجموع بعد الزيادة', () => {
    const draft = buildQuoteDraft(base(), {
      tier: 'economy',
      cableMeters: { 6: 143 },
      adjustments: { markupPercent: 10, markupMode: 'visible', discountPercent: 5 },
    });
    const markup = Math.round(REF_TOTAL * 0.1);
    const afterMarkup = REF_TOTAL + markup;
    const discount = Math.round(afterMarkup * 0.05);
    expect(draft.total).toBe(afterMarkup - discount);
    expect(draft.adjustments.markupAmount).toBe(markup);
    expect(draft.adjustments.discountAmount).toBe(discount);
  });
});

describe('التقسيط المصرفي: النسبة على المجموع بس والبنود ما تتغيّر', () => {
  const base = () => optionsFor({ roofAreaM2: 28, ampDay: 15, ampNight: 15, nightSupplyHours: 8 });

  it('نسبة 1.3 و60 شهر: البنود بسعرها والمجموع كاش، والتقسيط سطر فوقه', () => {
    const plain = buildQuoteDraft(base(), { tier: 'economy', cableMeters: { 6: 143 } });
    const draft = buildQuoteDraft(base(), {
      tier: 'economy',
      cableMeters: { 6: 143 },
      adjustments: { installment: { enabled: true, rate: 1.3, months: 60 } },
    });
    // ولا سعر بند يتغيّر عن العرض الكاش
    expect(draft.items.map((i) => i.unit_price)).toEqual(plain.items.map((i) => i.unit_price));
    expect(draft.total).toBe(draft.items.reduce((s, i) => s + i.subtotal, 0));
    expect(draft.total).toBe(REF_TOTAL);
    expect(draft.installment.cashTotal).toBe(REF_TOTAL);
    expect(draft.installment.totalWithInterest).toBe(Math.round(REF_TOTAL * 1.3));
    expect(draft.installment.monthly).toBe(Math.round(Math.round(REF_TOTAL * 1.3) / 60));
    // ما ينضاف أي سطر للجدول — التقسيط سطر بالفاتورة مو بنداً بالعرض
    expect(draft.items.some((i) => /تقسيط|فائدة/.test(i.description))).toBe(false);
  });

  it('التقسيط ينحسب على المجموع بعد الزيادة والخصم', () => {
    const draft = buildQuoteDraft(base(), {
      tier: 'economy',
      cableMeters: { 6: 143 },
      adjustments: { markupPercent: 10, markupMode: 'visible', installment: { enabled: true, rate: 1.35, months: 60 } },
    });
    const cash = REF_TOTAL + Math.round(REF_TOTAL * 0.1);
    expect(draft.installment.cashTotal).toBe(cash);
    expect(draft.total).toBe(cash);
    expect(draft.installment.totalWithInterest).toBe(Math.round(cash * 1.35));
    expect(draft.installment.monthly).toBe(Math.round(Math.round(cash * 1.35) / 60));
  });

  it('بدون تأشير: لا يوجد تقسيط بالمسودة', () => {
    const draft = buildQuoteDraft(base(), { tier: 'economy', cableMeters: { 6: 143 } });
    expect(draft.installment).toBe(null);
  });
});

describe('الزيادة/النقصان اليدوي بالوحدات (لوح/بطارية/انفيرتر ±1)', () => {
  const base = () => optionsFor({ roofAreaM2: 40, ampDay: 15, ampNight: 15, nightSupplyHours: 8 });

  it('لوح +2: العدد والسعر يزيدان لوحين والعدد يبقى زوجي', () => {
    const plain = buildQuoteDraft(base(), { tier: 'economy', cableMeters: {} });
    const draft = buildQuoteDraft(base(), { tier: 'economy', cableMeters: {}, extraUnits: { panel: 2 } });
    expect(draft.counts.panel).toBe(plain.counts.panel + 2);
    expect(draft.counts.panel % 2).toBe(0);
    expect(draft.panelBreakdown.extraPanels).toBe(2);
    const panelItem = draft.items.find((i) => i.description.includes('ألواح'));
    expect(panelItem.quantity).toBe(plain.counts.panel + 2);
    // لوحان + هيكلان + صبتان. وزيادة الألواح تكبّر المصفوفة، وقاعدة تحميل الانفيرتر
    // (المصفوفة ÷1.3) ممكن تفرض انفيرتراً إضافياً — فنحسب فرقه صراحةً بدل ما نتجاهله.
    const panelCost = 2 * (185000 + 65000 + 5000);
    const invCost = (draft.counts.inverter - plain.counts.inverter) * 650000;
    expect(draft.total).toBe(plain.total + panelCost + invCost);
  });

  it('بطارية +1 وانفيرتر +1: الأعداد والقدرة الفعلية تتحدث', () => {
    const plain = buildQuoteDraft(base(), { tier: 'economy', cableMeters: {} });
    const draft = buildQuoteDraft(base(), { tier: 'economy', cableMeters: {}, extraUnits: { battery: 1, inverter: 1 } });
    expect(draft.counts.battery).toBe(plain.counts.battery + 1);
    // البطارية الإضافية تجيب ألواح شحن إضافية، والمصفوفة الأكبر ممكن تفرض انفيرتراً
    // ثانياً فوق الـ+1 اليدوي — فالمطلوب «واحد على الأقل» مو «واحد بالضبط»
    expect(draft.counts.inverter).toBeGreaterThanOrEqual(plain.counts.inverter + 1);
    // ساعات الليل ترتفع بنفس نسبة زيادة البنك، وأمبير النهار بنسبة الانفيرترات
    expect(draft.capability.nightHours).toBeGreaterThan(plain.capability.nightHours);
    expect(draft.capability.dayAmps).toBeGreaterThan(plain.capability.dayAmps);
    // ساعات الليل = بنك×DOD×1000 ÷ (أمبير×فولت)
    const expectedHours = Math.round(((draft.counts.battery * 16 * 0.9 * 1000) / (15 * 220)) * 10) / 10;
    expect(draft.capability.nightHours).toBe(expectedHours);
  });

  // السلوك المطلوب من المستخدم: النقصان يوصل صفر والفئة تنشال من العرض كلياً
  it('النقصان لصفر يشيل الفئة من بنود العرض', () => {
    const plain = buildQuoteDraft(base(), { tier: 'economy', cableMeters: {} });
    const invPrice = plain.items.find((i) => i.description.includes('انفيرتر')).subtotal;
    const draft = buildQuoteDraft(base(), { tier: 'economy', cableMeters: {}, extraUnits: { inverter: -99 } });
    expect(draft.counts.inverter).toBe(0);
    expect(draft.items.some((i) => i.description.includes('انفيرتر'))).toBe(false);
    expect(draft.total).toBe(plain.total - invPrice);
  });

  it('تصفير البطارية والألواح ما يكسر العرض', () => {
    const draft = buildQuoteDraft(base(), { tier: 'economy', cableMeters: {}, extraUnits: { battery: -99, panel: -99 } });
    expect(draft.counts.battery).toBe(0);
    expect(draft.counts.panel).toBe(0);
    expect(draft.items.some((i) => i.description.includes('بطاريات'))).toBe(false);
    expect(draft.items.some((i) => i.description.includes('ألواح'))).toBe(false);
    expect(draft.errors.roofArea).toBeUndefined(); // بلا ألواح ماكو فحص مساحة
    expect(draft.total).toBeGreaterThan(0);        // أجور العمل وباقي البنود تبقى
  });

  it('لوح +1 و−1: العدد يتغير لوحاً واحداً بالضبط (الفردي مسموح)', () => {
    const plain = buildQuoteDraft(base(), { tier: 'economy', cableMeters: {} });
    const plus = buildQuoteDraft(base(), { tier: 'economy', cableMeters: {}, extraUnits: { panel: 1 } });
    const minus = buildQuoteDraft(base(), { tier: 'economy', cableMeters: {}, extraUnits: { panel: -1 } });
    expect(plus.counts.panel).toBe(plain.counts.panel + 1);
    expect(minus.counts.panel).toBe(plain.counts.panel - 1);
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

  // القاعدة تُفحص مباشرة على selectInverterTiers بمصفوفة ألواح صفر — عبر
  // buildQuoteDraft كان حجم المصفوفة (اللي كبر بمعامل أمان الألواح) يرفع القدرة
  // المطلوبة فيصير 6kW وحدتين و12kW وحدة، فيفوز الـ12kW بأقل عدد وحدات
  // ويخفي القاعدة اللي نريد نفحصها.
  it('المتوسط يختار أعلى IP ثم الأرخص: Growatt IP65 (650) قبل Felicity IP21 (600) وقبل Gospower IP65 (700)', () => {
    const inverters = MATERIALS2.filter((m) => m.category === 'inverter');
    const tiers = calcModule.selectInverterTiers(
      inverters, 18, 18, { systemVoltage: 220, inverterSafetyFactor: 1.25 }, 0, 18,
    );
    expect(tiers.standard.material.model).toBe('Growatt 6kW');
    // والاقتصادي يبقى الأرخص (Felicity IP21)
    expect(tiers.economy.material.model).toBe('Felicity 6kW');
  });

  it('الممتاز ≤120 أمبير: هويمايلز بتكبير الحجم لا التعديد — هامش ≥30% وبلا بطارية احتياط', () => {
    const options = opts2(borderline);
    const draft = buildQuoteDraft(options, { tier: 'premium', cableMeters: {} });
    // المطلوب ~6000W ← ×1.3 = 7800 ← هويمايلز 12kW وحدة وحدة (مو 6kW ×2)
    expect(draft.inverterTiers.premium.material.model).toBe('HYS-12.0LV-EUG2');
    expect(draft.inverterTiers.premium.units).toBe(1);
    expect(draft.inverterTiers.premium.units * draft.inverterTiers.premium.material.watt_or_capacity)
      .toBeGreaterThanOrEqual(6000 * 1.3);
    // البطارية: الأكبر سعة (هويمايلز 16kWh). العدد وحدتان بمعامل الممتاز 1.25 —
    // الحاجة 15.84kWh ×1.25 ÷0.9 = 22kWh، و16kWh وحدة ما تكفيها.
    expect(options.batteryTiers.premium.material.model).toBe('LB16D-G3');
    expect(options.batteryTiers.premium.units).toBe(2);
    expect(options.batteryTiers.premium.extraUnit).toBeUndefined();
    // والممتاز أكبر فعلاً من الاقتصادي — هذا كل المقصود من المستوى
    expect(options.batteryTiers.premium.units * options.batteryTiers.premium.material.watt_or_capacity)
      .toBeGreaterThan(options.batteryTiers.economy.units * options.batteryTiers.economy.material.watt_or_capacity);
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
    expect(options.batteryTiers.premium.units).toBe(2);
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

  it('منظومة صغيرة (18A×4h): الممتاز يبقى بطاريات 16kWh — الكابينة ما تنخطف', () => {
    const options = buildOptions({
      materials: materialsWith([CABINET]), laborTiers: bigLabor, settingsRow: SETTINGS_ROW,
      roofAreaM2: 100, ampDay: 18, ampNight: 18, nightSupplyHours: 4,
    });
    const premium = options.batteryTiers.premium;
    expect(premium.material.id).toBe(61);
    // وحدتان بمعامل الممتاز 1.25 (الحاجة 22kWh) — والمهم إن الكابينة 215kWh
    // ما انخطفت: سقف التكبير 3× الحاجة = 66kWh يمنعها
    expect(premium.units).toBe(2);
    expect(premium.units * premium.material.watt_or_capacity).toBeLessThan(215);
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

// قرار الشركة: الاقتصادي ما عاد مجبوراً بأقل عدد وحدات — إذا قطعتين أصغر أرخص
// من قطعة كبيرة ياخذ القطعتين، بسقف وحدة زيادة على أقل عدد ممكن.
// طلب المستخدم: معامل أمان 1.25 على ألواح التغذية — اللوح ما ينتج قدرته
// الاسمية طول النهار ولازم يفضل فائض يشحن البطاريات.
describe('معامل أمان الألواح 1.25', () => {
  const { selectPanelTiers } = calcModule;
  const S = { chargePanelsPerBattery: 1.5 };

  it('10 أمبير بلوح 650 واط وبطارية وحدة ← 6 تغذية + 2 شحن = 8 ألواح', () => {
    const panels = [{ id: 1, category: 'panel', model: 'J650', watt_or_capacity: 650, price: 185000 }];
    const t = selectPanelTiers(panels, 10, 1, S, 'economy');
    // بلا معامل: ceil(10 ÷ 2.18) = 5 تغذية. بالمعامل: ceil(12.5 ÷ 2.18) = 6
    expect(t.economy.feedPanels).toBe(6);
    expect(t.economy.chargePanels).toBe(2);
    expect(t.economy.units).toBe(8);
  });

  it('المعامل ينطبق على التغذية بس — ألواح الشحن تبقى على عدد البطاريات', () => {
    const panels = [{ id: 1, category: 'panel', model: 'J650', watt_or_capacity: 650, price: 185000 }];
    const a = selectPanelTiers(panels, 10, 1, S, 'economy');
    const b = selectPanelTiers(panels, 10, 4, S, 'economy');
    expect(a.economy.feedPanels).toBe(b.economy.feedPanels);
    expect(b.economy.chargePanels).toBe(6);
  });

  it('ينلغى بمعامل 1 من الإعدادات — القاعدة القديمة ترجع بالضبط', () => {
    const panels = [{ id: 1, category: 'panel', model: 'J650', watt_or_capacity: 650, price: 185000 }];
    const t = selectPanelTiers(panels, 10, 1, { ...S, panelSafetyFactor: 1 }, 'economy');
    expect(t.economy.feedPanels).toBe(5);
  });

  it('بلا أمبير نهاري ماكو ألواح إطلاقاً — المعامل ما يخترع لوحاً', () => {
    const panels = [{ id: 1, category: 'panel', model: 'J650', watt_or_capacity: 650, price: 185000 }];
    expect(selectPanelTiers(panels, 0, 2, S, 'economy').none).toBe(true);
  });
});

// طلب المستخدم: الممتاز كان يطلع نفس الاقتصادي لما تنحصر المواد بماركة وحدة.
// لازم يطلع انفيرتر أكبر وبطاريات أكبر وألواح شحن أكثر.
describe('الممتاز أكبر فعلاً — مو الأرخص', () => {
  const { selectInverterTiers, selectBatteryTiers, selectPanelTiers } = calcModule;
  const S = { systemVoltage: 220, inverterSafetyFactor: 1.25, dod: 0.9, chargePanelsPerBattery: 1.5 };

  it('انفيرتر: بنفس الماركة ياخذ الأكبر قدرة مو الأرخص اللي يمرّ', () => {
    const inv = [
      { id: 1, category: 'inverter', brand: 'Deye', model: 'D 6kW', full_description: 'IP65', watt_or_capacity: 6000, price: 900000 },
      { id: 2, category: 'inverter', brand: 'Deye', model: 'D 8kW', full_description: 'IP65', watt_or_capacity: 8000, price: 1100000 },
    ];
    // 20 أمبير ← 5500W مطلوب ← ×1.3 = 7150: الاثنان يوصلون بوحدة وحدة (6kW لا،
    // 6000 < 7150 فيحتاج وحدتين) — فالممتاز ياخذ 8kW وحدة وحدة
    const t = selectInverterTiers(inv, 20, 20, S, 0, 20);
    expect(t.premium.material.model).toBe('D 8kW');
    expect(t.premium.units).toBe(1);
    // والاقتصادي ياخذ الأرخص
    expect(t.economy.material.model).toBe('D 6kW');
  });

  it('انفيرتر: الممتاز ما يقفز لجهاز ضخم — سقف ضعف الطلب', () => {
    const inv = [
      { id: 1, category: 'inverter', brand: 'Deye', model: 'D 8kW',  full_description: 'IP65', watt_or_capacity: 8000,  price: 1100000 },
      { id: 2, category: 'inverter', brand: 'Deye', model: 'D 50kW', full_description: 'IP65', watt_or_capacity: 50000, price: 6300000 },
    ];
    const t = selectInverterTiers(inv, 20, 20, S, 0, 20);
    expect(t.premium.material.model, '50kW = 9× الطلب — فوق السقف').toBe('D 8kW');
  });

  it('بطاريات: الممتاز أكبر من الاقتصادي بنفس الماركة', () => {
    const bat = [
      { id: 1, category: 'battery', brand: 'Deye', model: 'D 16', watt_or_capacity: 16, price: 3000000 },
      { id: 2, category: 'battery', brand: 'Deye', model: 'D 8',  watt_or_capacity: 8,  price: 1200000 },
    ];
    const t = selectBatteryTiers(bat, 10, 8, S, { factors: { economy: 0.9, standard: 0.85, premium: 1.25 } });
    const bank = (c) => c.units * c.material.watt_or_capacity;
    expect(bank(t.premium)).toBeGreaterThan(bank(t.economy));
  });

  it('ألواح: الممتاز يزيد ألواح الشحن ربعاً', () => {
    const panels = [{ id: 1, category: 'panel', model: 'J650', watt_or_capacity: 650, price: 185000 }];
    const eco = selectPanelTiers(panels, 15, 4, S, 'economy');
    const pre = selectPanelTiers(panels, 15, 4, S, 'premium');
    expect(eco.economy.chargePanels).toBe(6);      // ceil(4 × 1.5)
    expect(pre.premium.chargePanels).toBe(8);      // ceil(4 × 1.5 × 1.25)
    // وألواح التغذية ما تتأثر بالمستوى
    expect(pre.premium.feedPanels).toBe(eco.economy.feedPanels);
  });

  it('العرض الكامل: الممتاز أكبر من الاقتصادي بالثلاثة سوية', () => {
    const mats = [
      { id: 1, category: 'panel', brand: 'Deye', model: 'D 650', full_description: 'لوح', unit: 'عدد', watt_or_capacity: 650, price: 185000 },
      { id: 2, category: 'inverter', brand: 'Deye', model: 'D 6kW', full_description: 'انفيرتر IP65', unit: 'عدد', watt_or_capacity: 6000, price: 900000 },
      { id: 3, category: 'inverter', brand: 'Deye', model: 'D 12kW', full_description: 'انفيرتر IP65', unit: 'عدد', watt_or_capacity: 12000, price: 1700000 },
      { id: 4, category: 'battery', brand: 'Deye', model: 'D 8', full_description: 'بطارية', unit: 'عدد', watt_or_capacity: 8, price: 1500000 },
      { id: 5, category: 'battery', brand: 'Deye', model: 'D 16', full_description: 'بطارية', unit: 'عدد', watt_or_capacity: 16, price: 2900000 },
    ];
    const opts = buildOptions({
      materials: mats, laborTiers: LABOR, settingsRow: SETTINGS_ROW,
      roofAreaM2: 300, ampDay: 15, ampNight: 15, nightSupplyHours: 8,
    });
    const eco = buildQuoteDraft(opts, { tier: 'economy', cableMeters: {} });
    const pre = buildQuoteDraft(opts, { tier: 'premium', cableMeters: {} });
    expect(pre.counts.panel, 'ألواح الممتاز أكثر').toBeGreaterThan(eco.counts.panel);
    expect(pre.total, 'الممتاز أغلى — مو نفس الاقتصادي').toBeGreaterThan(eco.total);
    // سعة البنك وقدرة الانفيرتر بالكيلوواط — مو مجرد عدد وحدات
    const bankKwh = (o, tier) => o.batteryTiers[tier].units * o.batteryTiers[tier].material.watt_or_capacity;
    expect(bankKwh(opts, 'premium'), 'بنك الممتاز أكبر').toBeGreaterThan(bankKwh(opts, 'economy'));
    const invW = (d) => d.inverterTiers.premium.units * d.inverterTiers.premium.material.watt_or_capacity;
    const invEcoW = (d) => d.inverterTiers.economy.units * d.inverterTiers.economy.material.watt_or_capacity;
    expect(invW(pre), 'قدرة انفيرتر الممتاز أكبر').toBeGreaterThan(invEcoW(eco));
  });
});

describe('الاقتصادي: قطعتين أصغر إذا أرخص', () => {
  const { selectInverterTiers, selectBatteryTiers } = calcModule;
  const S = { systemVoltage: 220, inverterSafetyFactor: 1.25, dod: 0.9, nightCoverageHours: 8 };

  it('انفيرتر: 2×6kW أرخص من 1×12kW → الاقتصادي ياخذ الاثنين', () => {
    const inverters = [
      { id: 1, category: 'inverter', brand: 'Deye', model: 'D 12kW', full_description: 'انفيرتر IP21', watt_or_capacity: 12000, price: 2600000 },
      { id: 2, category: 'inverter', brand: 'Deye', model: 'D 6kW',  full_description: 'انفيرتر IP21', watt_or_capacity: 6000,  price: 1100000 },
    ];
    const tiers = selectInverterTiers(inverters, 40, 40, S, 0, 40);
    expect(tiers.economy.material.id).toBe(2);
    expect(tiers.economy.units).toBe(2);
    expect(tiers.economy.totalPrice).toBe(2200000);
    // والقدرة الكلية تغطي الطلب فعلاً — مو مجرد أرخص
    expect(tiers.economy.units * tiers.economy.material.watt_or_capacity)
      .toBeGreaterThanOrEqual(40 * 220 * 1.25);
  });

  it('انفيرتر: 2×6kW أغلى → يبقى الجهاز الكبير الواحد', () => {
    const inverters = [
      { id: 1, category: 'inverter', brand: 'Deye', model: 'D 12kW', full_description: 'انفيرتر IP21', watt_or_capacity: 12000, price: 2000000 },
      { id: 2, category: 'inverter', brand: 'Deye', model: 'D 6kW',  full_description: 'انفيرتر IP21', watt_or_capacity: 6000,  price: 1100000 },
    ];
    const tiers = selectInverterTiers(inverters, 40, 40, S, 0, 40);
    expect(tiers.economy.material.id).toBe(1);
    expect(tiers.economy.units).toBe(1);
  });

  it('الـIP يبقى قبل السعر: قطعتين IP65 أرخص ما تسحبن الاقتصادي من IP21', () => {
    const inverters = [
      { id: 1, category: 'inverter', brand: 'A', model: 'A 12kW', full_description: 'انفيرتر IP21', watt_or_capacity: 12000, price: 2600000 },
      { id: 2, category: 'inverter', brand: 'B', model: 'B 6kW',  full_description: 'انفيرتر IP65', watt_or_capacity: 6000,  price: 900000 },
    ];
    const tiers = selectInverterTiers(inverters, 40, 40, S, 0, 40);
    expect(tiers.economy.material.id, 'IP21 يفوز حتى لو أغلى').toBe(1);
  });

  it('السقف: ثلاث قطع أرخص ما تنتخب — وحدة زيادة بس على أقل عدد', () => {
    const inverters = [
      { id: 1, category: 'inverter', brand: 'A', model: 'A 12kW', full_description: 'انفيرتر IP21', watt_or_capacity: 12000, price: 2600000 },
      { id: 2, category: 'inverter', brand: 'A', model: 'A 4kW',  full_description: 'انفيرتر IP21', watt_or_capacity: 4000,  price: 400000 },
    ];
    // المطلوب 11000W ← 4kW يحتاج 3 قطع (1.2مليون، أرخص) بس أقل عدد ممكن 1 والسقف 2
    const tiers = selectInverterTiers(inverters, 40, 40, S, 0, 40);
    expect(tiers.economy.units).toBeLessThanOrEqual(2);
    expect(tiers.economy.material.id).toBe(1);
  });

  it('بطاريات: 2×5kWh أرخص من 1×16kWh → الاقتصادي ياخذ الاثنتين', () => {
    const batteries = [
      { id: 1, category: 'battery', brand: 'Deye', model: 'D 16', watt_or_capacity: 16, price: 3000000 },
      { id: 2, category: 'battery', brand: 'Deye', model: 'D 8',  watt_or_capacity: 8,  price: 1200000 },
    ];
    // 5 أمبير × 220 × 8 ساعات = 8.8kWh ← ×0.9 ÷0.9 dod = 8.8kWh ← 16 توليفة وحدة، 8 توليفتين
    const tiers = selectBatteryTiers(batteries, 5, 8, S, { factors: { economy: 0.9, standard: 0.85, premium: 0.8 } });
    expect(tiers.economy.material.id).toBe(2);
    expect(tiers.economy.units).toBe(2);
    expect(tiers.economy.totalPrice).toBe(2400000);
  });

  it('بطاريات: الكبيرة الواحدة أرخص → تبقى هي', () => {
    const batteries = [
      { id: 1, category: 'battery', brand: 'Deye', model: 'D 16', watt_or_capacity: 16, price: 2000000 },
      { id: 2, category: 'battery', brand: 'Deye', model: 'D 8',  watt_or_capacity: 8,  price: 1200000 },
    ];
    const tiers = selectBatteryTiers(batteries, 5, 8, S, { factors: { economy: 0.9, standard: 0.85, premium: 0.8 } });
    expect(tiers.economy.material.id).toBe(1);
    expect(tiers.economy.units).toBe(1);
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

describe('منظومة الأوف جرد (انفيرتر وبطاريات بلا ألواح ولا هيكل)', () => {
  // أمبير النهار صفر = المحرك يستنتج «بلا ألواح»؛ الأسلاك وبقية التفاصيل تبقى بالعرض
  const offgrid = () => optionsFor({ roofAreaM2: 0, ampDay: 0, ampNight: 15, nightSupplyHours: 8 });

  it('لا ألواح ولا هيكل ولا صبّات ولا بوردة حماية DC — والانفيرتر والبطارية موجودان', () => {
    const draft = buildQuoteDraft(offgrid(), { tier: 'economy', cableMeters: {} });
    const has = (re) => draft.items.some((i) => re.test(i.description));
    expect(has(/ألواح شمسية/)).toBe(false);
    expect(has(/هيكل/)).toBe(false);
    expect(has(/صبات/)).toBe(false);
    expect(has(/بوردات الحماية DC/)).toBe(false);
    expect(draft.items.find((i) => /انفيرتر/.test(i.description)).quantity).toBe(1);
    // 15 أمبير × 220 فولت × 8 ساعات = 26.4kWh ← بمعامل الاقتصادي 0.9 وDOD 0.9 ÷ 16 = بطاريتان
    expect(draft.items.find((i) => /بطاريات/.test(i.description)).quantity).toBe(2);
    expect(draft.panelBreakdown).toBe(null);
    expect(draft.counts.panel).toBe(0);
  });

  it('ماكو خطأ مساحة سطح ولا خطأ فئة الألواح بهذا الوضع', () => {
    const draft = buildQuoteDraft(offgrid(), { tier: 'economy', cableMeters: {} });
    expect(draft.errors.roofArea).toBeUndefined();
    expect(draft.errors.panel).toBeUndefined();
  });

  it('الأسلاك بالكمية اليدوية تنضاف عادي وأجور العمل تبقى', () => {
    const draft = buildQuoteDraft(offgrid(), {
      tier: 'economy',
      secondarySelections: { 4: { qty: '' }, 5: { qty: '' }, 6: { qty: 40 }, 7: { qty: '' } },
    });
    const cable = draft.items.find((i) => /كيبلات ناقلة/.test(i.description));
    expect(cable.quantity).toBe(40);
    expect(cable.subtotal).toBe(40 * 2000);
    // حتى لو أُشّرت مواد جهة الألواح بالغلط، كميتها صفر فما تدخل العرض
    expect(draft.items.some((i) => /هيكل|صبات|بوردات الحماية DC/.test(i.description))).toBe(false);
    expect(draft.items.some((i) => /أجور العمل/.test(i.description))).toBe(true);
  });
});
