import { describe, it, expect } from 'vitest';
import { buildOptions, buildQuoteDraft } from '../src/lib/quoteService.js';
import { addressBankLabel, installmentPlanLabel } from '../src/lib/installment.js';
import { buildInvoiceInnerHtml } from '../src/lib/invoiceHtml.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const builder = fs.readFileSync(path.join(HERE, '../src/pages/QuoteBuilder.jsx'), 'utf8');
const dataApi = fs.readFileSync(path.join(HERE, '../src/lib/dataApi.js'), 'utf8');

const SETTINGS = {
  system_voltage: 220, system_efficiency: 0.8, inverter_safety_factor: 1.25, dod: 0.9,
  night_coverage_hours: 8, panel_area_m2: 2.7, currency: 'دينار عراقي',
  quote_number_start: 7400, charge_panels_per_battery: 1.5,
};
const MATERIALS = [
  { id: 1, category: 'panel', model: 'JINKO 650', full_description: 'ألواح شمسية 650 واط', unit: 'عدد', watt_or_capacity: 650, price: 185000, qty_per_panel: null },
  { id: 2, category: 'inverter', model: 'HZ 6kW', full_description: 'انفيرتر هجين 6 كيلو واط', unit: 'عدد', watt_or_capacity: 6000, price: 1500000, qty_per_panel: null },
  { id: 3, category: 'battery', model: 'HORIZON 16kWh', full_description: 'بطارية ليثيوم 16kWh', unit: 'عدد', watt_or_capacity: 16, price: 3100000, qty_per_panel: null },
  { id: 4, category: 'secondary', model: 'هيكل', full_description: 'هيكل الألواح مغلون', unit: 'عدد', price: 65000, qty_per_panel: 1 },
];
const LABOR = [{ id: 1, system_amps: 10, price: 400000 }, { id: 2, system_amps: 20, price: 700000 }];

function draft(adjustments) {
  const options = buildOptions({
    materials: MATERIALS, laborTiers: LABOR, settingsRow: SETTINGS,
    roofAreaM2: 60, ampDay: 20, ampNight: 15, nightSupplyHours: 8,
  });
  return buildQuoteDraft(options, { tier: 'economy', overrides: {}, cableMeters: {}, adjustments });
}
const inst = (over = {}) => ({ installment: { enabled: true, rate: 1.35, months: 60, plan: 'company', ...over } });

// قرار المستخدم: نسبة المصرف ما تتوزع على أسعار البنود. البنود تبقى بسعرها
// الطبيعي من المخزون، والنسبة تنضرب على المجموع فقط.
describe('التقسيط: النسبة على المجموع بس — البنود ما تتغيّر', () => {
  it('ولا بند يتغيّر سعره، والمجموع يبقى مجموع الكاش', () => {
    const cash = draft(null);
    const d = draft(inst());
    expect(d.items).toHaveLength(cash.items.length);
    expect(d.items.map((i) => i.unit_price)).toEqual(cash.items.map((i) => i.unit_price));
    expect(d.items.map((i) => i.subtotal)).toEqual(cash.items.map((i) => i.subtotal));
    // مجموع العرض = جمع السطور بالضبط، والزبون يجمع العمود ويطلعله نفس الرقم
    expect(d.total).toBe(d.items.reduce((s, i) => s + i.subtotal, 0));
    expect(d.total).toBe(cash.total);
  });

  it('مجموع التقسيط = المجموع × النسبة', () => {
    const cash = draft(null);
    const d = draft(inst({ rate: 1.35 }));
    expect(d.installment.cashTotal).toBe(cash.total);
    expect(d.installment.totalWithInterest).toBe(Math.round(cash.total * 1.35));
    expect(d.installment.interestAmount).toBe(d.installment.totalWithInterest - cash.total);
    expect(d.installment.interestAmount).toBeGreaterThan(0);
  });

  it('القسط الشهري = المجموع بالفائدة ÷ الأشهر', () => {
    const d = draft(inst({ months: 60 }));
    expect(d.installment.monthly).toBe(Math.round(d.installment.totalWithInterest / 60));
    const d2 = draft(inst({ rate: 1.26, months: 84, plan: 'cbi' }));
    expect(d2.installment.months).toBe(84);
    expect(d2.installment.monthly).toBe(Math.round(d2.installment.totalWithInterest / 84));
  });

  it('اسم المصرف يتبع الخطة — مبادرة البنك المركزي ما ترجع «النهرين»', () => {
    expect(draft(inst()).installment.label).toBe('مصرف النهرين');
    expect(draft(inst({ plan: 'cbi', rate: 1.26, months: 84 })).installment.label).toBe('مبادرة البنك المركزي');
  });

  it('الفائدة تنحسب بعد الزيادة والخصم', () => {
    const withMarkup = draft({ markupPercent: 10, markupMode: 'distributed' });
    const both = draft({ markupPercent: 10, markupMode: 'distributed', ...inst() });
    expect(both.installment.cashTotal).toBe(withMarkup.total);
    expect(both.total).toBe(withMarkup.total);                       // المجموع كاش
    expect(both.installment.totalWithInterest).toBeGreaterThan(withMarkup.total);
  });

  it('بلا تقسيط: البنود والمجموع ما يتغيّرون ولا بدينار (فحص انحدار)', () => {
    const a = draft(null);
    const b = draft({ installment: { enabled: false } });
    expect(b.total).toBe(a.total);
    expect(b.items.map((i) => i.unit_price)).toEqual(a.items.map((i) => i.unit_price));
    expect(b.installment).toBeNull();
  });

  it('نسبة 1 (بلا فائدة) تخلي مجموع التقسيط = الكاش', () => {
    const a = draft(null);
    const d = draft(inst({ rate: 1 }));
    expect(d.items.map((i) => i.unit_price)).toEqual(a.items.map((i) => i.unit_price));
    expect(d.installment.totalWithInterest).toBe(a.total);
    expect(d.installment.interestAmount).toBe(0);
  });
});

