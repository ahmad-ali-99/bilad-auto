import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildOptions, buildQuoteDraft } from '../src/lib/quoteService.js';
import { buildPackagesPosterHtml, buildPackageRow, POSTER_W, POSTER_H } from '../src/lib/packagesPoster.js';
import { imageKey, isImageKey, materialIdFromKey, IMAGE_KEY_PREFIX } from '../src/lib/materialImages.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const read = (p) => fs.readFileSync(path.join(HERE, p), 'utf8');
const modal = read('../src/components/PackagesModal.jsx');
const dataApi = read('../src/lib/dataApi.js');
const inventory = read('../src/pages/Inventory.jsx');
const quotes = read('../src/pages/Quotes.jsx');
const form = read('../src/components/MaterialFormModal.jsx');

const SETTINGS = {
  system_voltage: 220, system_efficiency: 0.8, inverter_safety_factor: 1.25, dod: 0.9,
  night_coverage_hours: 8, panel_area_m2: 2.7, currency: 'دينار عراقي',
  quote_number_start: 7400, charge_panels_per_battery: 1.5,
};
const MATERIALS = [
  { id: 1, category: 'panel', brand: 'JINKO', model: 'JINKO 650W', full_description: 'ألواح شمسية 650 واط', unit: 'عدد', watt_or_capacity: 650, price: 185000, qty_per_panel: null },
  { id: 2, category: 'inverter', brand: 'HORIZON', model: 'HZ-ES-C10 6K', full_description: 'انفيرتر هجين 6 كيلو واط', unit: 'عدد', watt_or_capacity: 6000, price: 1500000, qty_per_panel: null },
  { id: 3, category: 'battery', brand: 'HORIZON', model: 'HORIZON 16kWh', full_description: 'بطارية ليثيوم 16kWh', unit: 'عدد', watt_or_capacity: 16, price: 3100000, qty_per_panel: null },
  { id: 4, category: 'secondary', model: 'هيكل', full_description: 'هيكل الألواح مغلون', unit: 'عدد', price: 65000, qty_per_panel: 1 },
];
const LABOR = [{ id: 1, system_amps: 10, price: 400000 }, { id: 2, system_amps: 20, price: 700000 }, { id: 3, system_amps: 30, price: 900000 }];

function rowFor(amp, adjustments = {}) {
  const options = buildOptions({
    materials: MATERIALS, laborTiers: LABOR, settingsRow: SETTINGS,
    roofAreaM2: 0, ampDay: amp, ampNight: amp, nightSupplyHours: 8,
  });
  const draft = buildQuoteDraft(options, { tier: 'economy', overrides: {}, cableMeters: {}, adjustments });
  return { draft, row: buildPackageRow({ draft, materials: MATERIALS, images: { 1: 'data:image/png;base64,AAA' }, ampDay: amp, ampNight: amp }) };
}

