import { describe, it, expect } from 'vitest';
import { buildOptions, buildQuoteDraft } from '../src/lib/quoteService.js';
import { integratedChargeKw as calcChargeKw } from '../src/lib/calc.js';
import { integratedFromItems, buildStructurePageHtml } from '../src/lib/structureDiagram.js';

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
// معادلة السستم المتكامل: أحادي الطور على فولتية النظام (قرار المستخدم)
const KW_PER_AMP = 220 / 1000;
const CHARGE_HOURS = 4;   // نافذة شحن الكابينة من الألواح
const SUN_EFF = 0.8;      // كفاءة المنظومة بالإعدادات

describe('السستم المتكامل: التحجيم التلقائي', () => {
  it('يضيف بند الكابينة ولا يضيف بطارية ولا انفيرتر منفصلين', () => {
    const ids = draftOf(opts(small)).items.map((i) => i.material_id);
    expect(ids).toContain(BIG.id);
    expect(ids).not.toContain(3);
    expect(ids).not.toContain(2);
  });

  it('الأمبيرية = حمل النشاط، تتحول أحادي الطور على فولتية النظام', () => {
    const d = draftOf(opts({ ...small, ampDay: 300, ampNight: 0, nightSupplyHours: 0 }));
    expect(d.integrated.required.dayLoadKw).toBeCloseTo(300 * KW_PER_AMP, 3);
  });

  it('العدد ينحسب من القدرة المطلوبة (kW)', () => {
    const d = draftOf(opts({ ...small, ampDay: 600, ampNight: 0, nightSupplyHours: 0 }));
    const reqKw = 600 * KW_PER_AMP * 1.25;
    expect(d.integrated.required.kw).toBeCloseTo(reqKw, 3);
    expect(cabinetLine(d).quantity).toBe(Math.ceil(reqKw / 125));
  });

  it('العدد ينحسب من السعة المطلوبة (kWh) إذا هي الأكبر', () => {
    const d = draftOf(opts({ ...small, ampDay: 0, ampNight: 600, nightSupplyHours: 8 }));
    const reqKwh = (600 * KW_PER_AMP * 8) / 0.9;
    expect(d.integrated.required.kwh).toBeCloseTo(reqKwh, 3);
    expect(cabinetLine(d).quantity).toBe(Math.ceil(reqKwh / 261));
    expect(d.integrated.options.find((o) => o.id === BIG.id).driver).toBe('kwh');
  });

  it('الألواح تشحن الكابينة خلال 4 ساعات مو دفعة وحدة', () => {
    const d = draftOf(opts({ ...small, ampDay: 100, ampNight: 100, nightSupplyHours: 8 }));
    const dayKw = 100 * KW_PER_AMP;
    const nightEnergyKwh = dayKw * 8;                    // الطاقة المسحوبة ليلاً
    const arrayKw = (dayKw + nightEnergyKwh / CHARGE_HOURS) / SUN_EFF;
    expect(d.items.find((i) => i.material_id === 1).quantity)
      .toBe(Math.ceil((arrayKw * 1000) / 650));
  });

  it('قدرة الشحن ما تتجاوز 0.5P من الداتا شيت مهما كبر الطلب', () => {
    // بنك صغير وطلب ليلي ضخم: الشحن ينحدد بنصف سعة البنك مو بالطلب
    const bankKwh = 100;
    const huge = 100000;
    expect(calcChargeKw(huge, bankKwh)).toBe(bankKwh * 0.5);
    expect(calcChargeKw(80, bankKwh)).toBe(80 / CHARGE_HOURS); // الطلب المعقول يمر عادي
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

  it('تصفير الكابينة يشيل بندها من العرض', () => {
    const plain = draftOf(opts(small));
    const price = cabinetLine(plain).subtotal;
    const d = draftOf(opts(small), { extraUnits: { integrated: -99 } });
    expect(cabinetLine(d)).toBeUndefined();
    expect(d.counts.integrated).toBe(0);
    expect(d.total).toBe(plain.total - price);
  });

  it('كل خيار بالمبدّل يجي بقدرته وسعته وعدده وسعره', () => {
    const d = draftOf(opts(small, [BIG, SMALL]));
    const opt = d.integrated.options.find((o) => o.id === BIG.id);
    expect(opt).toMatchObject({ kw: 125, kwh: 261, units: 1, totalPrice: BIG.price });
    expect(d.integrated.options).toHaveLength(2);
  });

  it('القدرة تُحسب بنفس معادلة التحجيم', () => {
    const d = draftOf(opts(small), { extraUnits: { integrated: 1 } }); // كابينتين
    const nightLoadKw = 15 * KW_PER_AMP;
    expect(d.capability.nightHours).toBe(Math.round(((2 * 261 * 0.9) / nightLoadKw) * 10) / 10);
    expect(d.capability.dayAmps).toBe(Math.floor((2 * 125 * 1000) / 220));
    expect(d.capability.chargeHours).toBe(CHARGE_HOURS);
  });

  it('يوقف العرض إذا طلع عدد كابينات غير منطقي (مدخلات غلط)', () => {
    // 300 أمبير ليلاً × 3024 ساعة = طاقة خيالية ← ~1000 كابينة، لازم ينوقف بخطأ واضح
    const d = draftOf(opts({ ...small, ampNight: 300, nightSupplyHours: 3024 }));
    expect(d.errors.integratedCount).toBeTruthy();
    expect(d.errors.integratedCount).toMatch(/غير منطقي/);
    expect(d.errors.integratedCount).toMatch(/3024 ساعة/);
  });

  it('ما يوقف العرض بالأعداد المعقولة', () => {
    const d = draftOf(opts({ ...small, ampNight: 300, nightSupplyHours: 8 }));
    expect(d.errors.integratedCount).toBeUndefined();
    expect(cabinetLine(d).quantity).toBeLessThanOrEqual(20);
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

describe('صفحة الغلاف: صورة الكابينة بدل الستركجر', () => {
  const DESC = 'منظومة تخزين طاقة متكاملة Hoymiles HoyUltra 2 موديل HESS-261-2h، بطاريات LFP بسعة 261 كيلوواط·ساعة (ترتيب 1P52S بسعة 52.25 kWh للحزمة)، مع انفيرتر PCS مدمج ثلاثي الطور بقدرة 125 كيلوواط (أقصى 137.5 كيلوواط).';

  it('يقرأ عدد الكابينات وسعتها وقدرتها من بند العرض', () => {
    const got = integratedFromItems([{ description: DESC, quantity: 3 }]);
    expect(got).toEqual({ units: 3, kwh: 261, kw: 125 });
  });

  it('ما يخلط السعة بالقدرة (52.25 kWh مو قدرة)', () => {
    expect(integratedFromItems([{ description: DESC, quantity: 1 }]).kw).toBe(125);
  });

  it('يرجع null إذا ماكو بند كابينة', () => {
    expect(integratedFromItems([{ description: 'ألواح شمسية 650 واط', quantity: 10 }])).toBeNull();
  });

  it('صفحة الغلاف بوضع الكابينة تعرض السعة والقدرة الكلية بلا ذكر ستركجر', () => {
    const html = buildStructurePageHtml(77, {}, 'data:image/jpeg;base64,AAA', null, { units: 2, kwh: 261, kw: 125 });
    expect(html).toContain('منظومة تخزين متكاملة');
    expect(html).toContain('522'); // 2 × 261 kWh
    expect(html).toContain('250'); // 2 × 125 kW
    expect(html).toContain('77');  // الألواح تبقى مذكورة
    expect(html).not.toContain('ستركجر');
  });

  it('الوضع العادي يبقى ستركجر مثل ما هو', () => {
    const html = buildStructurePageHtml(20, {}, 'data:image/jpeg;base64,AAA');
    expect(html).toContain('ستركجر');
    expect(html).not.toContain('منظومة تخزين متكاملة');
  });
});

describe('بطاقات القدرة بصفحة الغلاف', () => {
  const cap = { nightHours: 9.1, ampNight: 300, dayAmps: 1363, batteries: 8, inverters: 8 };
  it('بوضع الكابينة تكول «الكابينة» مو «البطاريات/الانفيرترات»', () => {
    const html = buildStructurePageHtml(77, {}, 'data:image/jpeg;base64,AAA', cap, { units: 2, kwh: 261, kw: 125 });
    expect(html).toContain('الكابينة تُجهّز');
    expect(html).toContain('الكابينة تتحمل');
    expect(html).not.toContain('البطاريات تُجهّز');
    expect(html).not.toContain('الانفيرترات تتحمل');
  });
  it('بالوضع العادي تبقى مثل ما هي', () => {
    const html = buildStructurePageHtml(20, {}, 'data:image/jpeg;base64,AAA', cap);
    expect(html).toContain('البطاريات تُجهّز');
    expect(html).toContain('الانفيرترات تتحمل');
  });
});

// الاختبار اللي كان ناقص: الرقم المكتوب لازم يثبت حتى لو تغيّر الحساب التلقائي.
// الواجهة كانت تخزّن **الفرق** عن الأساس، فأي تغيير بالأمبيرية يزحزح الرقم.
describe('العدد المثبت يدوياً رقم مطلق مو فرق', () => {
  it('70 لوح تبقى 70 حتى لو تغيّرت الأمبيرية والساعات', () => {
    const a = draftOf(opts({ ...small, ampDay: 100, ampNight: 100, nightSupplyHours: 8 }), { unitCounts: { panel: 70 } });
    const b = draftOf(opts({ ...small, ampDay: 300, ampNight: 300, nightSupplyHours: 5 }), { unitCounts: { panel: 70 } });
    expect(a.counts.panel).toBe(70);
    expect(b.counts.panel).toBe(70);
    // والأساس التلقائي فعلاً اختلف بين الحالتين — يعني الفحص مو فاضي
    expect(a.baseCounts.panel).not.toBe(b.baseCounts.panel);
  });

  it('صفر يشيل الفئة، ورقم للكابينة يثبت هم', () => {
    const d = draftOf(opts(small), { unitCounts: { panel: 0, integrated: 3 } });
    expect(d.items.some((i) => i.material_id === 1)).toBe(false);
    expect(d.counts.integrated).toBe(3);
  });

  it('الفرق القديم (extraUnits) لسه يشتغل للعروض المحفوظة', () => {
    const auto = draftOf(opts(small));
    const d = draftOf(opts(small), { extraUnits: { integrated: 2 } });
    expect(d.counts.integrated).toBe(auto.counts.integrated + 2);
  });

  it('الرقم المطلق يتقدم على الفرق القديم إذا اجتمعا', () => {
    const d = draftOf(opts(small), { unitCounts: { integrated: 5 }, extraUnits: { integrated: 2 } });
    expect(d.counts.integrated).toBe(5);
  });
});

// حارس بنيوي: كل مسارات بناء العرض (معاينة، حفظ، تعديل، تصدير PDF) لازم تمر
// بنفس نقطة الوسائط. الاختلاف بينهن هو اللي خلّى ملف الـPDF يطلع عرضاً مختلفاً
// عن اللي بالشاشة (بلا نوع منظومة ← بطارية وانفيرتر بدل الكابينة وألواح أكثر).
describe('كل مسارات بناء العرض تستعمل نفس الوسائط', () => {
  it('ماكو نداء buildQuoteDraft يبني وسائطه بيده', async () => {
    const fs = await import('node:fs');
    const src = fs.readFileSync(new URL('../src/lib/dataApi.js', import.meta.url), 'utf8');
    const calls = src.match(/buildQuoteDraft\([\s\S]*?\);/g) || [];
    expect(calls.length).toBeGreaterThan(0);
    for (const call of calls) expect(call).toContain('_draftArgs(input)');
  });
});

// حارس: حمولة الحفظ/التصدير بشاشة العرض لازم تحمل كل ما يؤثر بالحساب.
// نقص unitCounts خلّى الشاشة تعرض 70 لوح والملف المطبوع يطلع 216 (الحساب التلقائي).
describe('حمولة الحفظ والتصدير كاملة', () => {
  it('buildBaseInput يمرر نوع المنظومة والأعداد المثبتة والفروق', async () => {
    const fs = await import('node:fs');
    const src = fs.readFileSync(new URL('../src/pages/QuoteBuilder.jsx', import.meta.url), 'utf8');
    const body = src.slice(src.indexOf('function buildBaseInput'), src.indexOf('async function handleSave'));
    for (const key of ['systemType', 'unitCounts', 'extraUnits', 'overrides', 'secondarySelections']) {
      expect(body).toContain(key);
    }
  });
});

// صفحة الغلاف كانت تختفي بعروض معينة لأن ظهورها معلّق على مطابقة كلمات بوصف
// مادة الألواح: بلا كلمة «شمسية»، أو مع كلمة مثل «الهيكل»/«لشحن البطاريات»،
// العدد يطلع صفر فما تنبني الصفحة. الحل: العدد يجي من فئة المادة.
describe('عدد الألواح لصفحة الغلاف ما يعتمد على نص الوصف', () => {
  const fragile = [
    'ألواح 650 واط',                       // بلا كلمة «شمسية»
    'لوح JINKO 650W',
    'ألواح شمسية 650 واط مع الهيكل',
    'ألواح شمسية 650 واط لشحن البطاريات',
  ];

  it('الأوصاف الهشة كانت تطلّع صفراً بالمحلل النصي', async () => {
    const { panelCountFromItems } = await import('../src/lib/structureDiagram.js');
    for (const d of fragile) {
      expect(panelCountFromItems([{ description: d, quantity: 10 }])).toBe(0);
    }
  });

  it('التصدير يمرر العدد صراحةً بدل الاعتماد على المحلل', async () => {
    const fs = await import('node:fs');
    const api = fs.readFileSync(new URL('../src/lib/dataApi.js', import.meta.url), 'utf8');
    const pdf = fs.readFileSync(new URL('../src/lib/pdfExport.js', import.meta.url), 'utf8');
    // العرض المحفوظ: يُحسب من فئة المادة
    expect(api).toMatch(/mat\.category === 'panel'/);
    // تصدير المسودة: من الحساب نفسه
    expect(api).toContain('panelCount: draft.counts?.panel');
    // والتصدير يفضّل الممرَّر على المحلل النصي
    expect(pdf).toContain('panelCountIn != null ? panelCountIn : panelCountFromItems(items)');
  });
});