describe('ملف الزبون: المجموع الكلي ومجموع التقسيط سوية', () => {
  const base = {
    quote: { quote_number: 300, client_name: 'زبون', total_price: 10000000, created_at: '2026-08-16' },
    items: [{ description: 'لوح', unit: 'عدد', quantity: 10, unit_price: 250000, subtotal: 2500000 }],
    notes: ['ملاحظة'],
    company: { company_name: 'بلاد اوتو' },
  };

  it('بتقسيط: المجموع الكلي ومجموع التقسيط والقسط الشهري — ثلاثتهم', () => {
    const html = buildInvoiceInnerHtml({
      ...base,
      installment: { rate: 1.35, months: 60, totalWithInterest: 13500000, monthly: 225000, plan: 'company', label: 'مصرف النهرين' },
    });
    expect(html).toMatch(/>المجموع الكلي<\/td>/);
    expect(html).toContain('المجموع الكلي بالتقسيط — مصرف النهرين');
    expect(html).toContain('القسط الشهري لمدة 60 شهر');
  });

  it('خطة البنك المركزي تطبع اسمها هي', () => {
    const html = buildInvoiceInnerHtml({
      ...base,
      installment: { rate: 1.26, months: 84, totalWithInterest: 12600000, monthly: 150000, plan: 'cbi', label: 'مبادرة البنك المركزي' },
    });
    expect(html).toContain('مبادرة البنك المركزي');
    expect(html).not.toContain('مصرف النهرين');
  });

  it('بلا تقسيط: سطر «المجموع الكلي» مثل ما هو', () => {
    const html = buildInvoiceInnerHtml({ ...base, installment: null });
    expect(html).toMatch(/>المجموع الكلي<\/td>/);
    expect(html).not.toContain('القسط الشهري');
  });
});