describe('صف الباقة يجي من محرك التسعير مو من إدخال يدوي', () => {
  it('الأعداد والموديلات والمجموع كلها من المسودة نفسها', () => {
    const { draft, row } = rowFor(20);
    const panelItem = draft.items.find((i) => i.material_id === 1);
    const batItem = draft.items.find((i) => i.material_id === 3);
    expect(row.panel.count).toBe(panelItem.quantity);
    expect(row.battery.count).toBe(batItem.quantity);
    expect(row.total).toBe(draft.total);
    expect(row.inverter.code).toBe('HZ-ES-C10 6K');
  });

  it('كل ما يزيد الأمبير يزيد عدد الألواح والبطاريات', () => {
    const a = rowFor(10).row;
    const b = rowFor(30).row;
    expect(b.panel.count).toBeGreaterThan(a.panel.count);
    expect(b.battery.count).toBeGreaterThan(a.battery.count);
    expect(b.total).toBeGreaterThan(a.total);
  });

  it('القسط الشهري يطلع من التقسيط، وبلا تقسيط يصير صفراً', () => {
    const off = rowFor(20).row;
    expect(off.monthly).toBe(0);
    const on = rowFor(20, { installment: { enabled: true, plan: 'company', rate: 1.35, months: 60 } }).row;
    expect(on.monthly).toBeGreaterThan(0);
    expect(on.monthly * 60).toBeCloseTo(on.total, -4);
  });

  it('صورة المادة تنركّب بالخلية، واللي بلا صورة تاخذ بديلاً مو صورة مادة ثانية', () => {
    const { row } = rowFor(20);
    expect(row.panel.image).toBe('data:image/png;base64,AAA');   // المادة ١ عدها صورة
    expect(row.battery.image).toBeUndefined();                    // المادة ٣ بلا صورة
    const html = buildPackagesPosterHtml({ packages: [row] });
    expect((html.match(/<img class="shot/g) || []).length).toBe(1);
    expect(html).toContain('noshot');
  });
});

describe('لوحة المنشور', () => {
  it('بالمقاس المطلوب للنشر 1300×1080', () => {
    expect([POSTER_W, POSTER_H]).toEqual([1300, 1080]);
    const html = buildPackagesPosterHtml({ packages: [rowFor(10).row] });
    expect(html).toContain(`width:${POSTER_W}px;height:${POSTER_H}px`);
    expect(html).toContain('overflow:hidden');
  });

  it('عمود القسط الشهري يطلع بس إذا أكو قسط بأي باقة', () => {
    const cash = buildPackagesPosterHtml({ packages: [rowFor(10).row, rowFor(20).row] });
    expect(cash).not.toContain('القسط الشهري');
    expect(cash).toContain('المبلغ الكلي');

    const inst = { installment: { enabled: true, plan: 'company', rate: 1.35, months: 60 } };
    const withInst = buildPackagesPosterHtml({ packages: [rowFor(10, inst).row, rowFor(20, inst).row] });
    expect(withInst).toContain('القسط الشهري');
    expect(withInst).toContain('المبلغ الكلي بالتقسيط');
  });

  it('عدد أعمدة الترويسة يساوي عدد خلايا كل صف — وإلا ينزاح الجدول', () => {
    const inst = { installment: { enabled: true, plan: 'company', rate: 1.35, months: 60 } };
    for (const adj of [{}, inst]) {
      const html = buildPackagesPosterHtml({ packages: [rowFor(10, adj).row, rowFor(20, adj).row] });
      const heads = (html.match(/<th[ >]/g) || []).length;   // مو /<th/ — تلتقط <thead> هم
      const firstRow = html.split('<tbody>')[1].split('</tr>')[0];
      expect((firstRow.match(/<td/g) || []).length).toBe(heads);
    }
  });

  it('الخانة المملوءة صندوق مصمت والفارغة تبقى منقّطة ليكتبها البياع بيده', () => {
    const filled = buildPackagesPosterHtml({ packages: [rowFor(10).row] });
    expect(filled).toContain('class="m-b"');
    const blank = buildPackagesPosterHtml({ packages: [{ ...rowFor(10).row, total: 0 }] });
    expect(blank).toContain('m-b empty');
  });

  it('ماكو نص عربي داخل خانة موجّهة LTR — «واط» تنقلب لمحل غلط', () => {
    const inst = { installment: { enabled: true, plan: 'company', rate: 1.35, months: 60 } };
    const html = buildPackagesPosterHtml({ packages: [rowFor(20, inst).row] });
    const codes = [...html.matchAll(/<div class="sub code">([^<]*)<\/div>/g)].map((m) => m[1]);
    expect(codes.length).toBeGreaterThan(0);
    for (const c of codes) expect(c).not.toMatch(/[؀-ۿ]/);
  });

  it('الضمان الفاضي ما ينطبع سطراً فاضياً', () => {
    const row = rowFor(10).row;
    const html = buildPackagesPosterHtml({ packages: [row], warranty: { panel: '', inverter: '5 سنوات', battery: '' } });
    expect(html).toContain('ضمان الانفيرتر');
    expect(html).not.toContain('ضمان الألواح');
    expect(html).not.toContain('ضمان البطاريات');
  });

  it('بيانات الشركة والعنوان يجون من الملف مو مكتوبين بالكود', () => {
    const html = buildPackagesPosterHtml({
      packages: [rowFor(10).row], title: 'عروض الشتاء',
      company: { company_name: 'شركة الاختبار', phone1: '07700000000', email: 'a@b.c' },
    });
    expect(html).toContain('عروض الشتاء');
    expect(html).toContain('شركة الاختبار');
    expect(html).toContain('07700000000');
  });

  it('النص المُدخل ينهرب — ماكو حقن HTML بالمنشور', () => {
    const html = buildPackagesPosterHtml({ packages: [rowFor(10).row], title: '<script>x</script>' });
    expect(html).not.toContain('<script>x');
    expect(html).toContain('&lt;script&gt;');
  });
});

describe('نافذة الباقات موصولة بالبرنامج نفسه', () => {
  it('تحسب بمسار المعاينة الحقيقي — ماكو محرك تسعير موازٍ', () => {
    expect(modal).toContain('window.api.quotes.preview');
    expect(modal).toContain('window.api.materials.list');
    expect(modal).toContain('window.api.materials.images');
    expect(modal).toContain('buildPackageRow');
  });

  it('تمرّر الأمبير وحالة التقسيط اللي يختارها البياع', () => {
    for (const f of ['ampDay', 'ampNight', 'nightSupplyHours', 'installment', 'installmentPlan']) {
      expect(modal).toContain(f);
    }
  });

  it('تنزّل المنشور بمقاس اللوحة نفسه', () => {
    expect(modal).toContain('exportPosterPng');
    expect(modal).toContain('width: POSTER_W, height: POSTER_H');
  });

  it('زر «منشور باقات» موجود بشاشة العروض', () => {
    expect(quotes).toContain('PackagesModal');
    expect(quotes).toContain('منشور باقات');
  });
});

describe('صور المواد تنخزن بلا أي تعديل ببنية القاعدة', () => {
  it('المفتاح مشتق من رقم المادة ويرجع منه', () => {
    expect(imageKey(12)).toBe(`${IMAGE_KEY_PREFIX}12`);
    expect(isImageKey(imageKey(12))).toBe(true);
    expect(isImageKey('company_profile')).toBe(false);
    expect(materialIdFromKey(imageKey(12))).toBe(12);
    expect(materialIdFromKey('company_profile')).toBe(null);
  });

  it('تنحفظ بـapp_config مو بعمود جديد بجدول المواد', () => {
    expect(dataApi).toContain('setImage');
    expect(dataApi).toContain('getImage');
    expect(dataApi).toContain('images');
    expect(dataApi).toContain('imageKey');
  });

  it('حفظ المادة يفصل الصورة عن الأعمدة — وإلا يفشل الحفظ كله', () => {
    expect(inventory).toContain('const { product_image: image, ...fields }');
    expect(inventory).toMatch(/materials\.update\(editingMaterial\.id, fields\)/);
    expect(inventory).toMatch(/materials\.create\(fields\)/);
    expect(inventory).toContain('materials.setImage');
  });

  it('خانة الصورة موجودة بنموذج المادة وتضغط قبل الحفظ', () => {
    expect(form).toContain('product_image');
    expect(form).toContain('compressImageFile');
  });

  it('الصورة تنمرّر بس إذا تغيّرت — وإلا كل حفظة تسجّل حركة صورة كاذبة', () => {
    expect(form).toContain('loadedImage');
    expect(form).toContain('image === loadedImage.current ? {} : { product_image: image }');
  });
});