describe('النسبة والأشهر يوصلون لكل مسار — مو بس للشاشة', () => {
  // نداء المعاينة يبني كائنه بالإيد، فحقل جديد ينُسى منه بسهولة والنتيجة:
  // البياع يغيّر النسبة وما يتحرك ولا رقم. هذا الحارس يمنع رجوعها.
  it('نداء المعاينة يمرّر installmentRate و installmentMonths', () => {
    const call = builder.slice(builder.indexOf('.preview({'), builder.indexOf('.then(setPreview)'));
    expect(call).toMatch(/installmentRate: debouncedInputs\.installmentRate/);
    expect(call).toMatch(/installmentMonths: debouncedInputs\.installmentMonths/);
  });

  it('مدخلات الحفظ والتصدير تمررهما هم', () => {
    const fn = builder.slice(builder.indexOf('function buildBaseInput('));
    const body = fn.slice(0, fn.indexOf('\n  }'));
    expect(body).toMatch(/installmentRate/);
    expect(body).toMatch(/installmentMonths/);
  });

  it('الحقلان بـBLANK وبالمسودة — ما يضيعان بالتنقل', () => {
    const blank = builder.slice(builder.indexOf('const BLANK = {'), builder.indexOf('\n};'));
    expect(blank).toMatch(/installmentRate/);
    expect(blank).toMatch(/installmentMonths/);
    const draftState = builder.slice(builder.indexOf('const draftState = {'));
    expect(draftState.slice(0, draftState.indexOf('\n  };'))).toMatch(/installmentRate, installmentMonths/);
  });

  it('العروض الجديدة تنحفظ بلا توزيع — `total_price` سعر كاش', () => {
    expect(dataApi).toContain('distributed: false');
    // إعادة البناء تضرب بالنسبة لمن ما يكون موزّعاً
    expect(dataApi).toContain('distributed ? quote.total_price : Math.round(quote.total_price * rate)');
  });

  it('لقطة العرض المحفوظ تخزن الخطة وعلَم التوزيع — وإلا الاسم والأرقام تطلع غلط', () => {
    const snap = dataApi.slice(dataApi.indexOf('installment: a.installment?.enabled'), dataApi.indexOf('// الزيادة/النقصان اليدوي بالوحدات'));
    expect(snap).toMatch(/plan: a\.installment\.plan === 'cbi'/);
    expect(snap).toMatch(/distributed: true/);
    // وإعادة البناء ما تضرب الفائدة مرتين
    expect(dataApi).toMatch(/const distributed = inst\.distributed === true;/);
    expect(dataApi).toMatch(/distributed \? quote\.total_price : Math\.round\(quote\.total_price \* rate\)/);
  });
});

// ==== إخفاء المجموع الكلي من ملف الزبون ====
// كانت بالشاشة خانتان فارغتان (نسبة وأشهر خاصة بالعرض) نادراً ما تنكتبان، وانشالن.
// محلهن خانة تأشير وحدة: الزبون يشوف القسط الشهري بلا المبلغ الكلي.
// خانة «إخفاء المجموع الكلي» **انشالت** بطلب المستخدم: ما عاد إلها حاجة
// بعد ما صار التصدير يطلّع ثلاث نسخ، والنسخة النقدية تحمل المجموع دائماً.
describe('إخفاء المجموع الكلي انشال', () => {
  it('ماكو أثر إله بأي طبقة', async () => {
    const fs = await import('node:fs');
    for (const f of ['src/pages/QuoteBuilder.jsx', 'src/lib/dataApi.js', 'src/lib/quoteService.js', 'src/lib/invoiceHtml.js']) {
      const src = fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8');
      expect(src, f).not.toContain('hideTotal');
    }
  });

  it('والمجموع الكلي يطلع دائماً بملف الزبون', () => {
    const html = buildInvoiceInnerHtml({
      quote: { quote_number: 300, client_name: 'زبون', total_price: 10000000, created_at: '2026-08-16' },
      items: [{ description: 'لوح', unit: 'عدد', quantity: 10, unit_price: 250000, subtotal: 2500000 }],
      notes: [], company: { company_name: 'بلاد اوتو' },
      installment: { plan: 'company', label: 'مصرف النهرين', months: 60, rate: 1.35,
        cashTotal: 10000000, totalWithInterest: 13500000, monthly: 225000 },
    });
    expect(html).toMatch(/>المجموع الكلي<\/td>/);
  });
});

// ═══ لكل مصرف نسبته ═══
// عرض 464 (المصرف الأهلي): نقداً 10,396,000 وطلع بالتقسيط 14,034,600 —
// يعني 1.35، وهي **نسبة النهرين** مو نسبة الأهلي. السبب: الأهلي كان يقرا
// مفتاح إعدادات النهرين نفسه، وما بالإعدادات قسم للأهلي حتى يغيّرها البياع.
describe('لكل مصرف مفتاح إعداداته ونسبته', () => {
  it('الأهلي يقرا installment_ahli — لا مفتاح النهرين', () => {
    expect(dataApi).toMatch(/ahli:\s*'installment_ahli'/);
  });

  it('والافتراضات منفصلة: النهرين 1.35×60، والأهلي والمبادرة 1.26×84', () => {
    expect(dataApi).toMatch(/cbi:\s*\{\s*rate:\s*1\.26,\s*months:\s*84\s*\}/);
    expect(dataApi).toMatch(/ahli:\s*\{\s*rate:\s*1\.26,\s*months:\s*84\s*\}/);
    expect(dataApi).toMatch(/\|\|\s*\{\s*rate:\s*1\.35,\s*months:\s*60\s*\}/);
  });

  it('**ما يبقى أثر للاستعارة**: ماكو سطر يخلي الأهلي على مفتاح النهرين', () => {
    expect(dataApi).not.toMatch(/plan === 'cbi' \? 'installment_cbi' : 'installment'/);
  });

  it('والإعدادات بيها قسم للأهلي يحفظ installment_ahli', () => {
    const settings = fs.readFileSync(path.join(HERE, '../src/pages/Settings.jsx'), 'utf8');
    expect(settings).toContain("config.set('installment_ahli'");
    expect(settings).toContain("config.get('installment_ahli')");
    expect(settings).toContain('المصرف الأهلي العراقي');
  });

  it('وشاشة العرض ما تقول للبياع إن الأهلي «بنفس نسبة الإعدادات»', () => {
    expect(builder).not.toContain('بنفس نسبة وأشهر الإعدادات');
  });
});

describe('أرقام عرض 464 نفسها', () => {
  const CASH = 10396000;
  const withRate = (rate, months) => ({
    total: Math.round(CASH * rate), monthly: Math.round((CASH * rate) / months),
  });

  it('بنسبة النهرين 1.35 لستين شهراً يطلع 14,034,600 — وهذا اللي صار غلطاً', () => {
    expect(withRate(1.35, 60)).toEqual({ total: 14034600, monthly: 233910 });
  });

  it('وبنسبة الأهلي 1.26 لأربعة وثمانين شهراً يطلع ≈13 مليون مثل ما ينتظره المستخدم', () => {
    const r = withRate(1.26, 84);
    expect(r.total).toBe(13098960);
    expect(r.monthly).toBe(155940);
    expect(Math.round(r.total / 1e6)).toBe(13);
  });

  it('**الأشهر تغيّر القسط لا المجموع**: نفس النسبة بـ60 وبـ84 مجموعها واحد', () => {
    expect(withRate(1.26, 84).total).toBe(withRate(1.26, 60).total);
    expect(withRate(1.26, 84).monthly).toBeLessThan(withRate(1.26, 60).monthly);
  });
});

// ═══ العرض المحفوظ يرجع بخطته هو ═══
// «من كاعد يختارة الحساب يروح لاعدادات النهرين» — مسار العروض المحفوظة كان
// يسحق أي خطة مو 'cbi' لـ'company'، فعرض محفوظ على الأهلي يرجع عند فتحه
// باسم «مصرف النهرين» وبعنونته. نفس السحقة انصلحت بالمحرك وبقت هنا.
describe('فتح عرض محفوظ ما يبدّل مصرفه', () => {
  it('ماكو سحق للخطة بمسار العروض المحفوظة', () => {
    expect(dataApi).not.toMatch(/inst\.plan === 'cbi' \? 'cbi' : 'company'/);
  });

  it('والمسارات كلها تمرر الخطط الثلاث', () => {
    const guards = dataApi.match(/\['cbi', 'ahli'\]\.includes\(/g) || [];
    expect(guards.length).toBeGreaterThanOrEqual(2);   // مسار الإدخال ومسار العرض المحفوظ
  });
});

// ═══ عنونة النسخة الرسمية ═══
describe('مبادرة البنك المركزي تُدار عبر الأهلي', () => {
  it('عنوان الكتاب يروح للمصرف الأهلي العراقي لا لاسم المبادرة', () => {
    expect(addressBankLabel('cbi')).toBe('المصرف الأهلي العراقي');
    expect(addressBankLabel('ahli')).toBe('المصرف الأهلي العراقي');
    expect(addressBankLabel('company')).toBe('مصرف النهرين');
  });

  it('واسم الخطة يبقى مثل ما هو للبياع — العنونة شي والخطة شي', () => {
    expect(installmentPlanLabel('cbi')).toBe('مبادرة البنك المركزي');
    expect(addressBankLabel('cbi')).not.toBe(installmentPlanLabel('cbi'));
  });

  it('والمحرك يخزن العنونة بالملخّص حتى العرض المحفوظ يطبعها صح', () => {
    const d = draft(inst({ plan: 'cbi', rate: 1.26, months: 84 }));
    expect(d.installment.addressee).toBe('المصرف الأهلي العراقي');
    expect(d.installment.label).toBe('مبادرة البنك المركزي');
    expect(d.installment.months).toBe(84);
  });

  it('وشاشة العرض تقرا العنونة من نفس المصدر بدل ما تكتبها بالإيد', () => {
    expect(builder).toContain('addressBankLabel(installmentPlan)');
    expect(builder).not.toContain("installmentPlan === 'cbi' ? 'مبادرة البنك المركزي'");
  });
});
